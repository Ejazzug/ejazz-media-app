import { Router, type IRouter } from "express";
import { db, chartAssignmentsTable, countdownChartStationsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getAppConfig } from "../lib/appConfig";
import { firstSavedDay, snapshotOnOrBefore } from "../lib/countdownCharts";
import { expandEntries, isDateString, isViewable, pastDates, type CompactEntries } from "../lib/countdownChartsCore";
import { todayInEat } from "../lib/showSchedule";

const router: IRouter = Router();

function stationOf(value: unknown): "radio" | "xtra" | null {
  return value === "xtra" ? "xtra" : value === "radio" ? "radio" : null;
}

/**
 * Public, device-facing: the charts the operator assigned to a station.
 * GET /api/station-charts?station=radio|xtra
 * Only assigned charts are ever returned -- generating a chart publishes nothing.
 *
 * Two kinds of item, same shape so older apps keep working: saved COUNTDOWNS (today's chart
 * from the newest snapshot, id "cd:<countdown id>", plus the past dates the operator has
 * allowed) and CHARTS generated on the dashboard's Charts page.
 */
router.get("/", async (req, res) => {
  const station = stationOf(req.query.station);
  if (!station) {
    res.status(400).json({ error: "station must be radio or xtra" });
    return;
  }
  try {
    const today = todayInEat().date;
    const cfg = (await getAppConfig()).charts;

    const countdowns = (await db.select().from(countdownChartStationsTable).orderBy(desc(countdownChartStationsTable.assignedAt)))
      .filter((r) => r.stations.includes(station));
    const countdownItems = [];
    for (const c of countdowns) {
      const snap = await snapshotOnOrBefore(c.countdownId, today);
      if (!snap) continue; // assigned but never saved yet: nothing true to show
      const first = await firstSavedDay(c.countdownId);
      countdownItems.push({
        id: "cd:" + c.countdownId,
        kind: "countdown" as const,
        countdownId: c.countdownId,
        title: c.name,
        date: today,
        entries: expandEntries(snap.entries as CompactEntries),
        pastDates: pastDates(cfg, today, first),
      });
    }

    const rows = await db.select().from(chartAssignmentsTable).orderBy(desc(chartAssignmentsTable.assignedAt));
    const generated = rows
      .filter((r) => r.stations.includes(station))
      .slice(0, 10)
      .map((r) => ({ id: r.chartId, title: r.title, date: r.chartDate, entries: r.entries }));

    res.json({ items: [...countdownItems, ...generated] });
  } catch {
    res.status(500).json({ error: "Could not load charts." });
  }
});

/**
 * GET /api/station-charts/past?station=radio|xtra&countdown=<id>&date=YYYY-MM-DD
 * A countdown's chart on an earlier day. Only inside the window the Control Room allows
 * (and never before anything was saved), and only for a countdown assigned to that station.
 */
router.get("/past", async (req, res) => {
  const station = stationOf(req.query.station);
  const countdownId = typeof req.query.countdown === "string" ? req.query.countdown : "";
  const date = req.query.date;
  if (!station || !countdownId || !isDateString(date)) {
    res.status(400).json({ error: "station, countdown and a YYYY-MM-DD date are required" });
    return;
  }
  try {
    const [assignment] = await db.select().from(countdownChartStationsTable).where(eq(countdownChartStationsTable.countdownId, countdownId));
    if (!assignment || !assignment.stations.includes(station)) {
      res.status(404).json({ error: "No such chart." });
      return;
    }
    const today = todayInEat().date;
    const cfg = (await getAppConfig()).charts;
    const first = await firstSavedDay(countdownId);
    if (!isViewable(cfg, today, date, first)) {
      res.status(403).json({ error: "Past charts are not available for that date." });
      return;
    }
    const snap = await snapshotOnOrBefore(countdownId, date);
    if (!snap) {
      res.status(404).json({ error: "No chart was saved for that day." });
      return;
    }
    // A past day never changes, so a short shared cache is safe and spares the database.
    res.set("Cache-Control", "public, max-age=300");
    res.json({ date, title: assignment.name, entries: expandEntries(snap.entries as CompactEntries) });
  } catch {
    res.status(500).json({ error: "Could not load that chart." });
  }
});

export default router;
