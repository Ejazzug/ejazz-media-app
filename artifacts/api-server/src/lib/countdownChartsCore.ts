/**
 * Pure rules for countdown charts: how a chart is stored compactly, how far back listeners
 * may look, and which saved day answers a given date. No database, no network, so it is
 * tested directly (countdownChartsCore.test.ts).
 */

export type ChartEntry = { position: number; title: string; artist: string };
/** The stored shape: [title, artist] best-first. A song's position is its index + 1. */
export type CompactEntries = [string, string][];

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

/** Storage form: best position first, text trimmed and capped, nothing else kept. */
export function compactEntries(entries: ChartEntry[]): CompactEntries {
  return [...entries]
    .filter((e) => e && Number.isFinite(Number(e.position)) && String(e.title ?? "").trim())
    .sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, MAX_CHART_ENTRIES)
    .map((e) => [String(e.title).trim().slice(0, TEXT_MAX), String(e.artist ?? "").trim().slice(0, TEXT_MAX)] as [string, string]);
}

export function expandEntries(compact: CompactEntries): ChartEntry[] {
  return compact.map(([title, artist], i) => ({ position: i + 1, title, artist }));
}

export function sameEntries(a: CompactEntries, b: CompactEntries): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
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
