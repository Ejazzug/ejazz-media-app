import { Router, type IRouter } from "express";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, contentItemsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/active", async (req, res) => {
  const placement = typeof req.query.placement === "string" ? req.query.placement : "home";
  const now = new Date();
  const items = await db
    .select()
    .from(contentItemsTable)
    .where(
      and(
        eq(contentItemsTable.status, "live"),
        eq(contentItemsTable.placement, placement as "home"),
        or(isNull(contentItemsTable.startAt), lte(contentItemsTable.startAt, now)),
        or(isNull(contentItemsTable.endAt), gte(contentItemsTable.endAt, now)),
      ),
    )
    .orderBy(contentItemsTable.createdAt);
  res.json(items);
});

export default router;
