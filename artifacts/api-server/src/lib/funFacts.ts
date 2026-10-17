import { and, desc, eq, gte, like } from "drizzle-orm";
import { db, contentItemsTable } from "@workspace/db";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import { getAppConfig } from "./appConfig";
import type { FunFactDaypart } from "./appConfig";
import { attemptContentPush } from "./contentPush";
import { logger } from "./logger";

/**
 * Automatic fun facts, fired at fixed dayparts.
 *
 * Dayparts rather than an interval, deliberately: "every N hours" drifts across the clock
 * and eventually posts at 3am, and the time of day is itself the context the model is given
 * ("it is Friday drive time"), which an interval cannot express.
 *
 * THE RULE THIS EXISTS TO ENFORCE: a fact that does not push is the failure being fixed.
 * Generation, insert and push are one step, and if the push fails the row is removed again
 * rather than left behind as silent content nobody was told about. See runDaypart().
 */

/** How long after a daypart's time it may still fire, in minutes. */
const GRACE_MINUTES = 10;

/** createdBy marker, so an auto-fired fact is identifiable and the slot claim is derivable. */
const CREATED_BY_PREFIX = "auto:fun-fact";

export function createdByFor(daypartId: string): string {
  return `${CREATED_BY_PREFIX}:${daypartId}`;
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function minutesSinceMidnight(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function daypartMinutes(daypart: FunFactDaypart): number | null {
  const [h, m] = daypart.time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function daypartLabelFor(now: Date, daypart: FunFactDaypart): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday} ${daypart.label.toLowerCase()}`;
}

/**
 * Has this daypart already fired today? The content row IS the claim -- no extra state and
 * no separate table, and it cannot disagree with reality the way a stored timestamp can.
 * A run whose push failed deletes its row, so it is eligible again until the grace window
 * closes; that bounds retries to GRACE_MINUTES instead of looping all day.
 */
async function alreadyFiredToday(daypartId: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: contentItemsTable.id })
    .from(contentItemsTable)
    .where(
      and(
        eq(contentItemsTable.createdBy, createdByFor(daypartId)),
        gte(contentItemsTable.createdAt, startOfToday(now)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function buildPrompt(now: Date, daypart: FunFactDaypart): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const clock = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return [
    `Write one short, surprising music or entertainment fact for EJazz Media, a radio station in Kampala, Uganda.`,
    ``,
    `It is ${weekday}, ${daypart.label.toLowerCase()} (about ${clock} local time). Pitch it to someone`,
    `listening right now: match the energy of that moment in the day, and lean on African and`,
    `Afrobeats artists where it fits naturally.`,
    ``,
    `Rules:`,
    `- Two sentences at most, under 50 words total.`,
    `- It must be TRUE and checkable. If you are not sure, pick a different fact.`,
    `- No hashtags, no emoji, no "Did you know" opener, no greeting, no sign-off.`,
    `- Reply with the fact text only: no title, no quotes around it, no preamble.`,
  ].join("\n");
}

function buildTitle(now: Date, daypart: FunFactDaypart): string {
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${daypart.label} fact — ${date}`;
}

export type FunFactRunResult = {
  daypartId: string;
  status: "sent" | "skipped" | "failed";
  contentId?: number;
  reason?: string;
};

/**
 * Generate, publish and push one fact. All-or-nothing on purpose: if the push does not go
 * out the content row is deleted again, because a fact nobody was notified about is exactly
 * the failure this feature was built to remove.
 */
export async function runDaypart(daypart: FunFactDaypart, now = new Date()): Promise<FunFactRunResult> {
  const config = await getAppConfig();
  if (!isGeminiConfigured()) {
    return { daypartId: daypart.id, status: "failed", reason: "Gemini is not configured." };
  }

  let body: string;
  try {
    const result = await generateWithGemini(buildPrompt(now, daypart));
    body = (result.text || "").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI generation failed.";
    logger.error({ err: error, daypart: daypart.id }, "Fun fact generation failed");
    return { daypartId: daypart.id, status: "failed", reason };
  }
  if (!body) {
    return { daypartId: daypart.id, status: "failed", reason: "The model returned nothing." };
  }

  const [item] = await db
    .insert(contentItemsTable)
    .values({
      type: "fact",
      title: buildTitle(now, daypart),
      body,
      status: "live",
      pushEnabled: true,
      pushTopic: config.funFacts.topic,
      placement: "home",
      createdBy: createdByFor(daypart.id),
    })
    .returning();

  const delivery = await attemptContentPush(item);
  if (!delivery?.sent) {
    // Undo the publish. Leaving it would create exactly the orphan this feature exists to
    // prevent, and the daypart stays eligible to retry until its grace window closes.
    await db.delete(contentItemsTable).where(eq(contentItemsTable.id, item.id));
    const reason = delivery?.error || "Push was not sent.";
    logger.error({ daypart: daypart.id, reason }, "Fun fact push failed; the fact was withdrawn");
    return { daypartId: daypart.id, status: "failed", reason };
  }

  logger.info(
    { daypart: daypart.id, contentId: item.id, topic: delivery.topic },
    "Fun fact auto-published and pushed",
  );
  return { daypartId: daypart.id, status: "sent", contentId: item.id };
}

/**
 * Called from the scheduler's existing once-a-minute tick. Returns what it did, if
 * anything; the common case is an immediate no-op costing one config read.
 */
export async function runDueFunFacts(now = new Date()): Promise<FunFactRunResult[]> {
  const config = await getAppConfig();
  const settings = config.funFacts;
  if (!settings.enabled) return [];
  if (settings.days.length > 0 && !settings.days.includes(now.getDay())) return [];

  const nowMinutes = minutesSinceMidnight(now);
  const results: FunFactRunResult[] = [];

  for (const daypart of settings.dayparts) {
    if (!daypart.enabled) continue;
    const due = daypartMinutes(daypart);
    if (due === null) continue;
    // Inside the window only: at or after its time, and no more than GRACE_MINUTES late.
    // A server that was down over the slot skips it rather than posting hours out of date.
    if (nowMinutes < due || nowMinutes > due + GRACE_MINUTES) continue;
    if (await alreadyFiredToday(daypart.id, now)) continue;

    results.push(await runDaypart(daypart, now));
  }
  return results;
}

/** Recent auto-fired facts, for the Control Room's log. */
export async function recentAutoFacts(limit = 50) {
  return db
    .select({
      id: contentItemsTable.id,
      title: contentItemsTable.title,
      body: contentItemsTable.body,
      createdBy: contentItemsTable.createdBy,
      createdAt: contentItemsTable.createdAt,
      pushSentAt: contentItemsTable.pushSentAt,
      pushTopic: contentItemsTable.pushTopic,
      status: contentItemsTable.status,
    })
    .from(contentItemsTable)
    .where(like(contentItemsTable.createdBy, `${CREATED_BY_PREFIX}:%`))
    .orderBy(desc(contentItemsTable.createdAt))
    .limit(limit);
}

export { daypartLabelFor };
