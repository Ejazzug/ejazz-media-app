import type { InsertShow, Show, ShowSlot } from "@workspace/db";

/**
 * Programme schedule rules: validation for what the Control Room saves, and expansion
 * into the flat per-day rows the mobile app reads.
 *
 * One `shows` row is one PROGRAMME ENTRY: a show on one station, with a repeat pattern
 * (weekly days / days of the month / exact dates) and one or more airing windows in the
 * day. The app knows nothing about any of that -- it asks for a list of
 * {dayOfWeek, startMinute, endMinute} and filters it to today -- so `expandShow()` does
 * the flattening server-side and the stored entry stays editable as one thing.
 */

/** The station's own timezone. Fixed +03:00, no DST, so a date here never shifts. */
export const EAT_TZ = "Africa/Kampala";

export type ShowStation = "radio" | "xtra";
export type RepeatMode = "weekly" | "monthly" | "dates";

export const REPEAT_MODES: RepeatMode[] = ["weekly", "monthly", "dates"];

/** Guard rails, so one entry cannot become thousands of expanded rows. */
export const MAX_SLOTS = 8;
export const MAX_DATES = 60;
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const DAY_MINUTES = 24 * 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the station's timezone, as the date string and weekday the app would use. */
export function todayInEat(now: Date = new Date()): { date: string; dayOfWeek: number } {
  // en-CA gives YYYY-MM-DD; the weekday comes from the same formatted date, so the two
  // can never disagree (reading now.getDay() instead would use the SERVER's timezone).
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: EAT_TZ }).format(now);
  const [y, m, d] = date.split("-").map(Number);
  // UTC here is deliberate: this is a calendar date, not an instant, and Date.UTC keeps
  // the weekday of that date rather than re-applying the server's offset.
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date, dayOfWeek };
}

/** The weekday of a "YYYY-MM-DD" date, or null if it is not a real date. */
export function weekdayOfDate(date: string): number | null {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  // Rejects 2026-02-31 and friends: Date rolls them over, so the parts come back changed.
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return null;
  }
  return parsed.getUTCDay();
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function intList(value: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const raw of value) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

function slotList(value: unknown): ShowSlot[] | null {
  if (!Array.isArray(value)) return null;
  const out: ShowSlot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const start = Number(item.startMinute);
    const end = Number(item.endMinute);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 0 || start >= DAY_MINUTES) return null;
    if (end <= start || end > DAY_MINUTES) return null;
    out.push({ startMinute: start, endMinute: end });
  }
  return out.sort((a, b) => a.startMinute - b.startMinute);
}

/** Two windows in the same day must not overlap -- a show cannot air against itself. */
function firstOverlap(slots: ShowSlot[]): ShowSlot | null {
  for (let i = 1; i < slots.length; i += 1) {
    if (slots[i].startMinute < slots[i - 1].endMinute) return slots[i];
  }
  return null;
}

export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type NormalizeResult =
  | { ok: true; value: InsertShow }
  | { ok: false; error: string };

/**
 * Validate and normalise what the Control Room posts into a storable entry.
 *
 * Deliberately strict and explicit rather than coercing: a schedule that silently
 * becomes something other than what the operator ticked is worse than a refusal,
 * because nobody checks the app until a listener notices the wrong show.
 */
export function normalizeShowInput(input: unknown): NormalizeResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const src = input as Record<string, unknown>;

  const name = str(src.name).slice(0, MAX_NAME);
  if (!name) return { ok: false, error: "The show needs a name." };

  const station = str(src.station);
  if (station !== "radio" && station !== "xtra") {
    return { ok: false, error: "Pick a station: EJazz Radio or EJazz Xtra." };
  }

  const repeatMode = str(src.repeatMode) || "weekly";
  if (!REPEAT_MODES.includes(repeatMode as RepeatMode)) {
    return { ok: false, error: `Unknown repeat type "${repeatMode}".` };
  }

  const slots = slotList(src.slots);
  if (!slots) {
    return { ok: false, error: "Every time must be a start before an end, inside one day." };
  }
  if (!slots.length) return { ok: false, error: "Add at least one start and end time." };
  if (slots.length > MAX_SLOTS) {
    return { ok: false, error: `At most ${MAX_SLOTS} times a day.` };
  }
  const clash = firstOverlap(slots);
  if (clash) {
    return {
      ok: false,
      error: `The time starting ${minuteToTime(clash.startMinute)} overlaps the one before it.`,
    };
  }

  let daysOfWeek: number[] = [];
  let datesOfMonth: number[] = [];
  let dates: string[] = [];

  if (repeatMode === "weekly") {
    const parsed = intList(src.daysOfWeek, 0, 6);
    if (!parsed) return { ok: false, error: "Days of the week must be numbers 0 (Sunday) to 6." };
    if (!parsed.length) return { ok: false, error: "Pick at least one day of the week." };
    daysOfWeek = parsed;
  } else if (repeatMode === "monthly") {
    const parsed = intList(src.datesOfMonth, 1, 31);
    if (!parsed) return { ok: false, error: "Dates of the month must be numbers 1 to 31." };
    if (!parsed.length) return { ok: false, error: "Pick at least one date of the month." };
    datesOfMonth = parsed;
  } else {
    if (!Array.isArray(src.dates)) return { ok: false, error: "Pick at least one date." };
    const seen: string[] = [];
    for (const raw of src.dates) {
      const date = str(raw);
      if (weekdayOfDate(date) === null) {
        return { ok: false, error: `"${date || raw}" is not a real date (use YYYY-MM-DD).` };
      }
      if (!seen.includes(date)) seen.push(date);
    }
    if (!seen.length) return { ok: false, error: "Pick at least one date." };
    if (seen.length > MAX_DATES) return { ok: false, error: `At most ${MAX_DATES} dates.` };
    dates = seen.sort();
  }

  const imageUrlRaw = str(src.imageUrl).slice(0, 2000);
  if (imageUrlRaw && !/^https:\/\/[^\s]+$/i.test(imageUrlRaw)) {
    return { ok: false, error: "Artwork must be an https:// link, or left empty." };
  }

  // dayOfWeek / startMinute / endMinute are the entry's first occurrence, kept only so
  // old app builds reading GET /api/shows still see the shape they validate. For a
  // date-based entry the weekday of its first date is the honest answer; the public
  // route overrides it with today's weekday on the day it actually airs.
  const firstDay =
    repeatMode === "weekly"
      ? daysOfWeek[0]
      : repeatMode === "dates"
        ? (weekdayOfDate(dates[0]) ?? 0)
        : 0;

  return {
    ok: true,
    value: {
      name,
      hostName: str(src.hostName) || null,
      station: station as ShowStation,
      dayOfWeek: firstDay,
      startMinute: slots[0].startMinute,
      endMinute: slots[0].endMinute,
      description: str(src.description).slice(0, MAX_DESCRIPTION) || null,
      repeatMode,
      daysOfWeek,
      datesOfMonth,
      dates,
      slots,
      imageUrl: imageUrlRaw || null,
    },
  };
}

