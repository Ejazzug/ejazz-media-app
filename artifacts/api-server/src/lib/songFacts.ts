import { and, count, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
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

/**
 * True when this exact song was already tried AND is not yet due another go.
 *
 * A stored "no fact" marker is enabled=false, body="". It used to block a song for good, which
 * is how 109 songs came to be permanently factless after a single ask on an ungrounded
 * provider: the marker records that a call was SPENT, not that the song is dull. `retry_after`
 * is the way back — a marker with a date in the past is treated as never tried, so the sweep
 * can ask again on a better path.
 */
async function alreadyTried(ak: string, tk: string): Promise<boolean> {
  const rows = await db
    .select({ id: songFactsTable.id })
    .from(songFactsTable)
    .where(and(
      eq(songFactsTable.artistKey, ak),
      eq(songFactsTable.titleKey, tk),
      or(isNull(songFactsTable.retryAfter), gte(songFactsTable.retryAfter, new Date())),
    ))
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
    "The audience is Gen Z in Uganda. Write like the best thing you heard today, not like a press release.",
    `Song: "${title}" by ${artist}.`,
    "Make it fascinating: the story behind the song, something that happened while it was made or after it came out, what the artist themselves has said about it, an unexpected connection, a detail that surprises even a fan.",
    "HOW IT SHOULD READ",
    "- Lead with the surprise. The first six words decide whether anybody reads the rest, so the twist goes at the FRONT, never after a wind-up like 'Did you know that' or 'Interestingly'.",
    "- Say it the way you would say it to a friend: short words, present tense where it fits, one idea per sentence. No 'renowned', no 'iconic', no 'the hit single', no 'beloved'.",
    "- Do NOT begin with 'Clock this' or 'Clock it'. The app already prints those words directly above your line, and a line that opens with them says them twice.",
    "- No emoji, no hashtags, no ALL CAPS, no exclamation marks. The line is the energy; punctuation is not.",
    // The line is read on its own under the player, with no heading naming the artist above
    // it, so "She broke into the scene in 2014" is a sentence about nobody (owner,
    // 2026-11-23). `nameTheSubject()` repairs what is already stored; this stops new ones.
    "- NAME WHO IT IS ABOUT. Never open with a bare 'She', 'He' or 'They': the line is read on its own, with nothing above it saying whose song this is. Use the artist's name the first time, pronouns after that.",
    "- Finish the sentence. Never end on an ellipsis or trail off: a line that stops dead reads as a bug, not as suspense.",
    "THE FACTS ARE NOT NEGOTIABLE. The voice is yours; the facts are not.",
    "- NOT the obvious. No bare release year, chart position, award list, streaming numbers, genre label or feature credit -- unless that fact is itself the surprise and you say what makes it surprising.",
    "- A short quote from the artist about the song is welcome: their real words only, and name them as the speaker. Never quote the lyrics.",
    "- One or two sentences, at most 45 words, plain text.",
    "- Say only what you are genuinely confident is true. Do NOT guess, embellish, or invent a story, a quote, a name, a number or a drama that did not happen. Writing it with more life is not permission to write more than you know: a made-up detail is worse than a dull one.",
    "- If you know nothing fascinating about this song or artist that you are sure of, reply with exactly: NONE. A true but dull line is a NONE too.",
    "- Reply with the line only, or NONE.",
  ].join("\n");
}

/** The line, plus whatever a grounded answer says it read. Citations for a human, never quotable sources. */
interface GeneratedLine {
  text: string;
  sources: { title: string; url: string }[];
  /**
   * Whether the answer actually had the web behind it.
   *
   * This is not bookkeeping. An operator who picks the grounded provider is paying for the
   * search; if grounding is unavailable and the plain model shrugs, that NONE says nothing
   * about the song and must not cost it its retry. See `generateAndStore`.
   */
  grounded: boolean;
}

/** How long a song waits for another go after an UNGROUNDED shrug. */
const RETRY_AFTER_UNGROUNDED_MS = 24 * 60 * 60 * 1000;

