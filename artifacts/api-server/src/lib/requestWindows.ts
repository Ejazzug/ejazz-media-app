import { EAT_TZ, DAY_NAMES, DAY_SHORT, minuteToTime, todayInEat, weekdayOfDate } from "./showSchedule";

/**
 * Song request windows: when a station takes requests, and whether it is taking them
 * right now.
 *
 * One window is one repeat pattern (every day / chosen weekdays / dates of the month /
 * exact dates) plus one or more open periods inside those days. A station can have
 * several windows, so "weekdays 10:00-13:00 and 16:00-19:00, plus all day Saturday" is
 * two windows, not a special case.
 *
 * The repeat vocabulary deliberately mirrors the programme line-up (lib/showSchedule.ts)
 * and reuses its date/weekday helpers, so an operator who has set up a show already
 * knows how this works, and there is one definition of "today in EAT" on this side.
 *
 * Nothing here talks to a station. It answers "are requests open?" and "when next?";
 * the app and the website embed read that answer and open or close their own form.
 */

export type RequestRepeatMode = "daily" | "weekly" | "monthly" | "dates";
export type RequestMode = "always" | "scheduled";

export const REQUEST_REPEAT_MODES: RequestRepeatMode[] = ["daily", "weekly", "monthly", "dates"];

/** Guard rails, so one station cannot become an unbounded schedule to walk. */
export const MAX_WINDOWS = 12;
export const MAX_SLOTS = 8;
export const MAX_DATES = 60;
const MAX_LABEL = 60;
const DAY_MINUTES = 24 * 60;
/** How far ahead "when does it next open?" looks before giving up. */
const LOOKAHEAD_DAYS = 60;

export type RequestSlot = { startMinute: number; endMinute: number };

export type RequestWindow = {
  id: string;
  label: string;
  repeatMode: RequestRepeatMode;
  daysOfWeek: number[];
  datesOfMonth: number[];
  dates: string[];
  slots: RequestSlot[];
  enabled: boolean;
};

export type StationRequestSchedule = {
  /** "always" = any time the station switch is on. "scheduled" = only inside a window. */
  mode: RequestMode;
  windows: RequestWindow[];
};

export const DEFAULT_STATION_SCHEDULE: StationRequestSchedule = { mode: "always", windows: [] };

/** What a client (app screen, website embed) is told. Carries no operator-only detail. */
export type RequestStatus = {
  open: boolean;
  mode: RequestMode;
  /** ISO instant the open period in progress ends, or null (closed, or open always). */
  closesAt: string | null;
  /** ISO instant requests next open, or null (open now, open always, or nothing ahead). */
  opensAt: string | null;
  /** Ready to show: "Open until 21:00", "Opens today at 18:00", "Opens Monday at 10:00". */
  nextChangeLabel: string;
  /** One readable line per window: "Weekdays, 10:00-13:00 and 16:00-19:00". */
  schedule: string[];
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function intList(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const raw of value) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

function slotList(value: unknown): RequestSlot[] {
  if (!Array.isArray(value)) return [];
  const out: RequestSlot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const start = Number(item.startMinute);
    const end = Number(item.endMinute);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < 0 || start >= DAY_MINUTES) continue;
    if (end <= start || end > DAY_MINUTES) continue;
    out.push({ startMinute: start, endMinute: end });
  }
  // Overlapping periods are merged rather than refused: two windows that both say "open"
  // is not a contradiction the way two shows on air at once would be, and merging keeps
  // the "closes at" answer honest instead of ending at the first period's edge.
  out.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const merged: RequestSlot[] = [];
  for (const slot of out.slice(0, MAX_SLOTS * 4)) {
    const last = merged[merged.length - 1];
    if (last && slot.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, slot.endMinute);
    } else {
      merged.push({ ...slot });
    }
  }
  return merged.slice(0, MAX_SLOTS);
}

let idCounter = 0;

