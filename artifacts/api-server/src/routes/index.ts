import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import contentRouter from "./content";
import showsRouter from "./shows";
import hostsRouter from "./hosts";
import appConfigRouter from "./appConfig";
import notificationsRouter from "./notifications";
import factsRouter from "./facts";
import stationChartsRouter from "./stationCharts";
import songRequestsRouter from "./songRequests";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/content", contentRouter);
router.use("/shows", showsRouter);
router.use("/hosts", hostsRouter);
router.use("/app-config", appConfigRouter);
// Public device-facing read + admin-gated log actions. Reachable publicly only because
// ejazz-proxy forwards /api/notifications here; everything else under /api/ that is not
// explicitly listed there falls through to the Flask dashboard on 9000.
router.use("/notifications", notificationsRouter);
// Public song facts and per-station charts; ejazz-proxy forwards /api/facts and
// /api/station-charts here (the bare /api/charts belongs to the Flask dashboard).
router.use("/facts", factsRouter);
router.use("/station-charts", stationChartsRouter);
// Public: whether a station is taking requests right now (the schedule set in the Control
// Room). Read by the website embed and the app; needs its own ejazz-proxy line, like the
// routes above, or it falls through to the Flask dashboard.
router.use("/song-requests", songRequestsRouter);

export default router;
