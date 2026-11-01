import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAppConfig } from "../lib/appConfig";

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
 * Nothing here writes, and nothing here returns anything an operator could not
 * already see in the Control Room.
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

export default router;
