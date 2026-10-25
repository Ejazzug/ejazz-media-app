import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, brandAssetsTable, presetsTable, templatesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";

/**
 * The EJazz in-house designer, server half.
 *
 * Division of labour, and it is not negotiable: PYTHON DRAWS, NODE REMEMBERS. The renderer of
 * record is /opt/radio/lib/designer.py behind the Flask dashboard on 127.0.0.1:9000; this file
 * owns the brand store, the presets and the operator's templates in Postgres, and proxies a
 * render. Nothing here measures text or opens an image, so there is exactly one answer to
 * "what does this design look like". The shipped app never draws either -- it is handed a URL.
 *
 * VALIDATION IS ALSO PYTHON'S. Saving a template calls the dashboard's /api/design-validate
 * rather than re-stating the rules in TypeScript, because a second copy would drift the first
 * time a rule changed.
 *
 * ejazz-proxy must forward /api/designer/ here or every one of these falls through to Flask
 * and 404s -- see CLAUDE.md, "Public routing".
 */

const router: IRouter = Router();

/** The Flask dashboard, same box. Not configurable on purpose: a designer pointed at another
 * host would render with another box's fonts and assets. */
const RENDERER = "http://127.0.0.1:9000";
const RENDER_TIMEOUT_MS = 30000;

/** Rendered JPEGs, keyed by a hash of template + preset + data + size. Pure cache: deleting
 * the folder costs one re-render and nothing else, which is why it is not in Postgres. */
const CACHE_DIR = path.resolve(
  typeof __dirname === "string" ? __dirname : ".",
  "../cache/designer",
);
const CACHE_MAX_FILES = 400;

type Json = Record<string, unknown>;

