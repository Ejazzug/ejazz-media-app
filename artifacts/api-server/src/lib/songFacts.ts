import { and, count, desc, eq, gte } from "drizzle-orm";
import { db, songFactsTable, type SongFact } from "@workspace/db";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import { generateWithGroq, isGroqConfigured } from "./groq";
import { getAppConfig } from "./appConfig";
import { logger } from "./logger";

/**
 * Facts shown under the player for the song that is on air.
 *
 * Lookup order: a song-level fact, then an artist-level one. If neither exists and
 * automatic generation is on, Gemini writes one the first time the song is seen and it is
 * stored, so each song costs one generation ever. A manual fact always wins and is never
 * overwritten by generation.
 */

const MAX_FIELD = 120;
/** How long the lookup will wait for a first-time generation before answering "no fact yet". */
const GENERATION_WAIT_MS = 12_000;
const RETRY_AFTER_ERROR_MS = 10 * 60 * 1000;

/** Lower-case, accent-free, brackets and "feat." tails removed, punctuation collapsed. */
export function normKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
    .replace(/\b(feat|ft|featuring)\b.*$/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The lead artist: everything before "&", "," , " x " or "and" is the headline act. */
export function artistKey(raw: string): string {
  const lead = raw.split(/\s+(?:&|x|and)\s+|,|;|\bfeat\b|\bft\b/i)[0] ?? raw;
  return normKey(lead);
}

export function titleKey(raw: string): string {
  return normKey(raw);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD) : "";
}

export async function findFact(artist: string, title: string): Promise<SongFact | null> {
  const ak = artistKey(artist);
  const tk = titleKey(title);
  if (!ak) return null;
  const rows = await db.select().from(songFactsTable).where(eq(songFactsTable.artistKey, ak));
  const usable = rows.filter((r) => r.enabled && r.body);
  return usable.find((r) => tk && r.titleKey === tk) ?? usable.find((r) => r.titleKey === "") ?? null;
}

/** True when this exact song was already tried (a stored "no fact" marker is enabled=false, body=""). */
async function alreadyTried(ak: string, tk: string): Promise<boolean> {
  const rows = await db
    .select({ id: songFactsTable.id })
    .from(songFactsTable)
    .where(and(eq(songFactsTable.artistKey, ak), eq(songFactsTable.titleKey, tk)))
    .limit(1);
  return rows.length > 0;
}

const inFlight = new Map<string, Promise<SongFact | null>>();
const cooldownUntil = new Map<string, number>();

/**
 * Whether another generation is allowed under the operator's hourly and daily caps. Counted
 * from the stored AI rows (a "no fact found" marker counts too: it cost a call), so the
 * caps survive a restart. The day is the server's local day. A cap of 0 stops generation.
 */
async function underBudget(maxPerHour: number, maxPerDay: number): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 3600_000);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const since = (d: Date) =>
    db.select({ n: count() }).from(songFactsTable).where(and(eq(songFactsTable.source, "ai"), gte(songFactsTable.createdAt, d)));
  const [[h], [d]] = await Promise.all([since(hourAgo), since(midnight)]);
  return (h?.n ?? 0) < maxPerHour && (d?.n ?? 0) < maxPerDay;
}

/**
 * "Clock this..." is meant to make a listener look up, so the prompt asks for the thing a fan
 * would not already know: what happened while the song was made, what the artist has said
 * about it, an unexpected connection. The obvious card -- release year, chart position, award
 * list, who featured -- is explicitly ruled out, because anyone can find it and nobody stops
 * for it. The accuracy rules stay as strict as before (NONE when unsure, never invent a quote):
 * a livelier remit is exactly where a model starts making things up, and one already did.
 */
function buildPrompt(artist: string, title: string): string {
  return [
    "You write one 'Clock this...' line for a radio app, shown under the player while a song plays.",
    `Song: "${title}" by ${artist}.`,
    "Make it fascinating: the story behind the song, something that happened while it was made or after it came out, what the artist themselves has said about it, an unexpected connection, a detail that surprises even a fan.",
    "Rules:",
    "- NOT the obvious. No bare release year, chart position, award list, streaming numbers, genre label or feature credit -- unless that fact is itself the surprise and you say what makes it surprising.",
    "- A short quote from the artist about the song is welcome: their real words only, and name them as the speaker. Never quote the lyrics.",
    "- One or two sentences, at most 45 words, plain text, no emoji, no hashtags.",
    "- Say only what you are genuinely confident is true. Do NOT guess, embellish, or invent a story, a quote, a name or a number.",
    "- If you know nothing fascinating about this song or artist that you are sure of, reply with exactly: NONE. A true but dull line is a NONE too.",
    "- Reply with the line only, or NONE.",
  ].join("\n");
}

async function generateText(provider: "gemini" | "groq", artist: string, title: string): Promise<string> {
  const prompt = buildPrompt(artist, title);
  if (provider === "groq") return generateWithGroq(prompt);
  // Search-grounded first, so a fact has something real behind it; if grounding itself is
  // unavailable (quota), fall back to the plain model under the same NONE-if-unsure rule.
  try {
    return (await generateWithGemini(prompt, { grounded: true })).text;
  } catch (err) {
    logger.warn({ err: String(err) }, "song fact: grounded generation failed, trying ungrounded");
    return (await generateWithGemini(prompt)).text;
  }
}

async function generateAndStore(provider: "gemini" | "groq", artist: string, title: string): Promise<SongFact | null> {
  const ak = artistKey(artist);
  const tk = titleKey(title);
  let text = "";
  try {
    text = await generateText(provider, artist, title);
  } catch (err) {
    // Not stored: a provider blip must not mark the song as "no fact" for good.
    cooldownUntil.set(`${ak}|${tk}`, Date.now() + RETRY_AFTER_ERROR_MS);
    logger.error({ err: String(err), provider }, "song fact: generation failed");
    return null;
  }
  const body = text.replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  const none = !body || /^none\b/i.test(body) || body.length < 15 || body.length > 400;
  const [row] = await db
    .insert(songFactsTable)
    .values({ artistKey: ak, titleKey: tk, artist, title, body: none ? "" : body, source: "ai", enabled: !none })
    .onConflictDoNothing()
    .returning();
  return row && row.enabled ? row : null;
}

/**
 * The fact for a track, generating one if allowed. Never throws: a failure is "no fact".
 */
export async function factForTrack(artistRaw: string, titleRaw: string): Promise<SongFact | null> {
  const artist = clean(artistRaw);
  const title = clean(titleRaw);
  if (!artist) return null;
  const existing = await findFact(artist, title);
  if (existing) return existing;

  const ak = artistKey(artist);
  const tk = titleKey(title);
  if (!ak || !tk) return null;
  const config = await getAppConfig();
  const provider = config.songFacts.provider;
  if (provider === "none" || !config.songFacts.autoGenerate || !(provider === "groq" ? isGroqConfigured() : isGeminiConfigured())) return null;
  if (await alreadyTried(ak, tk)) return null;

  const key = `${ak}|${tk}`;
  if ((cooldownUntil.get(key) ?? 0) > Date.now()) return null;
  let job = inFlight.get(key);
  if (!job) {
    if (!(await underBudget(config.songFacts.maxPerHour, config.songFacts.maxPerDay))) return null;
    job = generateAndStore(provider, artist, title).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), GENERATION_WAIT_MS))]);
}

export async function listFacts(): Promise<SongFact[]> {
  return db.select().from(songFactsTable).orderBy(desc(songFactsTable.updatedAt)).limit(500);
}
