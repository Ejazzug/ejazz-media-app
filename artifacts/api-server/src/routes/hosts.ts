import { Router, type IRouter } from "express";
import { db, hostsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const items = await db.select().from(hostsTable).orderBy(hostsTable.name);
  res.json(items);
});

export default router;