function cacheKey(parts: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function trimCache(): Promise<void> {
  try {
    const names = await fsp.readdir(CACHE_DIR);
    if (names.length <= CACHE_MAX_FILES) return;
    const stats = await Promise.all(
      names.map(async (n) => ({ n, t: (await fsp.stat(path.join(CACHE_DIR, n))).mtimeMs })),
    );
    stats.sort((a, b) => a.t - b.t);
    for (const s of stats.slice(0, stats.length - CACHE_MAX_FILES)) {
      await fsp.rm(path.join(CACHE_DIR, s.n), { force: true });
    }
  } catch {
    // A cache that cannot be trimmed is not a failed request.
  }
}

/** Ask the dashboard to validate a template. A dashboard that is down must not let an invalid
 * template be saved, so an unreachable validator is a refusal, not a pass. */
async function validateTemplate(body: unknown): Promise<string[] | null> {
  const r = await fetch(RENDERER + "/api/design-validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: body }),
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error("the renderer answered " + r.status + " to a validate request");
  const out = (await r.json()) as { ok?: boolean; problems?: string[] };
  return out.ok ? null : out.problems || ["the template was refused but no reason came back"];
}

/** The template a render should use: the operator's own first, then the ones that shipped on
 * disk with the box. */
async function resolveTemplate(id: string): Promise<Json | null> {
  const rows = await db.select().from(templatesTable).where(eq(templatesTable.id, id)).limit(1);
  if (rows.length && rows[0].body && Object.keys(rows[0].body).length) return rows[0].body as Json;
  try {
    const r = await fetch(RENDERER + "/api/design-templates", { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (!r.ok) return null;
    const out = (await r.json()) as { items?: Array<{ id?: string; body?: Json }> };
    return (out.items || []).find((t) => t.id === id)?.body || null;
  } catch {
    return null;
  }
}

async function resolvePreset(ref: string | undefined): Promise<Json | null> {
  const key = (ref || "").trim();
  if (!key) return null;
  const rows = await db.select().from(presetsTable).where(eq(presetsTable.name, key)).limit(1);
  if (rows.length) return (rows[0].settings || {}) as Json;
  // A uuid is accepted too, so the editor can apply a preset it has only the id for.
  if (/^[0-9a-f-]{36}$/i.test(key)) {
    const byId = await db.select().from(presetsTable).where(eq(presetsTable.id, key)).limit(1);
    if (byId.length) return (byId[0].settings || {}) as Json;
  }
  return null;
}

/** Render through the dashboard and return the JPEG bytes, cached on disk by content. */
async function renderJpeg(body: Json, size: string | undefined, data: Json, preset: Json | null) {
  const key = cacheKey({ body, size: size || null, data, preset });
  const file = path.join(CACHE_DIR, key + ".jpg");
  try {
    const cached = await fsp.readFile(file);
    return { bytes: cached, key, cached: true, headers: {} as Record<string, string> };
  } catch {
    // not cached yet
  }
  const r = await fetch(RENDERER + "/api/design-render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: body, size, data, preset }),
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  if (!r.ok) {
    const text = await r.text();
    const err: Error & { status?: number; detail?: string } = new Error("render failed");
    err.status = r.status === 400 ? 400 : 502;
    err.detail = text.slice(0, 600);
    throw err;
  }
  const bytes = Buffer.from(await r.arrayBuffer());
  const headers: Record<string, string> = {};
  for (const h of ["x-design-size", "x-design-quality", "x-design-bytes", "x-design-missing-fonts", "x-design-warnings"]) {
    const v = r.headers.get(h);
    if (v) headers[h] = v;
  }
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.writeFile(file, bytes);
  void trimCache();
  return { bytes, key, cached: false, headers };
}

// --------------------------------------------------------------------- brand
router.get("/brand", requireAdmin, async (_req, res) => {
  const items = await db.select().from(brandAssetsTable).orderBy(brandAssetsTable.kind, brandAssetsTable.name);
  // A logo whose file has gone is reported, not hidden: the designer would otherwise offer a
  // logo that renders as nothing and the operator would blame the renderer.
  res.json(items.map((a) => ({
    ...a,
    missing: a.kind === "logo" ? !fs.existsSync(a.value) : false,
  })));
});

const KINDS = ["logo", "colour", "font"] as const;

function brandInput(body: unknown): { value?: { kind: typeof KINDS[number]; name: string; value: string }; error?: string } {
  const b = (body || {}) as Json;
  const kind = String(b.kind || "").trim() as typeof KINDS[number];
  const name = String(b.name || "").trim();
  const value = String(b.value || "").trim();
  if (!KINDS.includes(kind)) return { error: "kind must be logo, colour or font." };
  if (!name) return { error: "Give the asset a name." };
  if (!value) return { error: "Give the asset a value (a path, a hex colour or a font name)." };
  if (kind === "colour" && !/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
    return { error: "A colour must be a hex value such as #FF0056." };
  }
  if (kind === "logo" && !path.isAbsolute(value)) {
    return { error: "A logo must be an absolute path to a file on this box." };
  }
  return { value: { kind, name, value } };
}

router.post("/brand", requireAdmin, async (req, res) => {
  const { value, error } = brandInput(req.body);
  if (error || !value) { res.status(400).json({ error }); return; }
  const [row] = await db.insert(brandAssetsTable).values(value).returning();
  res.status(201).json(row);
});

router.put("/brand/:id", requireAdmin, async (req, res) => {
  const { value, error } = brandInput(req.body);
  if (error || !value) { res.status(400).json({ error }); return; }
  const [row] = await db.update(brandAssetsTable)
    .set({ ...value, updatedAt: new Date() })
    .where(eq(brandAssetsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "No such brand asset." }); return; }
  res.json(row);
});

router.delete("/brand/:id", requireAdmin, async (req, res) => {
  const [row] = await db.delete(brandAssetsTable).where(eq(brandAssetsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "No such brand asset." }); return; }
  res.json({ deleted: row.id });
});

// --------------------------------------------------------------------- presets
router.get("/presets", requireAdmin, async (_req, res) => {
  res.json(await db.select().from(presetsTable).orderBy(presetsTable.name));
});

router.post("/presets", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  const name = String(b.name || "").trim();
  if (!name) { res.status(400).json({ error: "A preset needs a name." }); return; }
  const settings = (b.settings && typeof b.settings === "object" ? b.settings : {}) as Json;
  try {
    const [row] = await db.insert(presetsTable)
      .values({ name, kind: String(b.kind || "design"), settings }).returning();
    res.status(201).json(row);
  } catch (err) {
    // The unique index on name is the real guard; this turns it into a sentence.
    res.status(409).json({ error: "A preset called " + name + " already exists.", detail: String(err).slice(0, 200) });
  }
});

router.put("/presets/:id", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  const patch: Json = { updatedAt: new Date() };
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.kind === "string" && b.kind.trim()) patch.kind = b.kind.trim();
  if (b.settings && typeof b.settings === "object") patch.settings = b.settings;
  const [row] = await db.update(presetsTable).set(patch)
    .where(eq(presetsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "No such preset." }); return; }
  res.json(row);
});

