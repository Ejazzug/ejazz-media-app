import { Router, type IRouter } from "express";
import { db, showsTable } from "@workspace/db";
import { expandShows, todayInEat } from "../lib/showSchedule";

const router: IRouter = Router();

/**
 * Public programme lineup, device-facing.
 *
 * Returns one row per airing occurrence ({dayOfWeek, startMinute, endMinute}), NOT the
 * stored entries: the shipped app validates every row for a numeric dayOfWeek and drops
 * the whole lineup if one is missing, so the flattening has to happen here. See
 * lib/showSchedule.ts. `?station=radio|xtra` is for newer app builds; omitting it returns
 * both stations, exactly as before.
 */
/**
 * Public: the programme on air right now on a station, from the Control Room line-up
 * (Africa/Kampala time). {show: null} when nothing is scheduled, so a caller leaves the
 * show blank. Used by the lock screen / notification, which cannot run the app's own code
 * while it is in the background.
 * GET /api/shows/on-air?station=radio|xtra
 */
router.get("/on-air", async (req, res) => {
  const station = req.query.station === "xtra" ? "xtra" : req.query.station === "radio" ? "radio" : null;
  if (!station) {
    res.status(400).json({ error: "station must be radio or xtra" });
    return;
  }
  const now = new Date();
  const today = todayInEat(now);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minute = Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
  const items = await db.select().from(showsTable);
  const live = expandShows(items, today).find(
    (r) => r.station === station && r.dayOfWeek === today.dayOfWeek && r.startMinute <= minute && minute < r.endMinute,
  );
  res.json({ show: live ? live.name : null });
});

router.get("/", async (req, res) => {
  const items = await db.select().from(showsTable).orderBy(showsTable.dayOfWeek, showsTable.startMinute);
  const rows = expandShows(items);
  const station = typeof req.query.station === "string" ? req.query.station : "";
  res.json(station === "radio" || station === "xtra" ? rows.filter((r) => r.station === station) : rows);
});

export default router;
