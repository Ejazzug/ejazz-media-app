import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  contentItemsTable,
  insertContentItemSchema,
  updateContentItemSchema,
  showsTable,
  hostsTable,
  insertHostSchema,
  updateHostSchema,
  songFactsTable,
  chartAssignmentsTable,
  countdownChartStationsTable,
} from "@workspace/db";
import {
  fetchDashboardCountdowns, snapshotCountdown, clearHistory, historyStats, type DashboardCountdown,
} from "../lib/countdownCharts";
import { artistKey, titleKey, listFacts } from "../lib/songFacts";
import { isGroqConfigured } from "../lib/groq";
import { syncSheet, lastSheetSync, validateSheetUrl } from "../lib/songFactsSheet";
import { attemptContentPush } from "../lib/contentPush";
import { cleanHttpUrl } from "../lib/linkText";
import { normalizeShowInput, describeRepeat, slotsOf, daysOf, todayInEat } from "../lib/showSchedule";
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


/**
 * Validates and normalises the link / image / tap-behaviour fields before the schema sees
 * them: a blank becomes null, anything that is not a plain http(s) link is rejected with a
 * message the Control Room shows, and openMode can only be "details" or "link".
 */
function normalisePushFields(body: unknown): { body: unknown; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body };
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const [key, label] of [["linkUrl", "link"], ["imageUrl", "image"]] as const) {
    if (!(key in out)) continue;
    const raw = out[key];
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      out[key] = null;
      continue;
    }
    const cleaned = cleanHttpUrl(raw);
    if (!cleaned) return { body, error: "The " + label + " must be a full web address starting with https:// (or http://)." };
    if (key === "imageUrl" && !cleaned.startsWith("https://")) return { body, error: "The image link must start with https://." };
    out[key] = cleaned;
  }
  if ("openMode" in out && out.openMode !== "details" && out.openMode !== "link") out.openMode = "details";
  if (out.openMode === "link" && "linkUrl" in out && !out.linkUrl) {
    return { body, error: "Choose a link to open, or set the tap to open the full message." };
  }
  return { body: out };
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
  const push = normalisePushFields(req.body);
  if (push.error) {
    res.status(400).json({ error: push.error });
    return;
  }
  const parsed = insertContentItemSchema.safeParse(withDates(push.body));
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
  const push = normalisePushFields(req.body);
  if (push.error) {
    res.status(400).json({ error: push.error });
    return;
  }
  const parsed = updateContentItemSchema.safeParse(withDates(push.body));
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
 * DELETE /api/admin/content/:id -- remove one content item for good.
 *
 * Withdrawing hides an item from the app and keeps it in the list; this drops the row. The
 * notification log is untouched: `notifications.content_item_id` is deliberately not a
 * foreign key, so the record that a push went out survives the content item it was for.
 * Nothing is recalled from a phone's tray by either action.
 */
router.delete("/content/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [item] = await db.delete(contentItemsTable).where(eq(contentItemsTable.id, id)).returning();
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true, deleted: 1 });
});

/**
 * DELETE /api/admin/content?confirm=yes -- clear the whole content list.
 *
 * `?only=withdrawn` keeps anything still live or draft, which is the safe everyday
 * "tidy up what has gone out" and what the Control Room's button sends by default.
 * Requires ?confirm=yes either way, the same guard the notification log uses, so a
 * mistyped URL cannot empty the list.
 */
