import { eq } from "drizzle-orm";
import { db, contentItemsTable } from "@workspace/db";
import type { PushTopic } from "@workspace/db";
import { sendContentPush, type PushDeliveryResult } from "./pushNotifications";

export async function attemptContentPush(item: {
  id: number;
  type: string;
  title: string;
  body: string | null;
  status: string;
  pushEnabled: boolean;
  pushTopic: PushTopic;
  pushSentAt: Date | null;
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
