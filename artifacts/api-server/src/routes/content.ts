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
        // The approval DECISION, which lives on the row. `approval_state` defaults to
        // "approved", so this changes nothing for every pre-existing item and every kind
        // whose gate is off -- and it is what stops a card that is still waiting on, or was
        // refused by, the approval centre from reaching a phone because its schedule came
        // round. The POLICY (which kinds need approving) stays in the dashboard's
        // lib/content_os.py; a rejection there beats any schedule here.
        eq(contentItemsTable.approvalState, "approved"),
        or(isNull(contentItemsTable.startAt), lte(contentItemsTable.startAt, now)),
        or(isNull(contentItemsTable.endAt), gte(contentItemsTable.endAt, now)),
      ),
    )
    .orderBy(contentItemsTable.createdAt);
  res.json(items);
});

export default router;