router.delete("/content", async (req, res) => {
  if (req.query.confirm !== "yes") {
    res.status(400).json({ error: "Add ?confirm=yes to clear the content list." });
    return;
  }
  const rows = req.query.only === "withdrawn"
    ? await db.delete(contentItemsTable).where(eq(contentItemsTable.status, "withdrawn")).returning({ id: contentItemsTable.id })
    : await db.delete(contentItemsTable).returning({ id: contentItemsTable.id });
  res.json({ ok: true, deleted: rows.length });
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

// ---------------------------------------------------------------- song facts

router.get("/song-facts", async (_req, res) => {
  const config = await getAppConfig();
  res.json({
    items: await listFacts(),
    autoGenerate: config.songFacts.autoGenerate,
    geminiConfigured: isGeminiConfigured(),
    groqConfigured: isGroqConfigured(),
    lastSync: lastSheetSync(),
  });
});

function factInput(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return { artist: str(b.artist, 120), title: str(b.title, 120), body: str(b.body, 400), enabled: b.enabled !== false };
}

router.post("/song-facts", async (req, res) => {
  const f = factInput(req.body);
  const ak = artistKey(f.artist);
  if (!ak || f.body.length < 10) {
    res.status(400).json({ error: "An artist and a fact of at least 10 characters are required." });
    return;
  }
  const tk = titleKey(f.title);
  // A manual fact replaces whatever is there for this artist/song (an AI one or a "no fact" marker).
  const [row] = await db
    .insert(songFactsTable)
    .values({ artistKey: ak, titleKey: tk, artist: f.artist, title: f.title, body: f.body, source: "manual", enabled: f.enabled })
    .onConflictDoUpdate({
      target: [songFactsTable.artistKey, songFactsTable.titleKey],
      set: { artist: f.artist, title: f.title, body: f.body, source: "manual", enabled: f.enabled, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

/** Pull the linked Google Sheet now. The link comes from the form so it can be tested before saving. */
router.post("/song-facts/sync", async (req, res) => {
  const config = await getAppConfig();
  const url = typeof req.body?.url === "string" && req.body.url.trim() ? req.body.url.trim() : config.songFacts.sheetUrl;
  if (!url) {
    res.status(400).json({ error: "Paste a Google Sheets link first." });
    return;
  }
  const bad = validateSheetUrl(url);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  const result = await syncSheet(url);
  res.status(result.ok ? 200 : 502).json(result.ok ? result : { error: result.message, ...result });
});

router.patch("/song-facts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const f = factInput(req.body);
  if (!Number.isInteger(id) || f.body.length < 10) {
    res.status(400).json({ error: "A fact of at least 10 characters is required." });
    return;
  }
  const [row] = await db
    .update(songFactsTable)
    .set({ body: f.body, enabled: f.enabled, source: "manual", updatedAt: new Date() })
    .where(eq(songFactsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  res.json(row);
});

router.delete("/song-facts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad id." });
    return;
  }
  await db.delete(songFactsTable).where(eq(songFactsTable.id, id));
  res.json({ ok: true });
});

// ------------------------------------------------------- charts per station

const DASHBOARD_CHARTS_URL = "http://127.0.0.1:9000/api/charts";

/** The dashboard's charts, each with the stations it is currently assigned to. */
router.get("/station-charts", async (_req, res) => {
  const assigned = await db.select().from(chartAssignmentsTable).orderBy(desc(chartAssignmentsTable.assignedAt));
  const map = new Map(assigned.map((a) => [a.chartId, a.stations]));
  let source: { id: string; title: string; date: string; entries: unknown[] }[] = [];
  let warning: string | null = null;
  try {
    const r = await fetch(DASHBOARD_CHARTS_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = (await r.json()) as { items?: typeof source };
    source = Array.isArray(j.items) ? j.items : [];
  } catch (err) {
    warning = "Could not read the dashboard's chart list (" + (err instanceof Error ? err.message : String(err)) + "). Showing assigned charts only.";
  }
  const seen = new Set<string>();
  const items = source.map((c) => {
    seen.add(c.id);
    return { id: c.id, title: c.title, date: c.date, count: c.entries.length, stations: map.get(c.id) ?? [] };
  });
  // An assigned chart that the dashboard no longer lists must still be removable here.
  for (const a of assigned) {
    if (!seen.has(a.chartId)) items.push({ id: a.chartId, title: a.title, date: a.chartDate ?? "", count: a.entries.length, stations: a.stations });
  }
  res.json({ items, warning });
});

/** Assign a chart to Radio, Xtra, both or neither. [] un-assigns it. */
router.put("/station-charts/:id", async (req, res) => {
  const chartId = req.params.id;
  const stations = Array.isArray(req.body?.stations)
    ? [...new Set((req.body.stations as unknown[]).filter((s): s is "radio" | "xtra" => s === "radio" || s === "xtra"))]
    : [];
  if (stations.length === 0) {
    await db.delete(chartAssignmentsTable).where(eq(chartAssignmentsTable.chartId, chartId));
    res.json({ id: chartId, stations: [] });
    return;
  }
  // Snapshot from the dashboard now, so the app never depends on the dashboard being up.
  let chart: { id: string; title: string; date: string; entries: { position: number; title: string; artist: string }[] } | undefined;
  try {
    const r = await fetch(DASHBOARD_CHARTS_URL, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { items?: NonNullable<typeof chart>[] };
    chart = (j.items ?? []).find((c) => c.id === chartId);
  } catch {
    res.status(502).json({ error: "Could not reach the dashboard to read this chart." });
    return;
  }
  if (!chart) {
    res.status(404).json({ error: "That chart no longer exists on the dashboard." });
    return;
  }
  const entries = chart.entries.map((e) => ({ position: Number(e.position), title: String(e.title), artist: String(e.artist) }));
  await db
    .insert(chartAssignmentsTable)
    .values({ chartId, title: chart.title, chartDate: chart.date, entries, stations })
    .onConflictDoUpdate({ target: chartAssignmentsTable.chartId, set: { title: chart.title, chartDate: chart.date, entries, stations, assignedAt: new Date() } });
  res.json({ id: chartId, stations });
});

// ------------------------------------------------- countdown charts per station
// The dashboard's SAVED countdowns (the /countdown picker), shown on a station's Radio
// screen. Only assigned ones are snapshotted, so history costs nothing for the rest.

/** Every saved countdown, with its stations, what is on air now and what history is stored. */
router.get("/countdown-charts", async (_req, res) => {
  const assigned = await db.select().from(countdownChartStationsTable);
  const stationsOf = new Map(assigned.map((a) => [a.countdownId, a.stations]));
  const stats = new Map((await historyStats()).map((s) => [s.countdownId, s]));
  let dash: DashboardCountdown[] = [];
  let warning: string | null = null;
  try {
    dash = await fetchDashboardCountdowns();
  } catch (err) {
    warning = "Could not read the dashboard's countdowns (" + (err instanceof Error ? err.message : String(err)) + "). Showing assigned ones only.";
  }
  const seen = new Set<string>();
  const rowFor = (id: string, name: string, onAir: number, building: boolean, error?: string) => {
    const s = stats.get(id);
    return {
      id, name, onAir, building, error: error ?? null,
      stations: stationsOf.get(id) ?? [],
      savedDays: s?.days ?? 0, firstDay: s?.first ?? null, lastDay: s?.last ?? null, bytes: s?.bytes ?? 0,
    };
  };
  const items = dash.map((c) => { seen.add(c.id); return rowFor(c.id, c.name, c.entries.length, c.building, c.error); });
  // An assigned countdown the dashboard no longer lists must still be removable here.
  for (const a of assigned) if (!seen.has(a.countdownId)) items.push(rowFor(a.countdownId, a.name, 0, false));
  const all = [...stats.values()];
  res.json({
    items, warning,
    totals: { savedDays: all.reduce((n, s) => n + s.days, 0), bytes: all.reduce((n, s) => n + s.bytes, 0) },
  });
});

/** Put a countdown on Radio, Xtra, both or neither. [] takes it off the app (saved days are kept). */
router.put("/countdown-charts/:id", async (req, res) => {
  const countdownId = req.params.id;
  const stations = Array.isArray(req.body?.stations)
    ? [...new Set((req.body.stations as unknown[]).filter((s): s is "radio" | "xtra" => s === "radio" || s === "xtra"))]
    : [];
  if (stations.length === 0) {
    await db.delete(countdownChartStationsTable).where(eq(countdownChartStationsTable.countdownId, countdownId));
    res.json({ id: countdownId, stations: [] });
    return;
  }
  let dash: DashboardCountdown[];
  try {
    dash = await fetchDashboardCountdowns();
  } catch {
    res.status(502).json({ error: "Could not reach the dashboard to read this countdown." });
    return;
  }
  const c = dash.find((d) => d.id === countdownId);
  if (!c) {
    res.status(404).json({ error: "That countdown no longer exists on the dashboard." });
    return;
  }
  await db
    .insert(countdownChartStationsTable)
    .values({ countdownId, name: c.name, stations })
    .onConflictDoUpdate({ target: countdownChartStationsTable.countdownId, set: { name: c.name, stations } });
  // Save today's chart now so the app has something to show straight away.
  const snapshot = await snapshotCountdown(c, todayInEat().date);
  res.json({ id: countdownId, stations, snapshot });
});

/** Clear saved history for one countdown (?countdown=id) or all. Today's chart is kept; history restarts from today. */
router.delete("/countdown-charts/history", async (req, res) => {
  if (req.query.confirm !== "yes") {
    res.status(400).json({ error: "Add ?confirm=yes to clear saved chart history." });
    return;
  }
  const countdownId = typeof req.query.countdown === "string" && req.query.countdown ? req.query.countdown : undefined;
  res.json(await clearHistory(countdownId));
});

export default router;
