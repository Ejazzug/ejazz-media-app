/**
 * Tests for the programme schedule rules: what the Control Room is allowed to save, and
 * how an entry is flattened for the mobile app.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/showSchedule.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/showSchedule.test.mjs && node /tmp/showSchedule.test.mjs
 *
 * Touches no database and no network.
 */
import {
  normalizeShowInput, expandShows, describeRepeat, todayInEat, weekdayOfDate,
} from "./showSchedule";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { pass += 1; } else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}
const row = (over: Record<string, unknown>) => ({
  id: 1, name: "Show", hostName: null, station: "radio", dayOfWeek: 0,
  startMinute: 540, endMinute: 600, description: null, repeatMode: "weekly",
  daysOfWeek: [], datesOfMonth: [], dates: [], slots: [], imageUrl: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as never;

// ---- validation ----
const good = normalizeShowInput({
  name: "Drive Time", station: "radio", repeatMode: "weekly", daysOfWeek: [1, 2, 3, 4, 5],
  slots: [{ startMinute: 1020, endMinute: 1140 }, { startMinute: 540, endMinute: 600 }],
  imageUrl: "https://example.com/a.jpg",
});
check("valid weekly accepted", good.ok === true);
if (good.ok) {
  check("slots sorted", good.value.slots![0].startMinute === 540, good.value.slots);
  check("legacy fields = first occurrence",
    good.value.dayOfWeek === 1 && good.value.startMinute === 540 && good.value.endMinute === 600,
    [good.value.dayOfWeek, good.value.startMinute, good.value.endMinute]);
}

const cases: [string, unknown][] = [
  ["no name", { station: "radio", daysOfWeek: [1], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["bad station", { name: "X", station: "fm", daysOfWeek: [1], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["no days", { name: "X", station: "radio", daysOfWeek: [], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["no slots", { name: "X", station: "radio", daysOfWeek: [1], slots: [] }],
  ["end before start", { name: "X", station: "radio", daysOfWeek: [1], slots: [{ startMinute: 600, endMinute: 540 }] }],
  ["end == start", { name: "X", station: "radio", daysOfWeek: [1], slots: [{ startMinute: 600, endMinute: 600 }] }],
  ["past midnight", { name: "X", station: "radio", daysOfWeek: [1], slots: [{ startMinute: 1400, endMinute: 1500 }] }],
  ["overlapping slots", { name: "X", station: "radio", daysOfWeek: [1], slots: [{ startMinute: 540, endMinute: 660 }, { startMinute: 600, endMinute: 700 }] }],
  ["day out of range", { name: "X", station: "radio", daysOfWeek: [7], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["dom out of range", { name: "X", station: "radio", repeatMode: "monthly", datesOfMonth: [32], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["impossible date", { name: "X", station: "radio", repeatMode: "dates", dates: ["2026-02-31"], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["no dates", { name: "X", station: "radio", repeatMode: "dates", dates: [], slots: [{ startMinute: 1, endMinute: 2 }] }],
  ["http artwork", { name: "X", station: "radio", daysOfWeek: [1], slots: [{ startMinute: 1, endMinute: 2 }], imageUrl: "http://x/a.jpg" }],
  ["unknown repeat", { name: "X", station: "radio", repeatMode: "yearly", slots: [{ startMinute: 1, endMinute: 2 }] }],
];
for (const [label, body] of cases) {
  const r = normalizeShowInput(body);
  check("refused: " + label, r.ok === false, r.ok ? r.value : "");
}
check("dedupes days", (() => { const r = normalizeShowInput({ name: "X", station: "radio", daysOfWeek: [1, 1, 3], slots: [{ startMinute: 1, endMinute: 2 }] }); return r.ok && r.value.daysOfWeek!.length === 2; })());
check("dates mode derives weekday", (() => { const r = normalizeShowInput({ name: "X", station: "xtra", repeatMode: "dates", dates: ["2026-10-18"], slots: [{ startMinute: 1, endMinute: 2 }] }); return r.ok && r.value.dayOfWeek === 0; })());
check("weekdayOfDate", weekdayOfDate("2026-10-18") === 0 && weekdayOfDate("nope") === null && weekdayOfDate("2026-13-01") === null);

// ---- expansion for the app ----
const today = { date: "2026-10-18", dayOfWeek: 0 };   // a Sunday
const weekly = row({ id: 2, repeatMode: "weekly", daysOfWeek: [1, 3], slots: [{ startMinute: 540, endMinute: 600 }, { startMinute: 1020, endMinute: 1080 }] });
const expanded = expandShows([weekly], today);
check("weekly expands days x slots", expanded.length === 4, expanded.length);
check("expanded ids are unique", new Set(expanded.map((r) => r.id)).size === 4);
check("every row has numeric dayOfWeek/startMinute (what the shipped app validates)",
  expanded.every((r) => typeof r.id === "number" && typeof r.dayOfWeek === "number" && typeof r.startMinute === "number" && typeof r.endMinute === "number"));
check("rows ordered by day then start",
  JSON.stringify(expanded.map((r) => [r.dayOfWeek, r.startMinute])) === JSON.stringify([[1, 540], [1, 1020], [3, 540], [3, 1020]]),
  expanded.map((r) => [r.dayOfWeek, r.startMinute]));

const monthlyToday = row({ id: 3, repeatMode: "monthly", datesOfMonth: [18], slots: [{ startMinute: 600, endMinute: 660 }] });
const monthlyOther = row({ id: 4, repeatMode: "monthly", datesOfMonth: [2], slots: [{ startMinute: 600, endMinute: 660 }] });
check("monthly appears on its date", expandShows([monthlyToday], today).length === 1);
check("monthly hidden on other days", expandShows([monthlyOther], today).length === 0);
check("monthly carries today's weekday", expandShows([monthlyToday], today)[0].dayOfWeek === 0);

const dated = row({ id: 5, repeatMode: "dates", dates: ["2026-10-18", "2026-12-25"], slots: [{ startMinute: 60, endMinute: 120 }] });
check("exact date appears only today", expandShows([dated], today).length === 1);
check("exact date hidden tomorrow", expandShows([dated], { date: "2026-10-19", dayOfWeek: 1 }).length === 0);

// A row written before this feature: empty jsonb, legacy columns only.
const legacy = row({ id: 6, repeatMode: "weekly", daysOfWeek: null, slots: null, dayOfWeek: 6, startMinute: 1140, endMinute: 1320 });
const legacyRows = expandShows([legacy], today);
check("legacy row still expands to exactly itself",
  legacyRows.length === 1 && legacyRows[0].dayOfWeek === 6 && legacyRows[0].startMinute === 1140 && legacyRows[0].endMinute === 1320,
  legacyRows);

// ---- summaries ----
check("every day", describeRepeat(row({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })) === "Every day");
check("weekdays", describeRepeat(row({ daysOfWeek: [1, 2, 3, 4, 5] })) === "Weekdays");
check("weekends", describeRepeat(row({ daysOfWeek: [0, 6] })) === "Weekends");
check("single day", describeRepeat(row({ daysOfWeek: [3] })) === "Every Wednesday");
check("monthly summary", describeRepeat(row({ repeatMode: "monthly", datesOfMonth: [1, 15] })) === "Monthly on the 1, 15");
check("many dates summarised", describeRepeat(row({ repeatMode: "dates", dates: ["a", "b", "c", "d"] })).indexOf("+2 more") > -1);

const t = todayInEat();
check("todayInEat shape", /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.dayOfWeek >= 0 && t.dayOfWeek <= 6, t);

console.log("passed " + pass + ", failed " + fail);
if (fail) process.exit(1);
