import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  contentItemsTable,
  insertContentItemSchema,
  updateContentItemSchema,
  showsTable,
  insertShowSchema,
  updateShowSchema,
  hostsTable,
  insertHostSchema,
  updateHostSchema,
} from "@workspace/db";
import { sendContentPush, type PushDeliveryResult } from "../lib/pushNotifications";
import type { PushTopic } from "@workspace/db";
import { signSession, requireAdmin, ADMIN_COOKIE } from "../middlewares/adminAuth";
import {
  generateWithGemini,
  isGeminiConfigured,
  generateGroundedViaSearch,
  isWebSearchConfigured,
} from "../lib/gemini";

const router: IRouter = Router();

async function attemptContentPush(item: {
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

router.post("/login", (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: "ADMIN_PASSWORD not configured" });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password !== adminPassword) {
    res.status(401).json({ error: "invalid password" });
    return;
  }
  const { token, maxAgeMs } = signSession();
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: maxAgeMs,
  });
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

router.get("/session", (req, res) => {
  res.json({ authenticated: Boolean(req.cookies?.[ADMIN_COOKIE]) });
});

router.use(requireAdmin);

router.get("/content", async (_req, res) => {
  const items = await db.select().from(contentItemsTable).orderBy(contentItemsTable.createdAt);
  res.json(items);
});

router.post("/content", async (req, res) => {
  const parsed = insertContentItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [item] = await db.insert(contentItemsTable).values(parsed.data).returning();
  const pushDelivery = await attemptContentPush(item);
  const [savedItem] = pushDelivery?.sent
    ? await db.select().from(contentItemsTable).where(eq(contentItemsTable.id, item.id))
    : [item];
  res.status(201).json({ ...savedItem, pushDelivery });
});

router.patch("/content/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = updateContentItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [previousItem] = await db
    .select()
    .from(contentItemsTable)
    .where(eq(contentItemsTable.id, id));
  if (!previousItem) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [item] = await db
    .update(contentItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(contentItemsTable.id, id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const becameLive = previousItem.status !== "live" && item.status === "live";
  const pushDelivery = becameLive ? await attemptContentPush(item) : null;
  const [savedItem] = pushDelivery?.sent
    ? await db.select().from(contentItemsTable).where(eq(contentItemsTable.id, item.id))
    : [item];
  res.json({ ...savedItem, pushDelivery });
});

router.get("/shows", async (_req, res) => {
  const items = await db.select().from(showsTable).orderBy(showsTable.dayOfWeek, showsTable.startMinute);
  res.json(items);
});

router.post("/shows", async (req, res) => {
  const parsed = insertShowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [item] = await db.insert(showsTable).values(parsed.data).returning();
  res.status(201).json(item);
});

router.patch("/shows/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = updateShowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [item] = await db
    .update(showsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(showsTable.id, id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(item);
});

router.delete("/shows/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(showsTable).where(eq(showsTable.id, id));
  res.json({ ok: true });
});

router.get("/hosts", async (_req, res) => {
  const items = await db.select().from(hostsTable).orderBy(hostsTable.name);
  res.json(items);
});

router.post("/hosts", async (req, res) => {
  const parsed = insertHostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [item] = await db.insert(hostsTable).values(parsed.data).returning();
  res.status(201).json(item);
});

router.patch("/hosts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = updateHostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [item] = await db
    .update(hostsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(hostsTable.id, id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(item);
});

router.delete("/hosts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(hostsTable).where(eq(hostsTable.id, id));
  res.json({ ok: true });
});

router.post("/ai/test", async (req, res) => {
  if (!isGeminiConfigured()) {
    res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    return;
  }
  const promptInput = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const prompt = promptInput || "Say hello in one short sentence and confirm you are working.";
  const useSearch = Boolean(req.body?.grounded);
  try {
    if (useSearch) {
      if (!isWebSearchConfigured()) {
        res.status(503).json({
          error: "SEARXNG_URL not configured; self-hosted search is not set up yet",
        });
        return;
      }
      const result = await generateGroundedViaSearch(prompt);
      res.json(result);
      return;
    }
    const result = await generateWithGemini(prompt);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "gemini_request_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
