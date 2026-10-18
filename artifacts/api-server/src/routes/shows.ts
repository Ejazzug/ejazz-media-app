import { Router, type IRouter } from "express";
import { db, showsTable } from "@workspace/db";
import { expandShows } from "../lib/showSchedule";

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
router.get("/", async (req, res) => {
  const items = await db.select().from(showsTable).orderBy(showsTable.dayOfWeek, showsTable.startMinute);
  const rows = expandShows(items);
  const station = typeof req.query.station === "string" ? req.query.station : "";
  res.json(station === "radio" || station === "xtra" ? rows.filter((r) => r.station === station) : rows);
});

export default router;
