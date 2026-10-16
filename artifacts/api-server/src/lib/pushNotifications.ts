import { inArray } from "drizzle-orm";
import { db, expoPushTokensTable } from "@workspace/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH_SIZE = 100;

type PushTicket = {
  status?: string;
  details?: { error?: string };
};

export type PushDeliveryResult = {
  sent: number;
  failed: number;
  registered: number;
};

export async function sendContentPush(input: {
  id: number;
  type: string;
  title: string;
  body: string | null;
}): Promise<PushDeliveryResult> {
  const registrations = await db
    .select({ token: expoPushTokensTable.token })
    .from(expoPushTokensTable);
  const tokens = registrations.map(({ token }) => token);
  const result: PushDeliveryResult = { sent: 0, failed: 0, registered: tokens.length };

  for (let offset = 0; offset < tokens.length; offset += MAX_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + MAX_BATCH_SIZE);
    const messages = batch.map((to) => ({
      to,
      sound: "default",
      channelId: "default",
      title: input.title,
      body: input.body?.trim() || "Open EJazz Media for the latest update.",
      data: { type: "ejazz-content", contentId: input.id, contentType: input.type },
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });
      const payload = (await response.json()) as { data?: PushTicket[]; errors?: unknown[] };
      if (!response.ok || !Array.isArray(payload.data)) {
        throw new Error(
          `Expo Push API returned HTTP ${response.status}${payload.errors?.length ? `: ${JSON.stringify(payload.errors).slice(0, 300)}` : ""}`,
        );
      }

      for (let index = 0; index < payload.data.length; index += 1) {
        const ticket = payload.data[index];
        if (ticket.status === "ok") {
          result.sent += 1;
          continue;
        }
        result.failed += 1;
        if (ticket.details?.error === "DeviceNotRegistered") {
          await db
            .delete(expoPushTokensTable)
            .where(inArray(expoPushTokensTable.token, [batch[index]]));
        }
      }
      if (payload.data.length < batch.length) result.failed += batch.length - payload.data.length;
    } finally {
      clearTimeout(timeout);
    }
  }

  return result;
}
