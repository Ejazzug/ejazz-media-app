/**
 * Tests for the song request window rules: what a saved window means, and whether
 * requests are open at a given moment.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/requestWindows.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/requestWindows.test.mjs && node /tmp/requestWindows.test.mjs
 *
 * Touches no database and no network. Every instant is written with an explicit +03:00
 * offset so the result cannot depend on the machine's own timezone.
 */
import {
  normalizeStationSchedule, normalizeWindow, requestStatus, slotsOnDate,
  describeWindow, describeSchedule, coversDate, nowInEat, eatInstant,
  type StationRequestSchedule,
} from "./requestWindows";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { pass += 1; } else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}
const at = (iso: string) => new Date(iso);
const sched = (input: unknown): StationRequestSchedule => normalizeStationSchedule(input);

// ---------- normalising ----------

check("a window with no times is dropped",
  normalizeWindow({ repeatMode: "daily", slots: [] }) === null);

check("an end before the start is dropped",
  normalizeWindow({ slots: [{ startMinute: 600, endMinute: 600 }] }) === null);

const w1 = normalizeWindow({ repeatMode: "weekly", daysOfWeek: [5, 1, 1], slots: [{ startMinute: 600, endMinute: 780 }] });
check("weekly days are de-duplicated and sorted", JSON.stringify(w1?.daysOfWeek) === "[1,5]", w1?.daysOfWeek);
check("a window gets an id of its own", Boolean(w1?.id));

const w2 = normalizeWindow({ repeatMode: "weekly", daysOfWeek: [], slots: [{ startMinute: 0, endMinute: 60 }] });
check("weekly with no days falls back to every day", w2?.repeatMode === "daily", w2?.repeatMode);

const w3 = normalizeWindow({
  repeatMode: "daily",
  slots: [{ startMinute: 600, endMinute: 780 }, { startMinute: 700, endMinute: 900 }],
});
check("overlapping periods in one window merge",
  JSON.stringify(w3?.slots) === JSON.stringify([{ startMinute: 600, endMinute: 900 }]), w3?.slots);

const w4 = normalizeWindow({ repeatMode: "dates", dates: ["2026-11-05", "nope", "2026-02-31", "2026-11-05"], slots: [{ startMinute: 60, endMinute: 120 }] });
check("only real dates survive", JSON.stringify(w4?.dates) === '["2026-11-05"]', w4?.dates);

const s1 = sched({ mode: "nonsense", windows: [{ slots: [{ startMinute: 0, endMinute: 10 }] }, "junk", { slots: [] }] });
check("an unknown mode falls back to always open", s1.mode === "always", s1.mode);
check("unusable windows are dropped, usable ones kept", s1.windows.length === 1, s1.windows.length);

const s2 = sched({ mode: "scheduled", windows: Array.from({ length: 20 }, () => ({ slots: [{ startMinute: 0, endMinute: 10 }] })) });
check("the window count is capped", s2.windows.length === 12, s2.windows.length);
check("capped windows still have distinct ids", new Set(s2.windows.map((w) => w.id)).size === 12);

// ---------- which days a window covers ----------

const weekly = normalizeWindow({ repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5], slots: [{ startMinute: 600, endMinute: 780 }] })!;
check("weekly covers a listed weekday", coversDate(weekly, "2026-10-19", 1) === true);
check("weekly skips an unlisted weekday", coversDate(weekly, "2026-10-18", 0) === false);

const monthly = normalizeWindow({ repeatMode: "monthly", datesOfMonth: [1, 15], slots: [{ startMinute: 600, endMinute: 780 }] })!;
check("monthly covers the 15th", coversDate(monthly, "2026-10-15", 4) === true);
check("monthly skips the 16th", coversDate(monthly, "2026-10-16", 5) === false);

const exact = normalizeWindow({ repeatMode: "dates", dates: ["2026-12-25"], slots: [{ startMinute: 0, endMinute: 1440 }] })!;
check("an exact date covers only itself", coversDate(exact, "2026-12-25", 5) === true);
check("an exact date skips the same weekday a week later", coversDate(exact, "2027-01-01", 5) === false);