async function generateText(provider: "gemini" | "groq", artist: string, title: string): Promise<GeneratedLine> {
  const prompt = buildPrompt(artist, title);
  if (provider === "groq") return { text: await generateWithGroq(prompt), sources: [], grounded: false };
  // Search-grounded first, so a fact has something real behind it; if grounding itself is
  // unavailable (quota), fall back to the plain model under the same NONE-if-unsure rule --
  // but SAY that it was ungrounded, so a shrug from it is not mistaken for an answer.
  try {
    const result = await generateWithGemini(prompt, { grounded: true });
    return { text: result.text, sources: result.sources, grounded: true };
  } catch (err) {
    logger.warn({ err: String(err) }, "song fact: grounded generation failed, trying ungrounded");
    return { text: (await generateWithGemini(prompt)).text, sources: [], grounded: false };
  }
}

/**
 * Write the answer down, whatever it was.
 *
 * `hold` is the library sweep's flag: a swept fact lands **disabled**, because the automatic
 * proofread that decides whether it is fit to show a listener runs on the dashboard side
 * (grounding.py lives there) and PATCHes the verdict back. Without it a swept fact would be
 * live under the player before anything had read it. The on-demand path leaves `hold` off and
 * behaves exactly as it always has.
 *
 * The conflict clause is an UPDATE rather than DoNothing so that a retried marker can be
 * replaced -- but it **spares a human's work**: `source='manual'` (anything typed or edited in
 * the facts section) and `proof_state='human'` (a proofread wording) are never overwritten by
 * generation, the same rule the sheet sync follows.
 */
async function generateAndStore(
  provider: "gemini" | "groq",
  artist: string,
  title: string,
  opts: { hold?: boolean } = {},
): Promise<SongFact | null> {
  const ak = artistKey(artist);
  const tk = titleKey(title);
  let line: GeneratedLine;
  try {
    line = await generateText(provider, artist, title);
  } catch (err) {
    // Not stored: a provider blip must not mark the song as "no fact" for good.
    cooldownUntil.set(`${ak}|${tk}`, Date.now() + RETRY_AFTER_ERROR_MS);
    logger.error({ err: String(err), provider }, "song fact: generation failed");
    return null;
  }
  const whole = line.text.replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  // SPLIT AT WRITE TIME, not when a listener asks (owner, 2026-11-22: *"don't push all facts
  // at once, i need them saved in the database so that you can shuffle them"*). The model
  // answers with a bulleted list, and storing that blob in `body` is what made the app print
  // three facts in one block. One row per song is deliberate here -- the unique
  // (artist_key, title_key) index is what findFact, alreadyTried, the upsert, the sheet sync
  // and the CSV import are all built on -- so the song's OTHER facts go where the schema
  // already puts them: `variants`, which the serving path shuffles over. `body` keeps the
  // first one, because every other reader (the card, the CSV, the hub) reads `body`.
  const lines = factLines(whole);
  const body = lines[0] ?? "";
  const extra = lines.slice(1, MAX_WORDINGS);
  const none = !body || /^none\b/i.test(body) || body.length < 15 || body.length > 400;
  const values = {
    artistKey: ak,
    titleKey: tk,
    artist,
    title,
    body: none ? "" : body,
    source: "ai",
    enabled: none ? false : !opts.hold,
    proofState: "",
    proofNotes: "",
    // A marker normally means "asked, and the answer was nothing" -- permanent until an
    // operator clears it. But an UNGROUNDED shrug is not that answer: on 2026-11-18 the
    // Gemini search quota was exhausted, every grounded call 429'd, the plain model replied
    // NONE under the strict prompt, and three songs were marked dead for good on the
    // strength of a call that never reached the web. A nothing from a model with no search
    // behind it earns the song another go instead.
    retryAfter: none && !line.grounded ? new Date(Date.now() + RETRY_AFTER_UNGROUNDED_MS) : null,
    sources: line.sources.length ? line.sources : null,
    variants: none || !extra.length ? null : extra,
  };
  const [row] = await db
    .insert(songFactsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [songFactsTable.artistKey, songFactsTable.titleKey],
      set: { ...values, updatedAt: new Date() },
      setWhere: and(ne(songFactsTable.source, "manual"), ne(songFactsTable.proofState, "human")),
    })
    .returning();
  // The RAW row, enabled or not: the sweep needs to see a held fact, and `showable()` is what
  // decides whether a listener may. A null here means the provider failed or the conflict
  // clause spared a human's row.
  return row ?? null;
}

