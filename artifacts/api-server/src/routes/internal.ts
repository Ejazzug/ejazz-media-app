import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db, contentItemsTable, songFactsTable, type SongFact } from "@workspace/db";
import { getAppConfig } from "../lib/appConfig";
import { parseApprovalDecision } from "../lib/approvals";
import { cardTemplate, cardRatioFromUrl } from "../lib/cardTemplates";
import { createCard } from "../lib/cardCreate";
import { artistKey, factCounts, rephraseFact, sweepTrack, titleKey, wordings } from "../lib/songFacts";
import { cleanDestination, describeDestination } from "../lib/destinations";

const router: IRouter = Router();

/**
 * Loopback-only, read-only metrics for the dashboard's command centre.
 *
 * WHY THIS PATH: ejazz-proxy forwards a fixed list of prefixes to this service
 * (/api/admin/, /api/shows, /api/notifications ...). `/api/internal/` is NOT on
 * that list, so a request for it off the tunnel never reaches here at all -- it
 * falls through to the Flask dashboard and 404s. That is the primary gate, and
 * it is why this route is not under /api/admin/, which IS forwarded and would
 * then need the admin session cookie the Flask app has no way to mint.
 *
 * The guard below is the belt to that braces, and it is the same reasoning as
 * app.py's _is_local_call(): nginx sets X-Forwarded-For / X-Real-IP on
 * everything it proxies, so their ABSENCE is the trustworthy signal. A forged
 * header can only make a caller look more remote than it is, never more local.
 * The value of either header is never trusted, and neither is remote_addr on
 * its own -- the proxy is on loopback too.
 *
 * ONE thing here writes, and only one: the approval decision on a card. It is
 * here rather than under /api/admin/ because the dashboard is the approval
 * centre -- lib/content_os.py holds the per-kind policy and lib/roles.py's
 * require() decides who may approve -- and Flask has no way to mint the admin
 * session cookie /api/admin/ wants. The approval columns are deliberately
 * omitted from the content CRUD schema, so this is the ONLY door they move
 * through, and a card cannot approve itself with a PATCH.
 *
 * Nothing else here writes, and nothing here returns anything an operator could
 * not already see in the Control Room.
 */
function requireLocal(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) {
    res.status(403).json({ error: "loopback only" });
    return;
  }
  const addr = req.socket.remoteAddress || "";
  if (!(addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1")) {
    res.status(403).json({ error: "loopback only" });
    return;
  }
  next();
}

router.use(requireLocal);

/**
 * GET /api/internal/metrics
 *
 * One row of numbers per thing the command centre shows for the app. Every
 * count is a live query -- there is no cache here, because the dashboard
 * already caches this section for 30 seconds on its side.
 */
