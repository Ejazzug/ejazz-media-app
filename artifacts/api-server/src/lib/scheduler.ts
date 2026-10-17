import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, contentItemsTable } from "@workspace/db";
import { attemptContentPush } from "./contentPush";
import { logger } from "./logger";

const TICK_MS = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Publishes draft content items whose `scheduleAt` time has arrived and sends
 * their push notification (if push is enabled). Runs once a minute.
 * An item is flipped to "live" before the push so it can never fire twice.
 */
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await db
      .select()
      .from(contentItemsTable)
      .where(
        and(
          eq(contentItemsTable.status, "draft"),
          isNotNull(contentItemsTable.scheduleAt),
          lte(contentItemsTable.scheduleAt, new Date()),
        ),
      );
    for (const item of due) {
      const [published] = await db
        .update(contentItemsTable)
        .set({ status: "live", updatedAt: new Date() })
        .where(and(eq(contentItemsTable.id, item.id), eq(contentItemsTable.status, "draft")))
        .returning();
      if (!published) continue;
      const delivery = await attemptContentPush(published);
      logger.info({ contentId: published.id, delivery }, "Scheduled content published");
    }
  } catch (error) {
    logger.error({ err: error }, "Scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
}
