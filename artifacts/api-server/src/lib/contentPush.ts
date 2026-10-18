import { eq } from "drizzle-orm";
import { db, contentItemsTable, notificationsTable } from "@workspace/db";
import type { PushTopic } from "@workspace/db";
import { sendContentPush, type PushDeliveryResult } from "./pushNotifications";
import { cleanHttpUrl, firstMarkupUrl } from "./linkText";
import { logger } from "./logger";

export async function attemptContentPush(item: {
  id: number;
  type: string;
  title: string;
  body: string | null;
  status: string;
  pushEnabled: boolean;
  pushTopic: PushTopic;
  pushSentAt: Date | null;
  // The content item's own end time doubles as the notification's expiry, so a push for
  // something time-limited stops showing in the app when the thing itself is over.
  // Optional: callers that build a partial item (and every existing caller) still work.
  endAt?: Date | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  openMode?: string | null;
}): Promise<PushDeliveryResult | null> {
  if (!item.pushEnabled || item.status !== "live" || item.pushSentAt) return null;

  try {
    const delivery = await sendContentPush(item);
    if (delivery.sent) {
      const pushSentAt = new Date();
      await db
        .update(contentItemsTable)
        .set({ pushSentAt, updatedAt: pushSentAt })
        .where(eq(contentItemsTable.id, item.id));
      // Log the send. This is the one choke point every FCM push passes through, so
      // recording it here means no send can bypass the log. It is deliberately after the
      // send succeeded -- the table is a record of what actually went out, not what was
      // attempted. A logging failure must not make a delivered push look undelivered, so
      // it is caught and reported rather than thrown.
      try {
        await db.insert(notificationsTable).values({
          contentItemId: item.id,
          title: item.title,
          body: item.body,
          topic: item.pushTopic,
          sentAt: pushSentAt,
          expiresAt: item.endAt ?? null,
          imageUrl: cleanHttpUrl(item.imageUrl),
          linkUrl: cleanHttpUrl(item.linkUrl) ?? firstMarkupUrl(item.body ?? ""),
          openMode: item.openMode === "link" ? "link" : "details",
        });
      } catch (logError) {
        logger.error(
          { err: logError, contentId: item.id },
          "Push was delivered but could not be written to the notifications log",
        );
      }
    }
    return delivery;
  } catch (error) {
    console.error("[EJazz Push] Content notification delivery failed.", { contentId: item.id, error });
    return {
      sent: false,
      topic: item.pushTopic,
      messageId: null,
      error: error instanceof Error ? error.message : "Push delivery failed.",
    };
  }
}
