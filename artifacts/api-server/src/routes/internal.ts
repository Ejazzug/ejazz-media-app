import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, contentItemsTable } from "@workspace/db";
import { getAppConfig } from "../lib/appConfig";
import { parseApprovalDecision } from "../lib/approvals";
import { cardTemplate, cardRatioFromUrl } from "../lib/cardTemplates";

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

export default router;
