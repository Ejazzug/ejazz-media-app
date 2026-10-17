import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import contentRouter from "./content";
import showsRouter from "./shows";
import hostsRouter from "./hosts";
import appConfigRouter from "./appConfig";
import notificationsRouter from "./notifications";

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

export default router;
