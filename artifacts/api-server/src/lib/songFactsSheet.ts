import { inArray, ne } from "drizzle-orm";
import { db, songFactsTable } from "@workspace/db";
import { artistKey, titleKey } from "./songFacts";
import { getAppConfig } from "./appConfig";
import { logger } from "./logger";

/**
 * Facts from a Google Sheet, so another tool can fill the sheet and this system uses the
 * rows without spending any AI quota.
 *
 * Expected columns (header row required, any order, names case-insensitive):
 *   artist | title (or song) | fact (or body)
 * A row with a blank title is an artist-level fact. The sheet is the source of truth for the
 * facts it supplies: rows that disappear from it are removed on the next sync. Facts typed
 * in the Control Room (source 'manual') are never touched, and a sheet fact replaces an AI
 * one for the same song.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const SYNC_EVERY_MS = 60 * 60 * 1000;

export type SheetSyncResult = {
  at: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  message: string;
};

let lastResult: SheetSyncResult | null = null;
let lastAttemptAt = 0;
let syncing = false;

export function lastSheetSync(): SheetSyncResult | null {
  return lastResult;
}

/** Only Google Sheets over https: the URL is fetched server-side, so it must not be a way to reach anything else. */
export function validateSheetUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "That is not a valid link.";
  }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") {
    return "Use a Google Sheets link (https://docs.google.com/...).";
  }
  if (!u.pathname.startsWith("/spreadsheets/")) return "Use a Google Sheets link.";
  return null;
}

/** A shared sheet link is turned into its CSV export; a published-to-web CSV link is used as is. */
export function toCsvUrl(raw: string): string {
  const u = new URL(raw);
  if (u.searchParams.get("output") === "csv" || u.searchParams.get("format") === "csv") return u.toString();
  const m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)\/(?!e\/)/);
  if (m && m[1] !== "e") {
    const out = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export`);
    out.searchParams.set("format", "csv");
    const gid = u.searchParams.get("gid") ?? new URLSearchParams(u.hash.replace(/^#/, "")).get("gid");
    if (gid) out.searchParams.set("gid", gid);
    return out.toString();
  }
  return u.toString();
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const clean = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function syncSheet(rawUrl: string): Promise<SheetSyncResult> {
  const fail = (message: string): SheetSyncResult => ({ at: new Date().toISOString(), ok: false, added: 0, updated: 0, removed: 0, skipped: 0, message });
  const bad = validateSheetUrl(rawUrl);
  if (bad) return (lastResult = fail(bad));
  if (syncing) return fail("A sync is already running.");
  syncing = true;
  try {
    const response = await fetch(toCsvUrl(rawUrl), { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return (lastResult = fail(`Google answered HTTP ${response.status}. Is the sheet shared as "anyone with the link can view", or published to the web as CSV?`));
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) return (lastResult = fail("The sheet is larger than 2 MB."));
    if (/^\s*<(!doctype|html)/i.test(text)) {
      return (lastResult = fail("Google returned a web page, not CSV. Share the sheet as \"anyone with the link can view\" or publish it to the web as CSV."));
    }
    const rows = parseCsv(text);
    if (rows.length < 2) return (lastResult = fail("The sheet has no rows under the header."));
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const ia = col(["artist", "artists"]);
    const it = col(["title", "song", "track"]);
    const ifact = col(["fact", "body", "text"]);
    if (ia < 0 || ifact < 0) return (lastResult = fail('The header row needs an "artist" column and a "fact" column (and optionally "title").'));
    if (rows.length - 1 > MAX_ROWS) return (lastResult = fail(`More than ${MAX_ROWS} rows.`));

    // Dedupe on the matching key: the last row for a song wins.
    const wanted = new Map<string, { artist: string; title: string; body: string; ak: string; tk: string }>();
    let skipped = 0;
    for (const r of rows.slice(1)) {
      const artist = clean(r[ia], 120);
      const title = it >= 0 ? clean(r[it], 120) : "";
      const body = clean(r[ifact], 400);
      const ak = artistKey(artist);
      if (!ak || body.length < 10) {
        skipped++;
        continue;
      }
      const tk = titleKey(title);
      wanted.set(`${ak}|${tk}`, { artist, title, body, ak, tk });
    }

    const existing = await db.select().from(songFactsTable);
    const byKey = new Map(existing.map((e) => [`${e.artistKey}|${e.titleKey}`, e]));
    let added = 0;
    let updated = 0;
    for (const [key, w] of wanted) {
      const cur = byKey.get(key);
      if (cur?.source === "manual") {
        skipped++; // typed in the Control Room: never overwritten
        continue;
      }
      if (cur && cur.source === "sheet" && cur.body === w.body && cur.enabled) continue;
      await db
        .insert(songFactsTable)
        .values({ artistKey: w.ak, titleKey: w.tk, artist: w.artist, title: w.title, body: w.body, source: "sheet", enabled: true })
        .onConflictDoUpdate({
          target: [songFactsTable.artistKey, songFactsTable.titleKey],
          set: { artist: w.artist, title: w.title, body: w.body, source: "sheet", enabled: true, updatedAt: new Date() },
          setWhere: ne(songFactsTable.source, "manual"),
        });
      if (cur) updated++;
      else added++;
    }
    // Facts this sheet supplied earlier and no longer lists.
    const gone = existing.filter((e) => e.source === "sheet" && !wanted.has(`${e.artistKey}|${e.titleKey}`)).map((e) => e.id);
    if (gone.length) await db.delete(songFactsTable).where(inArray(songFactsTable.id, gone));

    return (lastResult = {
      at: new Date().toISOString(),
      ok: true,
      added,
      updated,
      removed: gone.length,
      skipped,
      message: `Synced ${wanted.size} facts from the sheet.`,
    });
  } catch (err) {
    logger.error({ err: String(err) }, "song facts sheet sync failed");
    return (lastResult = fail("Could not read the sheet: " + (err instanceof Error ? err.message : String(err))));
  } finally {
    syncing = false;
    lastAttemptAt = Date.now();
  }
}

/** Scheduler hook: re-sync hourly when a sheet is linked. A no-op (one config read) otherwise. */
export async function syncSheetIfDue(): Promise<void> {
  if (Date.now() - lastAttemptAt < SYNC_EVERY_MS) return;
  const config = await getAppConfig();
  if (!config.songFacts.sheetUrl) return;
  const result = await syncSheet(config.songFacts.sheetUrl);
  if (!result.ok) logger.warn({ message: result.message }, "song facts sheet sync did not complete");
}
