import { Router, type IRouter } from "express";
import { db, chartAssignmentsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Public, device-facing: the charts the operator assigned to a station.
 * GET /api/station-charts?station=radio|xtra
 * Only assigned charts are ever returned -- generating a chart publishes nothing.
 */
router.get("/", async (req, res) => {
  const station = req.query.station === "xtra" ? "xtra" : req.query.station === "radio" ? "radio" : null;
  if (!station) {
    res.status(400).json({ error: "station must be radio or xtra" });
    return;
  }
  const rows = await db.select().from(chartAssignmentsTable).orderBy(desc(chartAssignmentsTable.assignedAt));
  const items = rows
    .filter((r) => r.stations.includes(station))
    .slice(0, 10)
    .map((r) => ({ id: r.chartId, title: r.title, date: r.chartDate, entries: r.entries }));
  res.json({ items });
});

export default router;