/** Whether a row is fit to put under the player: switched on, and with something in it. */
function showable(row: SongFact | null): SongFact | null {
  return row && row.enabled && row.body ? row : null;
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
    job = generateAndStore(provider, artist, title)
      .then(showable)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), GENERATION_WAIT_MS))]);
}

/** Why a sweep call ended the way it did. Reported as-is, so a sweep can never flatter itself. */
export type SweepOutcome =
  | "existing"        // a usable fact was already there; nothing was spent
  | "written"         // a fact was written (held for proofreading unless asked otherwise)
  | "none"            // the provider said NONE, and that is now recorded as a marker
  | "spared"          // a human's fact or wording is on this song; generation left it alone
  | "already-tried"   // a marker is in place and not yet due a retry
  | "budget"          // the hourly or daily cap is spent
  | "provider-off"    // no provider, no key, or automatic generation switched off
  | "bad-input"       // no artist, or no title to key on
  | "error";          // the provider failed; nothing was recorded, so it can be asked again

export interface SweepResult {
  outcome: SweepOutcome;
  fact: SongFact | null;
  message: string;
}

/**
 * Ask for ONE song, for the library sweep, and say plainly what happened.
 *
 * This exists rather than the sweep calling `factForTrack()` because that function answers a
 * phone: it returns `null` for eight different reasons and a sweep that cannot tell "the cap
 * is spent" from "this song is dull" would report nonsense and keep hammering a spent budget.
 * Every rule still comes from the same place -- the same provider config, the same caps, the
 * same markers, the same writer -- this only reports which one applied.
 *
 * `hold` defaults to TRUE: a swept fact is written disabled and waits for the proofread.
 */
export async function sweepTrack(
  artistRaw: string,
  titleRaw: string,
  opts: { hold?: boolean } = {},
): Promise<SweepResult> {
  const hold = opts.hold !== false;
  const artist = clean(artistRaw);
  const title = clean(titleRaw);
  if (!artist) return { outcome: "bad-input", fact: null, message: "No artist." };

  const existing = await findFact(artist, title);
  if (existing) return { outcome: "existing", fact: existing, message: "Already had a fact." };

  const ak = artistKey(artist);
  const tk = titleKey(title);
  if (!ak || !tk) return { outcome: "bad-input", fact: null, message: "Nothing to key this song on." };

  const config = await getAppConfig();
  const provider = config.songFacts.provider;
  if (provider === "none") return { outcome: "provider-off", fact: null, message: "No fact provider is chosen." };
  if (!(provider === "groq" ? isGroqConfigured() : isGeminiConfigured())) {
    return { outcome: "provider-off", fact: null, message: `The ${provider} key is not set on this service.` };
  }
  // NOTE: config.songFacts.autoGenerate is deliberately NOT consulted. That switch governs
  // whether a LISTENER's request may spend a call; a sweep is the operator asking directly.
  if (await alreadyTried(ak, tk)) {
    return { outcome: "already-tried", fact: null, message: "Asked before, and not yet due another go." };
  }
  if (!(await underBudget(config.songFacts.maxPerHour, config.songFacts.maxPerDay))) {
    return { outcome: "budget", fact: null, message: `Cap reached (${config.songFacts.maxPerHour}/hour, ${config.songFacts.maxPerDay}/day).` };
  }

  const row = await generateAndStore(provider, artist, title, { hold });
  if (!row) {
    // Either the provider failed (nothing written, so it can be asked again) or the conflict
    // clause spared a human's row. The marker tells them apart.
    const [current] = await db.select().from(songFactsTable)
      .where(and(eq(songFactsTable.artistKey, ak), eq(songFactsTable.titleKey, tk))).limit(1);
    if (current && (current.source === "manual" || current.proofState === "human")) {
      return { outcome: "spared", fact: current, message: "A person's fact is on this song; it was left alone." };
    }
    return { outcome: "error", fact: null, message: "The provider did not answer; nothing was recorded." };
  }
  if (!row.body) return { outcome: "none", fact: row, message: "The provider knew nothing it was sure of." };
  return {
    outcome: "written",
    fact: row,
    message: hold ? "Written, waiting for the proofread." : "Written and live.",
  };
}

export async function listFacts(): Promise<SongFact[]> {
  return db.select().from(songFactsTable).orderBy(desc(songFactsTable.updatedAt)).limit(500);
}