router.get("/metrics", async (_req, res) => {
  try {
    const [content] = await db.execute<{
      total: number; live: number; draft: number; scheduled: number; pushed: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'live')::int as live,
        count(*) filter (where status = 'draft')::int as draft,
        count(*) filter (where schedule_at is not null and push_sent_at is null)::int as scheduled,
        count(*) filter (where push_sent_at is not null)::int as pushed
      from content_items
    `).then((r) => r.rows);

    const [push] = await db.execute<{
      total: number; last7: number; last24: number; retracted: number;
      last_at: string | null; last_title: string | null;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where sent_at > now() - interval '7 days')::int as last7,
        count(*) filter (where sent_at > now() - interval '24 hours')::int as last24,
        count(*) filter (where retracted_at is not null)::int as retracted,
        max(sent_at)::text as last_at,
        (select title from notifications order by sent_at desc limit 1) as last_title
      from notifications
    `).then((r) => r.rows);

    // 0 rows in notifications normally means an operator cleared the log, not
    // that nothing was ever sent -- the sequence is the only way to tell.
    const [seq] = await db.execute<{ ever: number }>(sql`
      select coalesce((select last_value from notifications_id_seq), 0)::int as ever
    `).then((r) => r.rows);

    const [shows] = await db.execute<{ entries: number; hosts: number }>(sql`
      select
        (select count(*) from shows)::int as entries,
        (select count(*) from hosts)::int as hosts
    `).then((r) => r.rows);

    const [facts] = await db.execute<{ total: number; enabled: number }>(sql`
      select count(*)::int as total, count(*) filter (where enabled)::int as enabled from song_facts
    `).then((r) => r.rows);

    const [charts] = await db.execute<{ stations: number; snapshots: number }>(sql`
      select
        (select count(*) from countdown_chart_stations)::int as stations,
        (select count(*) from countdown_chart_snapshots)::int as snapshots
    `).then((r) => r.rows);

    // Per-day push counts for the last fortnight, for a sparkline on the
    // dashboard. Days with no sends are absent rather than zeroed -- the
    // caller knows the window it asked for.
    const daily = await db.execute<{ day: string; sends: number }>(sql`
      select to_char(sent_at at time zone 'Africa/Kampala', 'YYYY-MM-DD') as day,
             count(*)::int as sends
      from notifications
      where sent_at > now() - interval '14 days'
      group by 1 order by 1
    `).then((r) => r.rows);

    const config = await getAppConfig();
    const requestWindow =
      `radio ${config.songRequests.radioEnabled ? "on" : "off"}, ` +
      `xtra ${config.songRequests.xtraEnabled ? "on" : "off"}`;

    res.json({
      content_items: content?.total ?? 0,
      content_live: content?.live ?? 0,
      content_draft: content?.draft ?? 0,
      content_scheduled: content?.scheduled ?? 0,
      content_pushed: content?.pushed ?? 0,
      pushes_total: push?.total ?? 0,
      pushes_7d: push?.last7 ?? 0,
      pushes_24h: push?.last24 ?? 0,
      pushes_retracted: push?.retracted ?? 0,
      pushes_ever: seq?.ever ?? 0,
      last_push: push?.last_at ?? null,
      last_push_title: push?.last_title ?? null,
      pushes_by_day: daily,
      shows: shows?.entries ?? 0,
      hosts: shows?.hosts ?? 0,
      song_facts: facts?.total ?? 0,
      song_facts_enabled: facts?.enabled ?? 0,
      chart_stations: charts?.stations ?? 0,
      chart_snapshots: charts?.snapshots ?? 0,
      maintenance: config.maintenance.enabled,
      banner_live: config.banner.enabled,
      featured_live: config.featured.enabled,
      fun_facts_enabled: config.funFacts.enabled,
      request_window: requestWindow,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "metrics failed" });
  }
});

/* ------------------------------------------------------------------ App Cards
 *
 * What the dashboard's /approvals needs: the cards, and a door for the decision.
 * The queue is cards only -- every other kind the dashboard approves lives in its
 * own JSON stores on that side, and the ones that live here (facts, polls,
 * announcements) are managed in the Control Room, which has no gate.
 */

/** A card as the dashboard shows it. The picture is the signed path the app uses, so the
 *  approvals page and the phone are looking at the same render and not two guesses. */