router.delete("/presets/:id", requireAdmin, async (req, res) => {
  const [row] = await db.delete(presetsTable).where(eq(presetsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "No such preset." }); return; }
  res.json({ deleted: row.id });
});

// --------------------------------------------------------------------- templates
router.get("/templates", requireAdmin, async (_req, res) => {
  const own = await db.select().from(templatesTable).orderBy(templatesTable.name);
  const items = own.map((t) => ({ id: t.id, name: t.name, body: t.body, source: "db", updatedAt: t.updatedAt }));
  const haveIds = new Set(items.map((t) => t.id));
  try {
    const r = await fetch(RENDERER + "/api/design-templates", { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (r.ok) {
      const out = (await r.json()) as { items?: Array<{ id: string; name: string; body: Json }> };
      for (const t of out.items || []) {
        // A saved template of the same id wins -- editing a shipped template saves a copy in
        // Postgres and the disk original stays as it was, so nothing in /opt/radio is edited
        // from the Control Room.
        if (!haveIds.has(t.id)) items.push({ id: t.id, name: t.name, body: t.body, source: "disk", updatedAt: null as unknown as Date });
      }
    }
  } catch (err) {
    logger.warn({ err }, "designer: could not list the dashboard's templates");
  }
  res.json(items);
});

router.get("/templates/:id", requireAdmin, async (req, res) => {
  const body = await resolveTemplate(String(req.params.id));
  if (!body) { res.status(404).json({ error: "No such template." }); return; }
  res.json({ id: String(req.params.id), body });
});

async function saveTemplate(id: string, body: Json, name: string, res: Parameters<Parameters<IRouter["post"]>[1]>[1]) {
  let problems: string[] | null;
  try {
    problems = await validateTemplate(body);
  } catch (err) {
    res.status(502).json({ error: "The renderer could not be reached, so the template was not saved.", detail: String(err).slice(0, 200) });
    return;
  }
  if (problems) { res.status(400).json({ error: "This template cannot be saved yet.", problems }); return; }
  const [row] = await db.insert(templatesTable)
    .values({ id, name, body })
    .onConflictDoUpdate({ target: templatesTable.id, set: { name, body, updatedAt: new Date() } })
    .returning();
  res.json(row);
}

router.post("/templates", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  const body = (b.body && typeof b.body === "object" ? b.body : b) as Json;
  const id = String(body.id || b.id || "").trim();
  if (!id) { res.status(400).json({ error: "A template needs an id." }); return; }
  await saveTemplate(id, body, String(body.name || b.name || id), res);
});

router.put("/templates/:id", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  const body = (b.body && typeof b.body === "object" ? b.body : b) as Json;
  // The id in the path wins, and the body is corrected to match: a template whose row id and
  // own id disagree renders to the wrong filename.
  body.id = String(req.params.id);
  await saveTemplate(String(req.params.id), body, String(body.name || b.name || String(req.params.id)), res);
});