/** The stored entry's airing windows, falling back to the legacy single window. */
export function slotsOf(show: Show): ShowSlot[] {
  const stored = Array.isArray(show.slots) ? show.slots : [];
  const usable = stored.filter(
    (s) => s && Number.isInteger(s.startMinute) && Number.isInteger(s.endMinute),
  );
  return usable.length ? usable : [{ startMinute: show.startMinute, endMinute: show.endMinute }];
}

/** The weekdays a weekly entry airs on, falling back to the legacy single day. */
export function daysOf(show: Show): number[] {
  const stored = Array.isArray(show.daysOfWeek) ? show.daysOfWeek : [];
  const usable = stored.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return usable.length ? usable : [show.dayOfWeek];
}

/** Does this entry air on the given EAT date? */
export function airsOn(show: Show, date: string, dayOfWeek: number): boolean {
  const mode = show.repeatMode || "weekly";
  if (mode === "weekly") return daysOf(show).includes(dayOfWeek);
  if (mode === "monthly") {
    const day = Number(date.slice(8, 10));
    const stored = Array.isArray(show.datesOfMonth) ? show.datesOfMonth : [];
    return stored.includes(day);
  }
  const stored = Array.isArray(show.dates) ? show.dates : [];
  return stored.includes(date);
}

/** One row of the shape the mobile app expects. */
export type PublicShowRow = {
  id: number;
  name: string;
  hostName: string | null;
  station: ShowStation;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  description: string | null;
  imageUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Flatten one entry into the per-occurrence rows the app reads.
 *
 * A weekly entry expands across all of its weekdays, so the app can look ahead within
 * the week as it always has. A monthly or exact-date entry only appears when the date IS
 * today -- carrying a weekday for it otherwise would make it air every week on that
 * weekday, which is the opposite of what "only on the 1st" means.
 */
export function expandShow(
  show: Show,
  today: { date: string; dayOfWeek: number } = todayInEat(),
): PublicShowRow[] {
  const mode = show.repeatMode || "weekly";
  const slots = slotsOf(show);
  const days = mode === "weekly" ? daysOf(show) : airsOn(show, today.date, today.dayOfWeek) ? [today.dayOfWeek] : [];

  const rows: PublicShowRow[] = [];
  for (const day of days) {
    for (const slot of slots) {
      rows.push({
        id: show.id * 1000 + rows.length,   // distinct per occurrence; the app uses it as a key
        name: show.name,
        hostName: show.hostName,
        station: show.station as ShowStation,
        dayOfWeek: day,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        description: show.description,
        imageUrl: show.imageUrl ?? null,
        createdAt: show.createdAt,
        updatedAt: show.updatedAt,
      });
    }
  }
  return rows;
}

/** Every entry, flattened and ordered the way the old endpoint ordered rows. */
export function expandShows(shows: Show[], today = todayInEat()): PublicShowRow[] {
  return shows
    .flatMap((show) => expandShow(show, today))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human summary of an entry's repeat pattern, for the Control Room list. */
export function describeRepeat(show: Show): string {
  const mode = show.repeatMode || "weekly";
  if (mode === "weekly") {
    const days = daysOf(show);
    if (days.length === 7) return "Every day";
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
    if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
    if (days.length === 1) return `Every ${DAY_NAMES[days[0]]}`;
    return days.map((d) => DAY_SHORT[d]).join(", ");
  }
  if (mode === "monthly") {
    const dom = Array.isArray(show.datesOfMonth) ? show.datesOfMonth : [];
    return dom.length ? `Monthly on the ${dom.join(", ")}` : "Monthly";
  }
  const dates = Array.isArray(show.dates) ? show.dates : [];
  if (!dates.length) return "No dates";
  if (dates.length <= 3) return dates.join(", ");
  return `${dates.slice(0, 2).join(", ")} +${dates.length - 2} more`;
}

export { DAY_NAMES, DAY_SHORT };