function windowId(value: unknown): string {
  const given = str(value).slice(0, 40).replace(/[^A-Za-z0-9_-]/g, "");
  if (given) return given;
  idCounter += 1;
  return `w${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Coerce one stored/posted window into a usable one, or null to drop it.
 *
 * Coercing rather than refusing, because this runs inside normalizeAppConfig(), which
 * rebuilds the whole config on every save: a single malformed window must not take the
 * rest of the app's settings down with it. The Control Room validates before it posts,
 * so an operator still gets told what is wrong instead of silently losing a window --
 * the one case that is dropped here is a window with no usable time at all, which has
 * no meaning to keep.
 */
export function normalizeWindow(value: unknown): RequestWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;

  const slots = slotList(src.slots);
  if (!slots.length) return null;

  const modeRaw = str(src.repeatMode) || "daily";
  const repeatMode = (REQUEST_REPEAT_MODES as string[]).includes(modeRaw)
    ? (modeRaw as RequestRepeatMode)
    : "daily";

  const daysOfWeek = intList(src.daysOfWeek, 0, 6);
  const datesOfMonth = intList(src.datesOfMonth, 1, 31);
  const dates: string[] = [];
  if (Array.isArray(src.dates)) {
    for (const raw of src.dates) {
      const date = str(raw);
      if (weekdayOfDate(date) !== null && !dates.includes(date)) dates.push(date);
    }
    dates.sort();
  }

  // A pattern with nothing ticked would never open, which reads on the page as "requests
  // are broken" rather than "nothing is set". Falling back to every day keeps a
  // half-finished window honest about what it does.
  const effectiveMode: RequestRepeatMode =
    (repeatMode === "weekly" && !daysOfWeek.length) ||
    (repeatMode === "monthly" && !datesOfMonth.length) ||
    (repeatMode === "dates" && !dates.length)
      ? "daily"
      : repeatMode;

  return {
    id: windowId(src.id),
    label: str(src.label).slice(0, MAX_LABEL),
    repeatMode: effectiveMode,
    daysOfWeek,
    datesOfMonth,
    dates: dates.slice(0, MAX_DATES),
    slots,
    enabled: src.enabled !== false,
  };
}

export function normalizeStationSchedule(value: unknown): StationRequestSchedule {
  const src = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const mode: RequestMode = str(src.mode) === "scheduled" ? "scheduled" : "always";
  const raw = Array.isArray(src.windows) ? src.windows : [];
  const windows: RequestWindow[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_WINDOWS * 2)) {
    const win = normalizeWindow(item);
    if (!win) continue;
    if (seen.has(win.id)) win.id = windowId(null);
    seen.add(win.id);
    windows.push(win);
    if (windows.length >= MAX_WINDOWS) break;
  }
  return { mode, windows };
}

/** Does this window cover the given EAT calendar date? */
export function coversDate(win: RequestWindow, date: string, dayOfWeek: number): boolean {
  if (!win.enabled) return false;
  switch (win.repeatMode) {
    case "daily":
      return true;
    case "weekly":
      return win.daysOfWeek.includes(dayOfWeek);
    case "monthly":
      return win.datesOfMonth.includes(Number(date.slice(8, 10)));
    case "dates":
      return win.dates.includes(date);
  }
}

/** The open periods on one EAT date, merged across every window, earliest first. */
export function slotsOnDate(
  schedule: StationRequestSchedule,
  date: string,
  dayOfWeek: number,
): RequestSlot[] {
  const all: RequestSlot[] = [];
  for (const win of schedule.windows) {
    if (coversDate(win, date, dayOfWeek)) all.push(...win.slots.map((s) => ({ ...s })));
  }
  all.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const merged: RequestSlot[] = [];
  for (const slot of all) {
    const last = merged[merged.length - 1];
    // Touching periods join up (13:00-16:00 after 10:00-13:00 is one stretch), so
    // "closes at" names the real end rather than an invisible seam.
    if (last && slot.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, slot.endMinute);
    } else {
      merged.push(slot);
    }
  }
  return merged;
}

/** "YYYY-MM-DD" plus a minute-of-day in EAT, as an exact instant. */
export function eatInstant(date: string, minute: number): Date {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  // EAT is a fixed +03:00 with no DST ever (see EAT_TZ in showSchedule.ts), so the
  // offset can be written into the string: no timezone library, no DST edge case.
  return new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+03:00`);
}

/** Now, as the EAT calendar date, weekday, and minute of that day. */
export function nowInEat(now: Date = new Date()): { date: string; dayOfWeek: number; minute: number } {
  const today = todayInEat(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EAT_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { ...today, minute: hour * 60 + min };
}

/** The EAT date `days` after `date`. */
function addDays(date: string, days: number): { date: string; dayOfWeek: number } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + days);
  return { date: next.toISOString().slice(0, 10), dayOfWeek: next.getUTCDay() };
}