function forDashboard(row: typeof contentItemsTable.$inferSelect) {
  const template = cardTemplate(row.templateId);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    image_url: row.imageUrl,
    template_id: row.templateId,
    template_name: template?.name ?? null,
    // A row whose template has left the catalogue is reported, never hidden: its picture
    // still renders, and an operator deciding on it should know it cannot be re-made.
    template_known: Boolean(template),
    fields: row.templateFields ?? {},
    ratio: cardRatioFromUrl(row.imageUrl),
    placement: row.placement,
    status: row.status,
    approval_state: row.approvalState,
    approval_note: row.approvalNote,
    approval_by: row.approvalBy,
    approval_at: row.approvalAt,
    push_enabled: row.pushEnabled,
    push_topic: row.pushTopic,
    push_sent_at: row.pushSentAt,
    schedule_at: row.scheduleAt,
    start_at: row.startAt,
    end_at: row.endAt,
    // THE TWO QUESTIONS AN OPERATOR ASKS (owner, 2026-11-22: "i need to be able to see which
    // card have been sent", and an expiry to go with it). "Sent" is about the push, which
    // cannot be taken back. "Showing" is whether a phone asking right now would be served
    // this card -- a different thing, and the one an expiry changes.
    dest: row.dest ?? "",
    dest_label: describeDestination(row.dest ?? ""),
    expired: Boolean(row.endAt && row.endAt.getTime() < Date.now()),
    showing:
      row.status === "live" &&
      row.approvalState === "approved" &&
      (!row.startAt || row.startAt.getTime() <= Date.now()) &&
      (!row.endAt || row.endAt.getTime() >= Date.now()),
    created_by: row.createdBy,
    created_at: row.createdAt,
  };
}

/**
 * GET /api/internal/cards[?state=pending]
 *
 * Newest first. `counts` is over ALL cards whatever the filter asks for, so a page showing
 * only what is waiting can still say how much else there is without a second call.
 */