const off = normalizeWindow({ repeatMode: "daily", enabled: false, slots: [{ startMinute: 0, endMinute: 1440 }] })!;
check("a switched-off window covers nothing", coversDate(off, "2026-10-19", 1) === false);

// ---------- several windows on one day ----------

const twoWindows = sched({ mode: "scheduled", windows: [
  { label: "Morning", repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5], slots: [{ startMinute: 600, endMinute: 780 }] },
  { label: "Drive", repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5], slots: [{ startMinute: 960, endMinute: 1140 }] },
] });
check("both windows show on a weekday",
  JSON.stringify(slotsOnDate(twoWindows, "2026-10-19", 1)) ===
  JSON.stringify([{ startMinute: 600, endMinute: 780 }, { startMinute: 960, endMinute: 1140 }]));
check("neither shows on Sunday", slotsOnDate(twoWindows, "2026-10-18", 0).length === 0);

const touching = sched({ mode: "scheduled", windows: [
  { repeatMode: "daily", slots: [{ startMinute: 600, endMinute: 780 }] },
  { repeatMode: "daily", slots: [{ startMinute: 780, endMinute: 900 }] },
] });
check("windows that touch become one stretch",
  JSON.stringify(slotsOnDate(touching, "2026-10-19", 1)) === JSON.stringify([{ startMinute: 600, endMinute: 900 }]));

// ---------- open or closed right now ----------

// 2026-10-19 is a Monday. 13:00 EAT = 10:00Z.
const monday1200 = at("2026-10-19T09:00:00Z");
const monday1300 = at("2026-10-19T10:00:00Z");
const monday0900 = at("2026-10-19T06:00:00Z");
const sunday1300 = at("2026-10-18T10:00:00Z");

const always = sched({ mode: "always", windows: [] });
check("always: open", requestStatus(always, true, monday1300).open === true);
check("always: the station switch still closes it", requestStatus(always, false, monday1300).open === false);
check("always: nothing to say about the next change", requestStatus(always, true, monday1300).nextChangeLabel === "");

const office = sched({ mode: "scheduled", windows: [
  { repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5], slots: [{ startMinute: 600, endMinute: 780 }, { startMinute: 960, endMinute: 1140 }] },
] });
const inside = requestStatus(office, true, monday1200);
check("inside a period: open", inside.open === true);
check("inside a period: says when it closes", inside.nextChangeLabel === "Open until 13:00", inside.nextChangeLabel);
check("inside a period: closesAt is that instant", inside.closesAt === "2026-10-19T10:00:00.000Z", inside.closesAt);

const beforeOpen = requestStatus(office, true, monday0900);
check("before the first period: closed", beforeOpen.open === false);
check("before the first period: opens today", beforeOpen.nextChangeLabel === "Opens today at 10:00", beforeOpen.nextChangeLabel);

check("the end minute itself is closed (a period ends exclusive)",
  requestStatus(office, true, monday1300).open === false);

const betweenPeriods = requestStatus(office, true, at("2026-10-19T11:00:00Z")); // 14:00 EAT
check("between two periods the same day: closed", betweenPeriods.open === false);
check("between two periods: names the later one today", betweenPeriods.nextChangeLabel === "Opens today at 16:00", betweenPeriods.nextChangeLabel);

const afterLast = requestStatus(office, true, at("2026-10-19T19:00:00Z")); // 22:00 EAT Monday
check("after the last period: opens tomorrow", afterLast.nextChangeLabel === "Opens tomorrow at 10:00", afterLast.nextChangeLabel);

const weekendClosed = requestStatus(office, true, sunday1300);
check("a day the schedule does not cover: closed", weekendClosed.open === false);
check("a day the schedule does not cover: names the weekday it reopens",
  weekendClosed.nextChangeLabel === "Opens tomorrow at 10:00", weekendClosed.nextChangeLabel);

const saturdayOnly = sched({ mode: "scheduled", windows: [
  { repeatMode: "weekly", daysOfWeek: [6], slots: [{ startMinute: 600, endMinute: 780 }] },
] });
check("a weekday further out is named by its weekday",
  requestStatus(saturdayOnly, true, monday1300).nextChangeLabel === "Opens Saturday at 10:00",
  requestStatus(saturdayOnly, true, monday1300).nextChangeLabel);