function dayWord(fromDate: string, targetDate: string, targetDayOfWeek: number): string {
  if (targetDate === fromDate) return "today";
  if (addDays(fromDate, 1).date === targetDate) return "tomorrow";
  return DAY_NAMES[targetDayOfWeek];
}

/**
 * Open or closed right now, and the next change.
 *
 * `enabled` is the station's own switch (and the app-wide song request switch): off means
 * closed whatever the schedule says, and the schedule is still reported so a client can
 * show when it would normally be open.
 */
export function requestStatus(
  schedule: StationRequestSchedule,
  enabled: boolean,
  now: Date = new Date(),
): RequestStatus {
  const lines = describeSchedule(schedule);
  const base = { mode: schedule.mode, schedule: lines };

  if (!enabled) {
    return { ...base, open: false, closesAt: null, opensAt: null, nextChangeLabel: "" };
  }
  if (schedule.mode === "always") {
    return { ...base, open: true, closesAt: null, opensAt: null, nextChangeLabel: "" };
  }

  const current = nowInEat(now);
  const todaySlots = slotsOnDate(schedule, current.date, current.dayOfWeek);
  const live = todaySlots.find((s) => s.startMinute <= current.minute && current.minute < s.endMinute);
  if (live) {
    return {
      ...base,
      open: true,
      closesAt: eatInstant(current.date, live.endMinute).toISOString(),
      opensAt: null,
      nextChangeLabel: `Open until ${minuteToTime(live.endMinute)}`,
    };
  }

  // Closed: walk forward for the next start. Today is checked from the current minute, so
  // an evening window still counts as "opens today"; after that, whole days.
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const day = offset === 0 ? { date: current.date, dayOfWeek: current.dayOfWeek } : addDays(current.date, offset);
    const slots = offset === 0 ? todaySlots : slotsOnDate(schedule, day.date, day.dayOfWeek);
    const next = slots.find((s) => offset > 0 || s.startMinute > current.minute);
    if (!next) continue;
    return {
      ...base,
      open: false,
      closesAt: null,
      opensAt: eatInstant(day.date, next.startMinute).toISOString(),
      nextChangeLabel: `Opens ${dayWord(current.date, day.date, day.dayOfWeek)} at ${minuteToTime(next.startMinute)}`,
    };
  }

  // Nothing in the next two months: a schedule of past one-off dates, or no window at all.
  return { ...base, open: false, closesAt: null, opensAt: null, nextChangeLabel: "" };
}

function describeSlots(slots: RequestSlot[]): string {
  const parts = slots.map((s) =>
    s.startMinute === 0 && s.endMinute === DAY_MINUTES
      ? "all day"
      : `${minuteToTime(s.startMinute)}-${minuteToTime(s.endMinute)}`,
  );
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Human summary of one window's repeat pattern: "Weekdays", "Monthly on the 1, 15". */
export function describeRepeat(win: RequestWindow): string {
  switch (win.repeatMode) {
    case "daily":
      return "Every day";
    case "weekly": {
      const days = win.daysOfWeek;
      if (days.length === 7) return "Every day";
      if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
      if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
      if (days.length === 1) return `Every ${DAY_NAMES[days[0]]}`;
      return days.map((d) => DAY_SHORT[d]).join(", ");
    }
    case "monthly":
      return win.datesOfMonth.length ? `Monthly on the ${win.datesOfMonth.join(", ")}` : "Monthly";
    case "dates": {
      if (!win.dates.length) return "No dates";
      if (win.dates.length <= 3) return win.dates.join(", ");
      return `${win.dates.slice(0, 2).join(", ")} +${win.dates.length - 2} more`;
    }
  }
}

/** One line per window: what the embed shows under a closed form. */
export function describeWindow(win: RequestWindow): string {
  const times = describeSlots(win.slots);
  const when = describeRepeat(win);
  // A middot, not a comma: "Monthly on the 1, 15, 10:00-11:00" cannot be read, because
  // the dates are already a comma list.
  const body = times ? `${when} · ${times}` : when;
  return win.label ? `${win.label}: ${body}` : body;
}

export function describeSchedule(schedule: StationRequestSchedule): string[] {
  if (schedule.mode === "always") return [];
  return schedule.windows.filter((w) => w.enabled).map(describeWindow);
}
