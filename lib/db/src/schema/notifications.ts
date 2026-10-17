import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { pushTopicEnum } from "./content";

/**
 * A log of every push actually sent, written at the single choke point every FCM send
 * already goes through (lib/contentPush.ts). Before this table the only record of a send
 * was content_items.push_sent_at -- one overwritable timestamp, with no history, no
 * audience record and nothing the app could read back.
 *
 * It does NOT replace those columns: content_items.push_enabled / push_topic /
 * push_sent_at stay exactly as they were, so the existing "was this item pushed" logic and
 * the Control Room's inline "push sent ..." line keep working unchanged.
 *
 * Lifecycle, which the two Control Room actions deliberately keep separate:
 *   retractedAt  -- operator-facing withdrawal. The row stays, but GET /api/notifications
 *                   stops returning it, so it disappears from every device. Reversible by
 *                   clearing the column; auditable because the row is still here.
 *   deleting     -- removes the row from the operator's own log only. Devices that already
 *                   received the push are unaffected: FCM has delivered it and nothing here
 *                   can recall it. Delete is housekeeping, Retract is the one with reach.
 */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  // The content item this push was for, when there is one. Intentionally NOT a foreign key:
  // deleting a content item must not delete the record that a push went out for it.
  contentItemId: integer("content_item_id"),
  title: text("title").notNull(),
  body: text("body"),
  topic: pushTopicEnum("topic").notNull().default("all"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  // Null = never expires. Set to hide the notification from the app after a moment passes.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  retractedAt: timestamp("retracted_at", { withTimezone: true }),
});

export type NotificationRow = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