/** One row of numbers about the fact store, for the facts section and the sweep's progress line. */
export async function factCounts(): Promise<Record<string, number>> {
  const [row] = await db.execute<Record<string, number>>(sql`
    select
      count(*)::int                                                         as total,
      count(*) filter (where enabled and body <> '')::int                   as live,
      count(*) filter (where not enabled and body <> '')::int               as held,
      count(*) filter (where body = '')::int                                as no_fact,
      count(*) filter (where source = 'manual')::int                        as manual,
      count(*) filter (where proof_state = 'auto')::int                     as proofread_auto,
      count(*) filter (where proof_state = 'human')::int                    as proofread_human,
      count(*) filter (where pushed_at is not null)::int                     as pushed,
      count(*) filter (where retry_after is not null and retry_after <= now())::int as due_retry
    from song_facts
  `).then((r) => r.rows);
  return row ?? {};
}

// ===========================================================================
// More than one wording per song
// ===========================================================================
//
// A song that comes round twice a day showed the same sentence every time. `variants` holds
// the other wordings; `body` is the first one and the one everything else edits. Two ways to
// fill it: the CSV import (a second row for the same song becomes a second wording) and
// `rephraseFact()` below.
//
// **Rephrasing is a Groq job on purpose.** It asserts nothing new -- the claim is already
// there and already checked -- so it needs no search grounding, which is exactly the quota
// that ran out on 2026-11-18 and stopped new facts being written at all. Rewording what is
// already verified is the one fact-shaped job an ungrounded model can be trusted with.

/** The most wordings one song may carry, including `body`. */
export const MAX_WORDINGS = 5;

/**
 * One stored body, split into the SEPARATE FACTS it actually contains.
 *
 * The generator writes a bulleted list into one row -- "\u2022 fact one \u2022 fact two
 * \u2022 fact three" is what is in the table right now -- and the app showed that whole string
 * under "CLOCK THIS...", so a listener got three facts in one grey block (owner, 2026-11-22:
 * *"clock this shows all facts i need the system to show one fact at a time"*).
 *
 * Splitting here rather than in the app, and rather than by rewriting the table: the rows are
 * the record and other things read them (the CSV, the repurpose hub, the cards), so the fix
 * belongs at the point where one fact is handed to a listener. A body with no bullet in it is
 * one fact and comes back unchanged.
 */
export function factLines(text: string | null | undefined): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  // Bullets (\u2022 \u00b7 \u2023 \u25aa), a dash used as one at the start of a line, and plain
  // line breaks. A hyphen INSIDE a sentence is not a separator, which is why the dash case is
  // anchored to the start of a line only.
  const parts = raw
    .split(/\s*[\u2022\u00b7\u2023\u25aa\u25cf]\s*|\n+\s*[-\u2013]\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  return parts.length ? parts : [raw];
}

/**
 * Whether a wording is a whole fact rather than the tail end of one.
 *
 * 1069 rows came in through the CSV import on 2026-11-22 carrying variants that had been cut
 * mid-sentence -- "She first broke into the Kampala music scene in 2014 after..." -- and 72
 * that were nothing but an ellipsis. The bodies were all intact; only the extra wordings were
 * damaged, and the app duly printed a sentence that stops dead (owner, 2026-11-23: *"some
 * don't show full text"*).
 *
 * Filtering at serve time rather than only cleaning the table, because the table is the
 * record and a future import can do this again. The floor is the same one the writer applies
 * to `body` (15 characters), plus: nothing that ends in an ellipsis, which in this data never
 * means style and always means the text was cut.
 */
export function isWholeFact(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 15) return false;
  if (/(\.\.\.|\u2026)$/.test(t)) return false;
  return true;
}

/**
 * Put the artist's NAME where a bare pronoun opens a fact.
 *
 * Under the player a fact is read on its own, with no heading above it, so "She first broke
 * into the Kampala music scene in 2014" is a sentence about nobody (owner, 2026-11-23: *"some
 * facts arent clear, for example if a fact says 'she broke ....' who are we talking about"*).
 * On a card the artist is printed underneath and the pronoun resolves; in the app it does
 * not, and the app is where most of these are read.
 *
 * Only the OPENING pronoun is replaced, and only when the fact does not already name the
 * artist somewhere: rewriting every pronoun would turn a two-clause fact into a paragraph
 * that repeats the name, and the fact's own words are the record.
 */