router.get("/cards", async (req, res) => {
  try {
    const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
    const where = state
      ? and(eq(contentItemsTable.type, "card"), eq(contentItemsTable.approvalState, state))
      : eq(contentItemsTable.type, "card");
    const rows = await db.select().from(contentItemsTable)
      .where(where).orderBy(desc(contentItemsTable.createdAt));

    const [counts] = await db.execute<{
      total: number; pending: number; approved: number; rejected: number; live: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where approval_state = 'pending')::int as pending,
        count(*) filter (where approval_state = 'approved')::int as approved,
        count(*) filter (where approval_state = 'rejected')::int as rejected,
        count(*) filter (where status = 'live')::int as live
      from content_items where type = 'card'
    `).then((r) => r.rows);

    res.json({
      state: state || null,
      counts: counts ?? { total: 0, pending: 0, approved: 0, rejected: 0, live: 0 },
      items: rows.map(forDashboard),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "cards failed" });
  }
});

/**
 * POST /api/internal/cards/:id/approval -- {state, by, note?}
 *
 * Records the decision and nothing else. It does NOT publish an approved card and does not
 * withdraw a rejected one: publishing is the schedule's job, and a rejection already keeps a
 * card off every phone because GET /api/content/active requires approval_state = 'approved'.
 * Keeping the two apart is what lets a card be approved today and scheduled for Friday.
 */
router.post("/cards/:id/approval", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const { decision, error } = parseApprovalDecision(req.body);
  if (!decision) { res.status(400).json({ error }); return; }
  try {
    const [row] = await db.select().from(contentItemsTable).where(eq(contentItemsTable.id, id));
    if (!row || row.type !== "card") { res.status(404).json({ error: "No such card." }); return; }
    const [item] = await db.update(contentItemsTable).set({
      approvalState: decision.state,
      approvalNote: decision.note,
      approvalBy: decision.by,
      approvalAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(contentItemsTable.id, id)).returning();
    res.json({ ok: true, was: row.approvalState, card: forDashboard(item) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "the decision was not saved" });
  }
});

// ---------------------------------------------------------------- song facts
//
// The dashboard's repurpose hub and its library sweep reach the fact store through here, and
// lib/song_facts.py is the only thing on that side that calls them. Why this prefix and not
// /api/admin/: the same reason the card approval lives here -- /api/internal/ is not forwarded
// by ejazz-proxy, so it is unreachable off the tunnel, while /api/admin/ would need the admin
// session cookie Flask has no way to mint.
//
// Note what is NOT here: no delete, and no way to switch on a fact that has not been
// proofread. The facts section in the Control Room stays where a person edits or removes one.

/** The shape the dashboard reads. `pushed_at` is the hub tray's whole contract. */
function factForDashboard(row: SongFact) {
  return {
    id: row.id,
    artist: row.artist,
    title: row.title,
    artist_key: row.artistKey,
    title_key: row.titleKey,
    body: row.body,
    source: row.source,
    enabled: row.enabled,
    proof_state: row.proofState,
    proof_notes: row.proofNotes,
    pushed_at: row.pushedAt ? row.pushedAt.toISOString() : null,
    retry_after: row.retryAfter ? row.retryAfter.toISOString() : null,
    sources: row.sources ?? [],
    // Every wording, `body` first -- what the CSV export turns into one row each, and what
    // the facts section counts when it says how many a song has.
    wordings: wordings(row),
    variants: row.variants ?? [],
    created_at: row.createdAt ? row.createdAt.toISOString() : null,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/**
 * GET /api/internal/song-facts[?pushed=1][&state=live|held|none][&limit=]
 *
 * `pushed=1` is what the hub's tray asks for: facts a person sent over from the facts section.
 * `counts` is over the whole store whatever the filter says, so a page showing one slice can
 * still report the rest without a second call.
 */
router.get("/song-facts", async (req, res) => {
  try {
    const wants = (key: string) => (typeof req.query[key] === "string" ? String(req.query[key]).trim() : "");
    const state = wants("state");
    const limit = Math.min(Math.max(Number(wants("limit")) || 500, 1), 2000);
    const filters = [];
    if (wants("pushed") === "1") filters.push(isNotNull(songFactsTable.pushedAt));
    if (state === "live") filters.push(and(eq(songFactsTable.enabled, true), ne(songFactsTable.body, "")));
    if (state === "held") filters.push(and(eq(songFactsTable.enabled, false), ne(songFactsTable.body, "")));
    if (state === "none") filters.push(eq(songFactsTable.body, ""));

    const rows = await db.select().from(songFactsTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(songFactsTable.updatedAt))
      .limit(limit);
    res.json({ counts: await factCounts(), items: rows.map(factForDashboard) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "song facts failed" });
  }
});

/**
 * POST /api/internal/song-facts/generate -- {artist, title, hold?}
 *
 * One song, one answer, and the answer says WHY. The caps, the markers, the provider choice
 * and the writer are all the ones `factForTrack()` uses -- `sweepTrack()` only reports which
 * rule applied, so a sweep cannot report a song as dull when the budget is simply spent.
 *
 * `hold` defaults to true: a swept fact is written disabled and waits for the dashboard's
 * proofread to PATCH a verdict back. Nothing here can put an unproofread fact under the
 * player.
 */
router.post("/song-facts/generate", async (req, res) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const artist = typeof b.artist === "string" ? b.artist : "";
  const title = typeof b.title === "string" ? b.title : "";
  if (!artist.trim()) { res.status(400).json({ error: "An artist is required." }); return; }
  try {
    const result = await sweepTrack(artist, title, { hold: b.hold !== false });
    res.json({
      ok: true,
      outcome: result.outcome,
      message: result.message,
      fact: result.fact ? factForDashboard(result.fact) : null,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "generation failed" });
  }
});

/**
 * POST /api/internal/song-facts/import -- facts written somewhere else, coming back in.
 *
 * The round trip this serves: export the library as a CSV with an empty `fact` column, fill
 * it in by hand or with another tool, upload it here. It exists because the station's own
 * generator cannot always answer -- on 2026-11-18 the search-grounding quota was exhausted
 * and the ungrounded model returned NONE for everything.
 *
 * **It only ever ADDS or UPDATES.** That is the whole reason this is not the existing sheet
 * sync: `syncSheet()` treats the sheet as the source of truth and DELETES any fact missing
 * from it, so uploading one batch of forty would wipe the other hundred and sixty. Nothing
 * here deletes anything.
 *
 * Rows land as `source: "manual"` and `proof_state: "human"` -- a person chose these words,
 * whatever helped them write it -- which is exactly what protects them from being overwritten
 * later by the generator or by a sheet sync.
 */
router.post("/song-facts/import", async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) { res.status(400).json({ error: "No rows." }); return; }
  if (rows.length > 2000) { res.status(400).json({ error: "More than 2000 rows." }); return; }

  const str = (v: unknown, max: number) =>
    (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  let added = 0, updated = 0, skipped = 0, held = 0;
  const problems: string[] = [];

  // Several rows for the same song are several WORDINGS of it, not a row overwriting itself.
  // That is how a spreadsheet says "this song has three facts": three lines with the same
  // artist and title. Without this the last line simply won the race and the other two were
  // silently lost.
  const grouped = new Map<string, { artist: string; title: string; bodies: string[]; enabled: boolean; notes: string }>();
  for (const raw of rows) {
    const r = (raw || {}) as Record<string, unknown>;
    const artist = str(r.artist, 120);
    const title = str(r.title, 120);
    const factBody = str(r.body ?? r.fact, 400);
    const ak = artistKey(artist);
    if (!ak || factBody.length < 10) { skipped++; continue; }
    const tk = titleKey(title);
    const key = `${ak}|${tk}`;
    const entry = grouped.get(key);
    if (entry) {
      if (!entry.bodies.some((b) => b.toLowerCase() === factBody.toLowerCase())) {
        entry.bodies.push(factBody);
      }
      // A song is held if ANY of its wordings was held: the held one must not be shown.
      if (r.enabled === false) entry.enabled = false;
      if (!entry.notes) entry.notes = str(r.proof_notes, 2000);
    } else {
      grouped.set(key, {
        artist, title, bodies: [factBody],
        enabled: r.enabled !== false, notes: str(r.proof_notes, 2000),
      });
    }
  }

  for (const [key, g] of grouped) {
    const [ak, tk] = key.split("|");
    const artist = g.artist, title = g.title;
    const factBody = g.bodies[0];
    const enabled = g.enabled;
    if (!enabled) held++;
    const values = {
      artistKey: ak, titleKey: tk, artist, title, body: factBody,
      source: "manual", enabled,
      proofState: "human", proofNotes: g.notes,
      retryAfter: null,
      variants: g.bodies.slice(1, 5),
    };
    try {
      const existing = await db.select({ id: songFactsTable.id }).from(songFactsTable)
        .where(and(eq(songFactsTable.artistKey, ak), eq(songFactsTable.titleKey, tk))).limit(1);
      await db.insert(songFactsTable).values(values).onConflictDoUpdate({
        target: [songFactsTable.artistKey, songFactsTable.titleKey],
        set: { ...values, updatedAt: new Date() },
      });
      if (existing.length) updated++; else added++;
    } catch (error) {
      skipped++;
      if (problems.length < 5) {
        problems.push(`${artist} - ${title}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }
  res.json({ ok: true, added, updated, skipped, held, problems, counts: await factCounts() });
});

