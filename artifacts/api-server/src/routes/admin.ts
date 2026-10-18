import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  contentItemsTable,
  insertContentItemSchema,
  updateContentItemSchema,
  showsTable,
  hostsTable,
  insertHostSchema,
  updateHostSchema,
} from "@workspace/db";
import { attemptContentPush } from "../lib/contentPush";
import { normalizeShowInput, describeRepeat, slotsOf, daysOf } from "../lib/showSchedule";
import { recentAutoFacts, runDaypart } from "../lib/funFacts";
import { getAppConfig, saveAppConfig } from "../lib/appConfig";
import { signSession, requireAdmin, ADMIN_COOKIE } from "../middlewares/adminAuth";
import {
  generateWithGemini,
  isGeminiConfigured,
  generateGroundedViaSearch,
  isWebSearchConfigured,
} from "../lib/gemini";

const router: IRouter = Router();

/** The Control Room sends dates as ISO strings; the schema expects Date objects. */
function withDates(body: unknown): unknown {
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
  const parsed = insertContentItemSchema.safeParse(withDates(req.body));
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
  const parsed = updateContentItemSchema.safeParse(withDates(req.body));
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

/**
 * The stored programme ENTRIES (not the flattened per-day rows GET /api/shows returns),
 * so the Control Room can edit a show as the one thing the operator created. Each entry
 * carries a plain-English summary of its repeat pattern, built from the same rules the
 * public expansion uses, so the list and the app can never disagree about what repeats.
 */
router.get("/shows", async (_req, res) => {
  const items = await db
    .select()
    .from(showsTable)
    .orderBy(showsTable.station, showsTable.dayOfWeek, showsTable.startMinute);
  res.json(
    items.map((show) => ({
      ...show,
      slots: slotsOf(show),
      daysOfWeek: daysOf(show),
      repeatMode: show.repeatMode || "weekly",
      repeatSummary: describeRepeat(show),
    })),
  );
});

router.post("/shows", async (req, res) => {
  const normalized = normalizeShowInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }
  const [item] = await db.insert(showsTable).values(normalized.value).returning();
  res.status(201).json(item);
});

/**
 * Edit one entry. This REPLACES the editable fields rather than merging a few of them:
 * a schedule is one coherent choice (a repeat type and the lists that belong to it), and
 * a partial update could leave an entry in "dates mode with no dates", which would
 * silently never air again.
 */
router.patch("/shows/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const normalized = normalizeShowInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }
  const [item] = await db
    .update(showsTable)
    .set({ ...normalized.value, updatedAt: new Date() })
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

router.get("/app-config", async (_req, res) => {
  res.json(await getAppConfig());
});

router.put("/app-config", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "expected a JSON object" });
    return;
  }
  res.json(await saveAppConfig(req.body));
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

/** What the fun fact automation has actually fired, newest first. */
router.get("/fun-facts/log", async (_req, res) => {
  try {
    // geminiConfigured lets the panel disable "Send one now" up front, rather than letting
    // the operator click a button that cannot possibly work and reading the failure after.
    res.json({ items: await recentAutoFacts(50), geminiConfigured: isGeminiConfigured() });
  } catch (err) {
    res.status(500).json({ error: "Could not read the fun fact log." });
  }
});

/**
 * Fire one daypart right now, for testing. Runs the identical path the scheduler uses --
 * generate, publish, push, and roll back the row if the push fails -- so what the operator
 * sees here is exactly what automatic firing does, not a simulation of it.
 */
router.post("/fun-facts/run", async (req, res) => {
  const id = typeof req.body?.daypartId === "string" ? req.body.daypartId : "";
  const config = await getAppConfig();
  const daypart = config.funFacts.dayparts.find((d) => d.id === id);
  if (!daypart) {
    res.status(400).json({ error: "Unknown daypart." });
    return;
  }
  // A missing API key is this server being misconfigured, not a gateway failure. Returning
  // 502 for it sent a previous debugging session looking at nginx; 503 says "this service
  // cannot do that right now", which is what is actually true.
  if (!isGeminiConfigured()) {
    res.status(503).json({ error: "Gemini is not configured (GEMINI_API_KEY is not set for this service)." });
    return;
  }
  try {
    const result = await runDaypart(daypart);
    // Always report the reason under `error`: the Control Room's api() helper reads that key
    // and otherwise falls back to a bare "HTTP 502", throwing away a perfectly good message.
    if (result.status === "sent") {
      res.json(result);
      return;
    }
    res.status(502).json({ error: result.reason || "The fact could not be sent.", ...result });
  } catch (err) {
    res.status(502).json({
      error: "fun_fact_run_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