export function nameTheSubject(text: string, artist: string | null | undefined): string {
  const t = (text ?? "").trim();
  const name = (artist ?? "").trim();
  if (!t || !name) return t;
  if (t.toLowerCase().includes(name.toLowerCase())) return t;
  const subject = /^(she|he|they)\b/i;
  const possessive = /^(her|his|their)\b/i;
  if (subject.test(t)) return name + t.replace(subject, "");
  // "Her debut single ..." -> "Azawi's debut single ...", and an "s" already on the end of
  // the name takes the bare apostrophe English gives it.
  if (possessive.test(t)) {
    const owned = /s$/i.test(name) ? name + "'" : name + "'s";
    return owned + t.replace(possessive, "");
  }
  return t;
}

/** Every usable wording of a fact, `body` first. */
export function wordings(row: SongFact | null): string[] {
  if (!row || !row.body) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // Each stored string is first split into the facts it contains, so a three-bullet body
  // becomes three entries here and `pickWording` hands out ONE of them.
  const flat: string[] = [];
  // What `body` looks like AFTER the rename, so the exemption below still recognises it.
  const named_body = nameTheSubject((row.body ?? "").trim(), row.artist);
  for (const stored of [row.body, ...(row.variants ?? [])]) {
    for (const line of factLines(stored)) flat.push(nameTheSubject(line, row.artist));
  }
  for (const w of flat) {
    const t = (w ?? "").trim();
    const k = t.toLowerCase();
    // `body` is exempt from the whole-fact test: it is what every other reader shows, and a
    // listener seeing the same text the card shows beats showing nothing at all.
    if (t !== named_body && !isWholeFact(t)) continue;
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(0, MAX_WORDINGS);
}

/**
 * Which wording to show next, rotated per song.
 *
 * In memory, so it resets when the service restarts and is not shared between processes.
 * That is the right amount of machinery for this: the cost of a repeat is a listener reading
 * the same sentence twice, and the alternative -- a counter column written on every play --
 * means a database write every time anybody's player ticks over.
 */
const nextWording = new Map<number, number>();

export function pickWording(row: SongFact | null): string {
  const all = wordings(row);
  if (!all.length) return "";
  if (all.length === 1 || !row) return all[0];
  const i = (nextWording.get(row.id) ?? 0) % all.length;
  nextWording.set(row.id, (i + 1) % all.length);
  return all[i];
}

const REPHRASE_PROMPT = [
  "Rewrite this one-sentence music fact in a different way.",
  "Keep every fact, name, number and date exactly as it is. Add nothing that is not already there.",
  "Do not add an opinion, a question, an exclamation or a greeting.",
  "Keep it under 40 words, one sentence, plain radio English.",
  "If the sentence quotes somebody, keep the quoted words character for character.",
  "Reply with the rewritten sentence only, and nothing else.",
  "",
  "SENTENCE: ",
].join("\n");

/**
 * Trim a reply, unwrapping it only if the quotation marks go round the WHOLE thing.
 *
 * A plain `.replace(/["']+$/)` takes the closing mark off any sentence that ENDS in a
 * quotation -- `Tems said: "I kept going."` -- which leaves it unbalanced and, worse, hides
 * the quote from the guard below, so a reply that HAD altered the quoted words would sail
 * through. The dashboard's `fact_proof.tidy()` had the identical bug and the identical fix.
 */
export function unwrap(reply: string): string {
  const t = (reply ?? "").replace(/\s+/g, " ").trim();
  const first = t[0];
  if (t.length > 2 && (first === '"' || first === "'") && t[t.length - 1] === first
      && !t.slice(1, -1).includes(first)) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Markdown emphasis, inline code and links flattened to the words they wrapped.
 *
 * Nothing downstream of a fact renders markdown -- it is DRAWN on a card, read aloud, and
 * posted as a caption -- so `*Sweet & Sour*` reached a card with its asterisks showing. Each
 * pattern strips a PAIR of markers and keeps what they wrapped; an unpaired marker is left
 * alone, because a lone character is as likely to be the fact's own punctuation as it is to
 * be decoration. This is the same rule, with the same conservatism, as `demarkdown()` in
 * `/opt/radio/lib/fact_proof.py` -- the dashboard tidies a fact on the way in and Groq can
 * put markdown straight back on the way out, so both ends need it.
 */
export function demarkdown(text: string): string {
  let out = (text ?? "").replace(/\[(?=\S)([^\]]+?)(?<=\S)\]\((?:[^)\s]+)(?:\s+"[^"]*")?\)/g, "$1");
  const res = [
    /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g,
    /(?<!\*)\*(?=\S)([^*]+?)(?<=\S)\*(?!\*)/g,
    /(?<![\w_])__(?=\S)([\s\S]+?)(?<=\S)__(?![\w_])/g,
    /(?<![\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])/g,
    /`(?=\S)([^`]+?)(?<=\S)`/g,
  ];
  for (const re of res) {
    // Twice: `**a *b* c**` needs the outer pair gone before the inner one is a pair.
    out = out.replace(re, "$1").replace(re, "$1");
  }
  return out;
}

const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).sort().join(",");
const quotesIn = (s: string) => (s.match(/["“]([^"”]{8,240})["”]/g) ?? []).join("|");

/** Why a rephrase attempt ended as it did. Reported as-is. */
export interface RephraseResult {
  ok: boolean;
  added: number;
  wordings: string[];
  message: string;
}

/**
 * Ask Groq for more wordings of a fact that is already stored, and keep the ones that are
 * faithful to it.
 *
 * **A reply that moves a number or changes the quoted words is thrown away.** That is the
 * same rule `lib/fact_proof.py`'s wording pass applies on the dashboard side, for the same
 * reason: a proofreader quietly rewriting a claim is the failure that matters here, and it
 * looks exactly like a good reply until somebody checks the date.
 */
export async function rephraseFact(id: number, want = 2): Promise<RephraseResult> {
  const [row] = await db.select().from(songFactsTable).where(eq(songFactsTable.id, id)).limit(1);
  if (!row) return { ok: false, added: 0, wordings: [], message: "No such fact." };
  if (!row.body) {
    return { ok: false, added: 0, wordings: [], message: "That row records that no fact was found, so there is nothing to rephrase." };
  }
  if (!isGroqConfigured()) {
    return { ok: false, added: 0, wordings: wordings(row), message: "The Groq key is not set on this service." };
  }
  const have = wordings(row);
  const room = MAX_WORDINGS - have.length;
  if (room <= 0) {
    return { ok: false, added: 0, wordings: have, message: `This fact already has ${have.length} wordings, which is the most it may have.` };
  }

  const kept: string[] = [];
  const refused: string[] = [];
  for (let attempt = 0; attempt < Math.min(want, room) + 2 && kept.length < Math.min(want, room); attempt++) {
    let reply = "";
    try {
      reply = (await generateWithGroq(REPHRASE_PROMPT + row.body)) ?? "";
    } catch (err) {
      logger.warn({ err: String(err), id }, "song fact: rephrase call failed");
      break;
    }
    // demarkdown BEFORE unwrap: a reply of `*"..."*` must lose the asterisks before the
    // quotation marks can be recognised as wrapping the whole line.
    const text = unwrap(demarkdown(reply));
    if (!text || text.length < 15 || text.length > 400) { refused.push("length"); continue; }
    if (numbersIn(text) !== numbersIn(row.body)) { refused.push("a number changed"); continue; }
    if (quotesIn(text) !== quotesIn(row.body)) { refused.push("the quote changed"); continue; }
    const key = text.toLowerCase();
    if ([...have, ...kept].some((w) => w.toLowerCase() === key)) { refused.push("same as one it already had"); continue; }
    kept.push(text);
  }

  if (!kept.length) {
    const why = refused.length ? ` (${[...new Set(refused)].join(", ")})` : "";
    return { ok: false, added: 0, wordings: have, message: `Nothing usable came back${why}.` };
  }

  const variants = [...(row.variants ?? []), ...kept].slice(0, MAX_WORDINGS - 1);
  await db.update(songFactsTable)
    .set({ variants, updatedAt: new Date() })
    .where(eq(songFactsTable.id, id));
  return {
    ok: true,
    added: kept.length,
    wordings: [row.body, ...variants],
    message: `${kept.length} more wording(s) added; this fact now has ${1 + variants.length}.`,
  };
}
