/**
 * Pure rules for countdown charts: how a chart is stored compactly, how far back listeners
 * may look, and which saved day answers a given date. No database, no network, so it is
 * tested directly (countdownChartsCore.test.ts).
 */

/** Which way a song moved since the previous chart, in the dashboard's own four words. */
export type Move = "up" | "down" | "same" | "new";

export type ChartEntry = {
  position: number;
  title: string;
  artist: string;
  /** How it moved since the previous chart. Absent when this chart carries no movement at all. */
  move?: Move;
  /** Its position on the previous chart, 1-based. Absent when it had none (a new entry). */
  lastWeek?: number;
  /** Absolute https URL of the cover the CARD renderer cached. Absent when that song has none. */
  artUrl?: string;
};

/**
 * The stored shape, best-first, so a song's position is still its index + 1:
 *
 *   [title, artist]                          rows written before covers and arrows existed
 *   [title, artist, move, lastWeek, artUrl]  what is written now
 *
 * Both are read, because the database already holds thousands of the short form and a saved day
 * is never rewritten by a migration -- the next sync that finds a real difference rewrites it, and
 * covers appearing where there were none IS a real difference. In the long form "" and 0 mean
 * "nothing here", never a falsy value with meaning: position 0 is not a position and an empty
 * string is not a URL.
 */
export type CompactEntry = [string, string] | [string, string, string, number, string];
export type CompactEntries = CompactEntry[];

export type PastMode = "off" | "week" | "month" | "custom";
export type ChartsConfig = {
  /** How far back the app may look: nothing, 7 days, 30 days, or back to `customFrom`. */
  pastMode: PastMode;
  /** YYYY-MM-DD, used only when pastMode is "custom". */
  customFrom: string;
  /** Saved days older than this are deleted automatically. */
  keepDays: number;
};

export const DEFAULT_CHARTS_CONFIG: ChartsConfig = { pastMode: "off", customFrom: "", keepDays: 365 };
export const MAX_CHART_ENTRIES = 100;
export const MAX_PAST_DATES_SENT = 60;
const TEXT_MAX = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOVES = ["up", "down", "same", "new"] as const;
/**
 * A cover URL becomes an <Image> source on a phone, so it is held to the same rule as a card's:
 * https and nothing else. "The dashboard said so" is not a reason to hand a device a javascript:
 * or data: URL, and the dashboard is read over loopback by a service that cannot see who wrote it.
 */
const ART_URL_RE = /^https:\/\/[^\s"'<>]+$/i;
const ART_URL_MAX = 300;

/** One of the four movement words, or "" for "this chart says nothing about movement". */
function moveWord(value: unknown): Move | "" {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (MOVES as readonly string[]).includes(v) ? (v as Move) : "";
}

/**
 * Last week's position as a whole number, or 0 for none. Bounded by MAX_CHART_ENTRIES because a
 * number outside it is not a position any chart here could have had, so it is not one to show.
 */
function lastWeekPosition(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= MAX_CHART_ENTRIES ? Math.round(n) : 0;
}

function coverUrl(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length <= ART_URL_MAX && ART_URL_RE.test(v) ? v : "";
}

/** A stored row read positionally, whatever length it was written at. */
function rowFields(row: CompactEntry): [string, string, Move | "", number, string] {
  // Indexed through unknown[] on purpose: the two stored lengths are one union, and a row that
  // came back from jsonb is only a row by convention -- it is validated here, not trusted.
  const r = row as unknown[];
  return [
    typeof r[0] === "string" ? r[0] : "",
    typeof r[1] === "string" ? r[1] : "",
    moveWord(r[2]),
    lastWeekPosition(r[3]),
    coverUrl(r[4]),
  ];
}

export function isDateString(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const t = Date.parse(v + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** Calendar-date arithmetic on YYYY-MM-DD strings. UTC on purpose: these are dates, not instants. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole-number settings validated the same way the rest of appConfig is: never trust stored/posted JSON. */
export function normalizeChartsConfig(input: unknown): ChartsConfig {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_CHARTS_CONFIG;
  const mode = src.pastMode === "week" || src.pastMode === "month" || src.pastMode === "custom" ? src.pastMode : "off";
  const customFrom = isDateString(src.customFrom) ? src.customFrom : "";
  const keep = Number(src.keepDays);
  const keepDays = Number.isFinite(keep) ? Math.min(Math.max(Math.round(keep), 7), 3650) : d.keepDays;
  // A custom window with no valid date cannot work: fall back to nothing rather than "everything".
  return { pastMode: mode === "custom" && !customFrom ? "off" : mode, customFrom, keepDays };
}

/**
 * The dashboard's own rows, trusted only as far as their shape. snake_case there, camelCase here.
 *
 * A row with no usable position or no title is DROPPED rather than defaulted: an invented position
 * would reorder the chart, and the dashboard sends the playlist's real order. The three extras are
 * each independently optional -- a chart with covers but no movement is normal (the first day a
 * countdown exists), and so is the reverse (a song whose cover was never cached).
 */
export function readEntries(raw: unknown): ChartEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const e = row as Record<string, unknown>;
    const position = Number(e.position);
    const title = typeof e.title === "string" ? e.title : "";
    if (!Number.isFinite(position) || !title.trim()) continue;
    const move = moveWord(e.move);
    const lastWeek = lastWeekPosition(e.last_week);
    const artUrl = coverUrl(e.art_url);
    out.push({
      position,
      title,
      artist: typeof e.artist === "string" ? e.artist : "",
      ...(move ? { move } : {}),
      ...(lastWeek ? { lastWeek } : {}),
      ...(artUrl ? { artUrl } : {}),
    });
  }
  return out;
}

/** Storage form: best position first, text trimmed and capped, nothing else kept. */
export function compactEntries(entries: ChartEntry[]): CompactEntries {
  return [...entries]
    .filter((e) => e && Number.isFinite(Number(e.position)) && String(e.title ?? "").trim())
    .sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, MAX_CHART_ENTRIES)
    .map((e) => [
      String(e.title).trim().slice(0, TEXT_MAX),
      String(e.artist ?? "").trim().slice(0, TEXT_MAX),
      moveWord(e.move),
      lastWeekPosition(e.lastWeek),
      coverUrl(e.artUrl),
    ] as CompactEntry);
}

