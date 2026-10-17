import { Router, type IRouter } from "express";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/notifications -- what the app shows.
 *
 * Public and unauthenticated, like /api/app-config: it is the device-facing read. Returns
 * only live notifications, meaning not retracted and either never expiring or not yet
 * expired. Retracting a row is therefore what makes it disappear from every device.
 */
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: notificationsTable.id,
        title: notificationsTable.title,
        body: notificationsTable.body,
        topic: notificationsTable.topic,
        sentAt: notificationsTable.sentAt,
        expiresAt: notificationsTable.expiresAt,
      })
      .from(notificationsTable)
      .where(
        and(
          isNull(notificationsTable.retractedAt),
          or(isNull(notificationsTable.expiresAt), gt(notificationsTable.expiresAt, new Date())),
        ),
      )
      .orderBy(desc(notificationsTable.sentAt))
      .limit(200);
    res.json({ notifications: rows });
  } catch (error) {
    logger.error({ err: error }, "Could not read notifications");
    res.status(500).json({ error: "Could not read notifications." });
  }
});

/**
 * GET /api/notifications/admin -- the Control Room's own list.
 *
 * Admin-gated and shows everything, including retracted rows, because the operator needs
 * to see what they retracted. The public route above never returns those.
 */
router.get("/admin", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .orderBy(desc(notificationsTable.sentAt))
      .limit(500);
    res.json({ notifications: rows });
  } catch (error) {
    logger.error({ err: error }, "Could not read the notification log");
    res.status(500).json({ error: "Could not read the notification log." });
  }
});

/**
 * POST /api/notifications/:id/retract -- stop devices showing it.
 *
 * Sets retractedAt, so the row survives for the audit trail but drops out of the public
 * feed. This does NOT recall a push already delivered to a phone's tray: FCM has handed it
 * over and nothing here can take it back. It removes the item from the in-app list.
 */
router.post("/:id/retract", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id." });
  try {
    const [row] = await db
      .update(notificationsTable)
      .set({ retractedAt: new Date() })
      .where(and(eq(notificationsTable.id, id), isNull(notificationsTable.retractedAt)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found, or already retracted." });
    return res.json({ ok: true, notification: row });
  } catch (error) {
    logger.error({ err: error, id }, "Could not retract notification");
    return res.status(500).json({ error: "Could not retract that notification." });
  }
});

/** POST /api/notifications/:id/unretract -- undo a retraction, putting it back in the feed. */
router.post("/:id/unretract", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id." });
  try {
    const [row] = await db
      .update(notificationsTable)
      .set({ retractedAt: null })
      .where(eq(notificationsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found." });
    return res.json({ ok: true, notification: row });
  } catch (error) {
    logger.error({ err: error, id }, "Could not un-retract notification");
    return res.status(500).json({ error: "Could not restore that notification." });
  }
});

/**
 * DELETE /api/notifications/:id -- remove from the operator's log only.
 *
 * Housekeeping, not reach: a delivered push cannot be recalled, and a device that already
 * has the notification keeps it. Use retract to make it disappear from the app.
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id." });
  try {
    const [row] = await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found." });
    return res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error, id }, "Could not delete notification");
    return res.status(500).json({ error: "Could not delete that notification." });
  }
});

/**
 * DELETE /api/notifications -- clear the whole operator log.
 *
 * Requires ?confirm=yes so a mistyped URL cannot wipe it. Same caveat as a single delete:
 * this empties the log, it does not retract anything. Rows that were retracted stay
 * retracted only while they exist, so clearing a retracted row makes it live again for any
 * device that re-fetches -- which is why the Control Room retracts first and warns here.
 */
router.delete("/", requireAdmin, async (req, res) => {
  if (req.query.confirm !== "yes") {
    return res.status(400).json({ error: "Add ?confirm=yes to clear the whole log." });
  }
  try {
    const rows = await db.delete(notificationsTable).returning({ id: notificationsTable.id });
    logger.warn({ count: rows.length }, "Notification log cleared");
    return res.json({ ok: true, deleted: rows.length });
  } catch (error) {
    logger.error({ err: error }, "Could not clear the notification log");
    return res.status(500).json({ error: "Could not clear the log." });
  }
});

export default router;