router.delete("/templates/:id", requireAdmin, async (req, res) => {
  const [row] = await db.delete(templatesTable).where(eq(templatesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "No such template (templates that shipped on disk cannot be deleted here)." }); return; }
  res.json({ deleted: row.id });
});

// --------------------------------------------------------------------- render
function dataFromQuery(raw: unknown): Json {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Json) : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/designer/render/:template_id?size=1080x1080&preset=<name>&data=<json>
 *
 * Public on purpose, like /api/countdown-cards on the dashboard: the output is brand artwork
 * meant to be linked from the website and a share sheet, and a caller with no cookie must be
 * able to fetch the image. Everything that WRITES is admin-gated above.
 */
router.get("/render/:template_id", async (req, res) => {
  const id = String(req.params.template_id || "").replace(/\.jpe?g$/i, "");
  const body = await resolveTemplate(id);
  if (!body) { res.status(404).json({ error: "No such template." }); return; }
  const preset = await resolvePreset(typeof req.query.preset === "string" ? req.query.preset : undefined);
  if (typeof req.query.preset === "string" && req.query.preset.trim() && !preset) {
    res.status(404).json({ error: "No preset called " + req.query.preset + "." });
    return;
  }
  try {
    const out = await renderJpeg(
      body,
      typeof req.query.size === "string" ? req.query.size : undefined,
      dataFromQuery(req.query.data),
      preset,
    );
    res.type("image/jpeg");
    res.setHeader("ETag", '"' + out.key + '"');
    res.setHeader("X-Design-Cache", out.cached ? "hit" : "miss");
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.send(out.bytes);
  } catch (err) {
    const e = err as Error & { status?: number; detail?: string };
    logger.warn({ err }, "designer render failed");
    res.status(e.status || 502).json({ error: "The render failed.", detail: e.detail || String(err).slice(0, 300) });
  }
});

/**
 * POST /api/designer/render -- render a template body that has not been saved yet. The editor's
 * preview pane needs this: a preview of the saved version would show the operator something
 * other than what is on their canvas.
 */
router.post("/render", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  const body = (b.template && typeof b.template === "object" ? b.template : null) as Json | null;
  if (!body) { res.status(400).json({ error: "Send the template to render as 'template'." }); return; }
  const preset = b.preset && typeof b.preset === "object"
    ? (b.preset as Json)
    : await resolvePreset(typeof b.preset === "string" ? b.preset : undefined);
  try {
    const out = await renderJpeg(
      body,
      typeof b.size === "string" ? b.size : undefined,
      (b.data && typeof b.data === "object" ? b.data : {}) as Json,
      preset,
    );
    res.type("image/jpeg");
    res.setHeader("X-Design-Cache", out.cached ? "hit" : "miss");
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.send(out.bytes);
  } catch (err) {
    const e = err as Error & { status?: number; detail?: string };
    res.status(e.status || 502).json({ error: "The render failed.", detail: e.detail || String(err).slice(0, 300) });
  }
});

/**
 * POST /api/designer/apply-preset -- {template, preset} in, the merged template out.
 *
 * A proxy to the renderer's own apply_preset(), on purpose: the editor needs the merged
 * template to put on its canvas, and merging it here in TypeScript would be a second set of
 * rules about what a preset may change.
 */
router.post("/apply-preset", requireAdmin, async (req, res) => {
  const b = (req.body || {}) as Json;
  if (!b.template || typeof b.template !== "object") {
    res.status(400).json({ error: "Send the template to merge into as 'template'." });
    return;
  }
  try {
    const r = await fetch(RENDERER + "/api/design-apply-preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template: b.template, preset: b.preset || {} }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    const out = await r.json();
    res.status(r.status).json(out);
  } catch (err) {
    res.status(502).json({ error: "The renderer could not be reached.", detail: String(err).slice(0, 200) });
  }
});

export default router;