export function expandEntries(compact: CompactEntries): ChartEntry[] {
  return compact.map((row, i) => {
    const [title, artist, move, lastWeek, artUrl] = rowFields(row);
    return {
      position: i + 1,
      title,
      artist,
      // Sent only when there is something to send, so the app can tell "no movement recorded"
      // from "did not move" -- they draw differently (nothing, versus a dash).
      ...(move ? { move } : {}),
      ...(lastWeek ? { lastWeek } : {}),
      ...(artUrl ? { artUrl } : {}),
    };
  });
}

/**
 * Whether two stored charts say the same thing -- all five fields, not just the songs.
 *
 * The extras have to count. A snapshot is written only when the chart differs from the newest
 * saved one, so if movement and covers were ignored here, the day a cover is finally cached or
 * the arrows change would look identical to yesterday and the app would keep showing yesterday's
 * arrows for as long as the running order held. It also makes the short legacy rows compare equal
 * to a long row that carries nothing, so an old day is not rewritten for the sake of its shape.
 */
export function sameEntries(a: CompactEntries, b: CompactEntries): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = rowFields(a[i]);
    const y = rowFields(b[i]);
    for (let f = 0; f < x.length; f++) if (x[f] !== y[f]) return false;
  }
  return true;
}

/**
 * The earliest date listeners may view, or null when past charts are off. Never later than
 * today (a custom date in the future would otherwise hide everything) and, for "custom",
 * never earlier than the retention limit, because older days no longer exist.
 */
export function earliestAllowed(cfg: ChartsConfig, today: string): string | null {
  let earliest: string | null;
  if (cfg.pastMode === "week") earliest = addDays(today, -7);
  else if (cfg.pastMode === "month") earliest = addDays(today, -30);
  else if (cfg.pastMode === "custom" && cfg.customFrom) earliest = cfg.customFrom;
  else return null;
  const floor = addDays(today, -cfg.keepDays);
  if (earliest < floor) earliest = floor;
  return earliest > today ? today : earliest;
}

/**
 * Dates offered as "past charts": yesterday back to the earliest allowed date, newest first,
 * clipped to the first day anything was saved (a date before that has no chart to show) and
 * to a sane count so the response stays small.
 */
export function pastDates(cfg: ChartsConfig, today: string, firstSavedDay: string | null): string[] {
  const earliest = earliestAllowed(cfg, today);
  if (!earliest || !firstSavedDay) return [];
  const start = earliest > firstSavedDay ? earliest : firstSavedDay;
  const out: string[] = [];
  for (let d = addDays(today, -1); d >= start && out.length < MAX_PAST_DATES_SENT; d = addDays(d, -1)) out.push(d);
  return out;
}

/** A date is viewable only inside the allowed window and not after today. */
export function isViewable(cfg: ChartsConfig, today: string, date: string, firstSavedDay: string | null): boolean {
  const earliest = earliestAllowed(cfg, today);
  if (!earliest || !firstSavedDay) return false;
  return date >= earliest && date >= firstSavedDay && date <= today;
}

/**
 * The saved chart for a date: the newest row on or before it (a day with no row means the
 * chart had not changed). `rows` may be in any order. Null when nothing was saved yet.
 */
export function resolveSnapshot<T extends { day: string }>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.day <= date && (!best || r.day > best.day)) best = r;
  return best;
}

/**
 * Which saved rows retention may delete: everything older than the cutoff EXCEPT the newest
 * of those, which must stay because it still answers the days after it (no row = unchanged).
 */
export function rowsToPrune<T extends { day: string }>(rows: T[], cutoff: string): T[] {
  const older = rows.filter((r) => r.day < cutoff).sort((a, b) => (a.day < b.day ? 1 : -1));
  return older.slice(1);
}

