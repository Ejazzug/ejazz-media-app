import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, countdownChartStationsTable, countdownChartSnapshotsTable } from "@workspace/db";
import { getAppConfig } from "./appConfig";
import { todayInEat } from "./showSchedule";
import {
  addDays, compactEntries, readCard, rowsToPrune, sameEntries,
  type ChartEntry, type CompactEntries, type CountdownCard,
} from "./countdownChartsCore";
import { logger } from "./logger";

/**
 * Countdown charts: the dashboard's saved countdowns, shown on a station's Radio screen,
 * with a compact daily history behind them.
 *
 * The app never talks to the dashboard. This module reads it (read-only, loopback), keeps
 * its own snapshots, and the public routes serve those -- so a dashboard restart cannot blank
 * the chart on listeners' phones.
 */

const DASHBOARD_COUNTDOWN_CHARTS_URL = "http://127.0.0.1:9000/api/countdown-charts";
const SYNC_EVERY_MS = 15 * 60_000;

export type DashboardCountdown = {
  id: string;
  name: string;
  entries: ChartEntry[];
  /** True while daily_countdown.py is rebuilding it: the playlist is half-filled, so do not snapshot. */
  building: boolean;
  card: CountdownCard | null;
  error?: string;
};

export type Station = "radio" | "xtra";

