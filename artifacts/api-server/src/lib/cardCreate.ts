import { eq } from "drizzle-orm";
import { db, contentItemsTable, insertContentItemSchema } from "@workspace/db";
import { attemptContentPush } from "./contentPush";
import { approvalRequired } from "./contentGate";
import {
  cardTemplate, cardRatio, cardImageUrl, cardRow, normaliseCardFields,
  DEFAULT_CARD_RATIO, type CardRatio,
} from "./cardTemplates";

/**
 * Making an App Card, in ONE place.
 *
 * There are two doors to this: `POST /api/admin/cards`, which an operator uses from the
 * Control Room's Card Studio, and `POST /api/internal/cards`, which the dashboard's repurpose
 * hub uses over the loopback door to send a song fact (or anything else it projects) to the
 * app. Both must apply the same three rules, and all three are the kind that go quietly wrong
 * when a second copy drifts:
 *
 *   1. **The gate.** A card's approval state is chosen HERE, from the policy the dashboard
 *      holds (`contentGate.approvalRequired`), and is changed afterwards only by a decision on
 *      /approvals. The approval columns are deliberately absent from
 *      `insertContentItemSchema`, so a caller cannot smuggle one in and a card can never
 *      approve itself.
 *   2. **The picture.** `image_url` is signed over the row's id, which only the insert can hand
 *      back -- hence two steps. A card whose picture could not be written is DELETED rather
 *      than left on the list pointing at nothing.
 *   3. **The push.** A card that is live the moment it is made pushes like any other item,
 *      through the single choke point (`contentPush.attemptContentPush`), which writes the
 *      notifications audit row and refuses anything not approved.
 *
 * The card owns `type`, `title`, `body` and `template_fields`; the caller owns placement,
 * schedule, push and status. The spread order below is what enforces that, so a request
 * cannot pass a title that disagrees with the picture.
 */

/** The Control Room and the hub both send dates as ISO strings; the schema wants Date objects. */
export function withDates(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of ["startAt", "endAt", "scheduleAt"]) {
    const value = out[key];
    if (typeof value === "string") {
      const parsed = new Date(value);
      out[key] = Number.isNaN(parsed.getTime()) ? value : parsed;
    }
  }
  return out;
}

export type CardCreateOutcome =
  | {
      ok: true;
      /** The row as it stands after the picture (and any immediate push) was written. */
      row: Record<string, unknown>;
      ratio: CardRatio;
      pushDelivery: Awaited<ReturnType<typeof attemptContentPush>>;
    }
  | { ok: false; status: number; error: string; problems?: string[]; detail?: string };

/**
 * Create one card from a request body. Returns an outcome rather than touching a response, so
 * each route decides its own status code and shape.
 */
export async function createCard(rawBody: unknown): Promise<CardCreateOutcome> {
  const b = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<string, unknown>;
  const template = cardTemplate(b.templateId);
  if (!template) return { ok: false, status: 400, error: "Choose one of the card templates." };

  const ratio = cardRatio(b.ratio) || DEFAULT_CARD_RATIO;
  const { fields, problems } = normaliseCardFields(template, b.fields);
  if (problems.length) {
    return { ok: false, status: 400, error: problems[0] as string, problems: problems as string[] };
  }

  const operator = { ...b };
  for (const key of ["templateId", "fields", "ratio", "imageUrl"]) delete operator[key];
  const parsed = insertContentItemSchema.safeParse(withDates({
    ...operator,
    ...cardRow(template, fields),
  }));
  if (!parsed.success) {
    return { ok: false, status: 400, error: "That card is not valid.", detail: JSON.stringify(parsed.error.flatten()).slice(0, 400) };
  }

  const approvalState = (await approvalRequired("card")) ? "pending" : "approved";
  const [item] = await db.insert(contentItemsTable)
    .values({ ...parsed.data, approvalState }).returning();

  let saved;
  try {
    [saved] = await db.update(contentItemsTable)
      .set({ imageUrl: cardImageUrl(item.id, template, fields, ratio), updatedAt: new Date() })
      .where(eq(contentItemsTable.id, item.id)).returning();
  } catch (err) {
    await db.delete(contentItemsTable).where(eq(contentItemsTable.id, item.id));
    return {
      ok: false, status: 500,
      error: "The card could not be given a picture, so it was not kept.",
      detail: String(err).slice(0, 200),
    };
  }

  const pushDelivery = await attemptContentPush(saved);
  const [current] = pushDelivery?.sent
    ? await db.select().from(contentItemsTable).where(eq(contentItemsTable.id, saved.id))
    : [saved];
  return { ok: true, row: current as unknown as Record<string, unknown>, ratio, pushDelivery };
}