/**
 * POST /api/internal/song-facts/:id/rephrase -- more wordings for one fact.
 *
 * The dashboard's bulk pass calls this once per fact rather than asking for a batch, so a
 * run can stop in the middle without leaving half a reply unaccounted for, and so one
 * refusal is reported against the fact it belongs to.
 */
router.post("/song-facts/:id/rephrase", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const wantRaw = Number((req.body as Record<string, unknown> | undefined)?.want);
  const want = Number.isFinite(wantRaw) ? Math.max(1, Math.min(4, Math.trunc(wantRaw))) : 2;
  try {
    res.json(await rephraseFact(id, want));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "rephrase failed" });
  }
});

/**
 * PATCH /api/internal/song-facts/:id -- the proofread verdict coming back, and the hub flag.
 *
 * The dashboard runs the three proofread passes (the deterministic clean-up, grounding.py's
 * quote check, then the wording pass) because grounding.py lives on that side, and sends the
 * result here. `enabled` is included deliberately: a fact that passed goes live, and one whose
 * quote could not be verified stays held with the reason in `proof_notes` for a person.
 *
 * `source` is NOT touched. A proofread AI fact is still an AI fact -- `proof_state` is what
 * records that something read it -- and only a person typing in the facts section makes a row
 * 'manual'.
 */