check("scheduled but switched off reports closed with no next time",
  (() => { const s = requestStatus(office, false, monday1300); return s.open === false && s.opensAt === null; })());

const pastOnly = sched({ mode: "scheduled", windows: [
  { repeatMode: "dates", dates: ["2020-01-01"], slots: [{ startMinute: 600, endMinute: 780 }] },
] });
const stale = requestStatus(pastOnly, true, monday1300);
check("a schedule of past dates: closed, and says nothing it cannot know",
  stale.open === false && stale.opensAt === null && stale.nextChangeLabel === "");

const noWindows = sched({ mode: "scheduled", windows: [] });
check("scheduled with no windows at all is closed, not open",
  requestStatus(noWindows, true, monday1300).open === false);

const allDaySat = sched({ mode: "scheduled", windows: [
  { repeatMode: "weekly", daysOfWeek: [6], slots: [{ startMinute: 0, endMinute: 1440 }] },
] });
check("an all-day window is open at midnight",
  requestStatus(allDaySat, true, at("2026-10-23T21:00:00Z")).open === true); // 00:00 EAT Saturday
check("an all-day window closes at midnight after it",
  requestStatus(allDaySat, true, at("2026-10-24T21:00:00Z")).open === false); // 00:00 EAT Sunday

// A window spanning midnight is not expressible as one period (a day ends at 24:00), so
// the operator writes two. Check the pair reads as open on both sides of midnight.
const nightly = sched({ mode: "scheduled", windows: [
  { repeatMode: "daily", slots: [{ startMinute: 1320, endMinute: 1440 }, { startMinute: 0, endMinute: 120 }] },
] });
check("late evening half of a midnight-spanning pair: open",
  requestStatus(nightly, true, at("2026-10-19T20:30:00Z")).open === true); // 23:30 EAT
check("early morning half: open",
  requestStatus(nightly, true, at("2026-10-19T22:30:00Z")).open === true); // 01:30 EAT next day
check("outside both halves: closed",
  requestStatus(nightly, true, at("2026-10-19T06:00:00Z")).open === false); // 09:00 EAT

// ---------- readable summaries ----------

check("weekdays summary", describeWindow(normalizeWindow({ repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5], slots: [{ startMinute: 600, endMinute: 780 }] })!) === "Weekdays · 10:00-13:00");
check("two periods are joined with 'and'",
  describeWindow(normalizeWindow({ repeatMode: "daily", slots: [{ startMinute: 600, endMinute: 780 }, { startMinute: 960, endMinute: 1140 }] })!) === "Every day · 10:00-13:00 and 16:00-19:00");
check("an all-day window says all day",
  describeWindow(normalizeWindow({ repeatMode: "weekly", daysOfWeek: [0], slots: [{ startMinute: 0, endMinute: 1440 }] })!) === "Every Sunday · all day");
check("a label is used when there is one",
  describeWindow(normalizeWindow({ label: "Drive time", repeatMode: "daily", slots: [{ startMinute: 960, endMinute: 1140 }] })!) === "Drive time: Every day · 16:00-19:00");
check("monthly summary",
  describeWindow(normalizeWindow({ repeatMode: "monthly", datesOfMonth: [15, 1], slots: [{ startMinute: 600, endMinute: 660 }] })!) === "Monthly on the 1, 15 · 10:00-11:00");
check("always open reports no schedule lines", describeSchedule(always).length === 0);
check("a switched-off window is left out of the summary",
  describeSchedule(sched({ mode: "scheduled", windows: [
    { repeatMode: "daily", enabled: false, slots: [{ startMinute: 0, endMinute: 60 }] },
    { repeatMode: "daily", slots: [{ startMinute: 60, endMinute: 120 }] },
  ] })).length === 1);

// ---------- clock helpers ----------

const n = nowInEat(at("2026-10-19T21:30:00Z"));
check("EAT rolls over to the next date at 21:00Z", n.date === "2026-10-20" && n.minute === 30, n);
check("EAT weekday follows the EAT date, not UTC's", n.dayOfWeek === 2, n.dayOfWeek);
check("eatInstant is a fixed +03:00", eatInstant("2026-10-19", 600).toISOString() === "2026-10-19T07:00:00.000Z");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