/** Throws with a readable message when the dashboard cannot be read. */
export async function fetchDashboardCountdowns(): Promise<DashboardCountdown[]> {
  const r = await fetch(DASHBOARD_COUNTDOWN_CHARTS_URL, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = (await r.json()) as { items?: DashboardCountdown[]; error?: string | null };
  if (!Array.isArray(j.items)) throw new Error("unexpected reply");
  return j.items.map((c) => ({
    id: String(c.id),
    name: String(c.name),
    entries: Array.isArray(c.entries) ? c.entries : [],
    building: Boolean(c.building),
    card: readCard(c.card),
    ...(c.error ? { error: String(c.error) } : {}),
  }));
}

/** The newest saved chart on or before a date, or null. */
export async function snapshotOnOrBefore(countdownId: string, date: string) {
  const [row] = await db
    .select()
    .from(countdownChartSnapshotsTable)
    .where(and(eq(countdownChartSnapshotsTable.countdownId, countdownId), lte(countdownChartSnapshotsTable.day, date)))
    .orderBy(desc(countdownChartSnapshotsTable.day))
    .limit(1);
  return row ?? null;
}

/** The first day anything was saved for this countdown, or null. */
export async function firstSavedDay(countdownId: string): Promise<string | null> {
  const [row] = await db
    .select({ day: countdownChartSnapshotsTable.day })
    .from(countdownChartSnapshotsTable)
    .where(eq(countdownChartSnapshotsTable.countdownId, countdownId))
    .orderBy(asc(countdownChartSnapshotsTable.day))
    .limit(1);
  return row?.day ?? null;
}

export type SnapshotResult = "saved" | "unchanged" | "skipped";

/**
 * Save today's chart if it differs from the newest saved one. Skipped (never saved) while
 * the countdown is being rebuilt, on a dashboard error, or when there is nothing on air --
 * a half-built or empty list must never become a day in the history.
 */
export async function snapshotCountdown(c: DashboardCountdown, today: string): Promise<SnapshotResult> {
  if (c.building || c.error) return "skipped";
  const compact = compactEntries(c.entries);
  if (compact.length === 0) return "skipped";
  const latest = await snapshotOnOrBefore(c.id, today);
  if (latest && sameEntries(latest.entries as CompactEntries, compact)) return "unchanged";
  await db
    .insert(countdownChartSnapshotsTable)
    .values({ countdownId: c.id, day: today, entries: compact })
    .onConflictDoUpdate({
      target: [countdownChartSnapshotsTable.countdownId, countdownChartSnapshotsTable.day],
      set: { entries: compact },
    });
  return "saved";
}

/** Delete days older than the retention window, keeping the one row that still answers the days after it. */
export async function pruneSnapshots(keepDays: number, today = todayInEat().date): Promise<number> {
  const cutoff = addDays(today, -keepDays);
  const rows = await db
    .select({ countdownId: countdownChartSnapshotsTable.countdownId, day: countdownChartSnapshotsTable.day })
    .from(countdownChartSnapshotsTable)
    .where(sql`${countdownChartSnapshotsTable.day} < ${cutoff}`);
  const byCountdown = new Map<string, { day: string }[]>();
  for (const r of rows) byCountdown.set(r.countdownId, [...(byCountdown.get(r.countdownId) ?? []), { day: r.day }]);
  let deleted = 0;
  for (const [countdownId, list] of byCountdown) {
    const doomed = rowsToPrune(list, cutoff).map((r) => r.day);
    if (doomed.length === 0) continue;
    await db
      .delete(countdownChartSnapshotsTable)
      .where(and(eq(countdownChartSnapshotsTable.countdownId, countdownId), inArray(countdownChartSnapshotsTable.day, doomed)));
    deleted += doomed.length;
  }
  return deleted;
}

let lastSyncAt = 0;
let syncing = false;

/**
 * Snapshot every assigned countdown, refresh their names, and prune. Cheap no-op when
 * nothing is assigned (no request to the dashboard at all). Returns what happened per
 * countdown so the Control Room and the logs can say so.
 */
export async function syncCountdownCharts(): Promise<{ checked: number; saved: number; error: string | null }> {
  if (syncing) return { checked: 0, saved: 0, error: null };
  syncing = true;
  try {
    const assigned = await db.select().from(countdownChartStationsTable);
    if (assigned.length === 0) return { checked: 0, saved: 0, error: null };
    let dash: DashboardCountdown[];
    try {
      dash = await fetchDashboardCountdowns();
    } catch (err) {
      return { checked: 0, saved: 0, error: err instanceof Error ? err.message : String(err) };
    }
    const today = todayInEat().date;
    let saved = 0;
    for (const a of assigned) {
      const c = dash.find((d) => d.id === a.countdownId);
      if (!c) continue; // removed on the dashboard: keep what we have, change nothing
      if (c.name !== a.name) {
        await db.update(countdownChartStationsTable).set({ name: c.name }).where(eq(countdownChartStationsTable.countdownId, a.countdownId));
      }
      // The card is stored in the same pass that reads the chart -- no second request, no second
      // timer -- and only when it actually changed, so an unchanged card keeps its own timestamp.
      const card = c.card;
      if ((card?.url ?? null) !== a.cardUrl || (card?.caption ?? null) !== a.cardCaption) {
        await db
          .update(countdownChartStationsTable)
          .set({ cardUrl: card?.url ?? null, cardCaption: card?.caption ?? null, cardUpdatedAt: new Date() })
          .where(eq(countdownChartStationsTable.countdownId, a.countdownId));
      }
      if ((await snapshotCountdown(c, today)) === "saved") saved += 1;
    }
    const keep = (await getAppConfig()).charts.keepDays;
    const pruned = await pruneSnapshots(keep, today);
    if (pruned > 0) logger.info({ pruned }, "Pruned old countdown chart days");
    return { checked: assigned.length, saved, error: null };
  } finally {
    syncing = false;
    lastSyncAt = Date.now();
  }
}

/** Called every scheduler tick; does the real work at most every 15 minutes. */
export async function syncCountdownChartsIfDue(): Promise<void> {
  if (Date.now() - lastSyncAt < SYNC_EVERY_MS) return;
  const r = await syncCountdownCharts();
  if (r.error) logger.warn({ reason: r.error }, "Countdown chart sync could not read the dashboard");
  else if (r.saved > 0) logger.info({ saved: r.saved }, "Saved countdown chart snapshot(s)");
}

/**
 * Clear saved history, for one countdown or all. The newest saved chart per countdown is
 * kept and re-dated to today, because it is also what the app shows as "today's chart" --
 * clearing history must not blank the live chart. History then restarts from today.
 */
export async function clearHistory(countdownId?: string): Promise<{ removed: number }> {
  const today = todayInEat().date;
  return db.transaction(async (tx) => {
    const where = countdownId ? eq(countdownChartSnapshotsTable.countdownId, countdownId) : undefined;
    const rows = await tx.select().from(countdownChartSnapshotsTable).where(where);
    const newest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = newest.get(r.countdownId);
      if (!cur || r.day > cur.day) newest.set(r.countdownId, r);
    }
    await tx.delete(countdownChartSnapshotsTable).where(where);
    for (const r of newest.values()) {
      await tx.insert(countdownChartSnapshotsTable).values({ countdownId: r.countdownId, day: today, entries: r.entries });
    }
    return { removed: rows.length - newest.size };
  });
}

/** Rows and bytes stored, overall and per countdown, so the Control Room can show what history costs. */
export async function historyStats() {
  const rows = await db
    .select({
      countdownId: countdownChartSnapshotsTable.countdownId,
      days: sql<number>`count(*)::int`,
      first: sql<string | null>`min(${countdownChartSnapshotsTable.day})::text`,
      last: sql<string | null>`max(${countdownChartSnapshotsTable.day})::text`,
      bytes: sql<number>`coalesce(sum(pg_column_size(${countdownChartSnapshotsTable.entries})), 0)::int`,
    })
    .from(countdownChartSnapshotsTable)
    .groupBy(countdownChartSnapshotsTable.countdownId);
  return rows;
}
