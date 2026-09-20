import { Router, type IRouter } from "express";
import { db, showsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const items = await db.select().from(showsTable).orderBy(showsTable.dayOfWeek, showsTable.startMinute);
  res.json(items);
});

export default router;