router.patch("/song-facts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const b = (req.body || {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const proofState = str(b.proof_state, 16);
  if (proofState && !["auto", "human"].includes(proofState)) {
    res.status(400).json({ error: "proof_state must be auto or human." });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.body === "string") {
    const body = str(b.body, 400);
    if (body && body.length < 10) {
      res.status(400).json({ error: "A fact of at least 10 characters is required." });
      return;
    }
    patch.body = body;
  }
  if (proofState) patch.proofState = proofState;
  if (typeof b.proof_notes === "string") patch.proofNotes = str(b.proof_notes, 2000);
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (b.pushed === true) patch.pushedAt = new Date();
  if (b.pushed === false) patch.pushedAt = null;
  // An empty body is a "no fact" marker, and a marker must never be switched on.
  if (patch.body === "") patch.enabled = false;

  try {
    const [row] = await db.update(songFactsTable).set(patch)
      .where(eq(songFactsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "No such fact." }); return; }
    res.json({ ok: true, fact: factForDashboard(row) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "the fact was not saved" });
  }
});

/**
 * POST /api/internal/cards -- the hub sending something to the app.
 *
 * The same `createCard()` the Control Room's own door uses, so the approval gate, the signed
 * picture and the push choke point stay one implementation. A caller that leaves `status`
 * alone gets a draft, which sends no push: the hub asks for 'live' only when an operator has
 * chosen "publish now" and confirmed it.
 */
router.post("/cards", async (req, res) => {
  try {
    const outcome = await createCard(req.body);
    if (!outcome.ok) {
      res.status(outcome.status).json({
        error: outcome.error,
        ...(outcome.problems ? { problems: outcome.problems } : {}),
        ...(outcome.detail ? { detail: outcome.detail } : {}),
      });
      return;
    }
    res.status(201).json({
      ok: true,
      card: forDashboard(outcome.row as never),
      ratio: outcome.ratio,
      pushDelivery: outcome.pushDelivery,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "the card was not made" });
  }
});

/**
 * PATCH /api/internal/cards/:id -- the two things an operator changes AFTER a card exists:
 * when it stops showing, and where a tap goes.
 *
 * Deliberately narrow. The words and the picture of a card that is already on phones are not
 * editable here, because a card is keyed by what it says: changing it in place would rewrite
 * something people have already seen. Everything else about the row -- its approval, its
 * push, its schedule -- has its own endpoint, for the same reason.
 *
 * `end_at: null` clears an expiry. An expiry in the past is accepted on purpose: it is how an
 * operator takes a card off every phone at once, which is the honest version of "delete" for
 * something that has already been delivered.
 */
router.patch("/cards/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "A card id is a whole number." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("end_at" in body) {
    const raw = body.end_at;
    if (raw === null || raw === "") {
      patch.endAt = null;
    } else {
      const when = new Date(String(raw));
      if (Number.isNaN(when.getTime())) {
        res.status(400).json({ error: "That expiry is not a date the server understands." });
        return;
      }
      patch.endAt = when;
    }
  }

  if ("dest" in body) {
    const raw = String(body.dest ?? "").trim();
    if (raw && !cleanDestination(raw)) {
      res.status(400).json({ error: "That tap destination is not one the app can open." });
      return;
    }
    patch.dest = cleanDestination(raw);
  }

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: "Nothing to change: send end_at, dest, or both." });
    return;
  }
  patch.updatedAt = new Date();

  try {
    const [row] = await db.update(contentItemsTable)
      .set(patch)
      .where(and(eq(contentItemsTable.id, id), eq(contentItemsTable.type, "card")))
      .returning();
    if (!row) {
      res.status(404).json({ error: "No such card." });
      return;
    }
    res.json({ ok: true, card: forDashboard(row) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "the card was not changed" });
  }
});

export default router;
