import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import contentRouter from "./content";
import showsRouter from "./shows";
import hostsRouter from "./hosts";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/content", contentRouter);
router.use("/shows", showsRouter);
router.use("/hosts", hostsRouter);

export default router;