/**
 * The shareable card the dashboard draws for a countdown: the picture of this chart and the
 * caption written to go with it. Null when that countdown has no card -- no design chosen on the
 * dashboard's Card Designs tab, or switched off on its Sharing tab.
 */
export type CountdownCard = {
  /** Absolute, and already carrying the image's own version, so it is safe to cache by URL. */
  url: string;
  caption: string;
};

/**
 * The dashboard's `card` object, trusted only as far as its shape.
 *
 * An https URL and nothing else: this becomes an <img> source in the app and on a website, and
 * "the dashboard said so" is not a reason to hand a phone a javascript: or data: URL. A card with
 * no caption is still a card -- the picture is the point and the words are optional.
 */
export type CountdownDesign = {
  bgMode: "solid" | "gradient";
  bgColor: string;
  bgColor2: string;
  gradientDirection: "vertical" | "horizontal" | "diagonal";
  accentColor: string;
  textColor: string;
  headerText: string;
  footerText: string;
  /** Show each song's cover beside it, as the picture does. */
  showArtwork: boolean;
  /** Show the up/down/same arrow. */
  showArrows: boolean;
  /** Show last week's position. */
  showLastWeek: boolean;
  /** Mark an entry that was not on the previous chart. */
  showNewBadge: boolean;
};

const DESIGN_FALLBACK: CountdownDesign = {
  bgMode: "solid",
  bgColor: "#0B0B12",
  bgColor2: "#2B1055",
  gradientDirection: "vertical",
  accentColor: "#FF0056",
  textColor: "#FFFFFF",
  headerText: "",
  footerText: "",
  // The dashboard's own defaults (chart_templates.DEFAULTS), so a design saved before these
  // switches existed draws in the app the way the picture of it draws.
  showArtwork: true,
  showArrows: true,
  showLastWeek: false,
  showNewBadge: true,
};

const HEX = /^#[0-9a-f]{6}$/i;

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toUpperCase() : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A switch is a boolean or it is not a switch: anything else falls back to the design default. */
function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function words(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * The dashboard's `design` object, trusted only as far as its shape -- COLOURS AND WORDING ONLY.
 *
 * Every colour becomes a style value in the app, so each one is checked against a strict 6-digit
 * hex pattern and anything else falls back to the default: "the dashboard said so" is not a reason
 * to push an arbitrary string into a phone's stylesheet. Coerced rather than refused, the same way
 * the dashboard coerces its own template files -- one bad colour should draw in the default colour,
 * not blank the chart. Null only when no design is chosen at all.
 *
 * The four show_* switches ARE kept, because the app now draws what they turn on -- covers,
 * arrows, last week's number and the NEW badge -- and an operator who turned artwork off on the
 * Card Designs tab means it off in both places. The dashboard also sends list_style, font_style,
 * canvas and track_count; those stay dropped, because the app draws its own layout rather than
 * imitating the renderer's, and storing a switch nothing honours would be a lie.
 */
export function readDesign(raw: unknown): CountdownDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  return {
    bgMode: oneOf(d.bg_mode, ["solid", "gradient"] as const, DESIGN_FALLBACK.bgMode),
    bgColor: hex(d.bg_color, DESIGN_FALLBACK.bgColor),
    bgColor2: hex(d.bg_color2, DESIGN_FALLBACK.bgColor2),
    gradientDirection: oneOf(d.gradient_direction, ["vertical", "horizontal", "diagonal"] as const,
                             DESIGN_FALLBACK.gradientDirection),
    accentColor: hex(d.accent_color, DESIGN_FALLBACK.accentColor),
    textColor: hex(d.text_color, DESIGN_FALLBACK.textColor),
    // The dashboard's own limits (chart_templates.MAX_HEADER / MAX_FOOTER).
    headerText: words(d.header_text, 48),
    footerText: words(d.footer_text, 72),
    showArtwork: flag(d.show_artwork, DESIGN_FALLBACK.showArtwork),
    showArrows: flag(d.show_arrows, DESIGN_FALLBACK.showArrows),
    showLastWeek: flag(d.show_last_week, DESIGN_FALLBACK.showLastWeek),
    showNewBadge: flag(d.show_new_badge, DESIGN_FALLBACK.showNewBadge),
  };
}

export function sameDesign(a: CountdownDesign | null, b: CountdownDesign | null): boolean {
  if (a === null || b === null) return a === b;
  return (Object.keys(DESIGN_FALLBACK) as (keyof CountdownDesign)[]).every((k) => a[k] === b[k]);
}

export function readCard(raw: unknown): CountdownCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as { public_url?: unknown; caption?: unknown };
  const url = typeof c.public_url === "string" ? c.public_url.trim() : "";
  if (!/^https:\/\/[^\s]+$/i.test(url)) return null;
  return { url, caption: typeof c.caption === "string" ? c.caption : "" };
}
