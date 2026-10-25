/**
 * Tests for the countdown-chart rules: compact storage, the "how far back" window, and
 * which saved day answers a date. No test runner in this repo, so bundle and run:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/countdownChartsCore.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/countdownChartsCore.test.mjs && node /tmp/countdownChartsCore.test.mjs
 *
 * Touches no database and no network.
 */
import {
  addDays, compactEntries, expandEntries, sameEntries, normalizeChartsConfig, earliestAllowed,
  pastDates,
  readCard, isViewable, resolveSnapshot, rowsToPrune, isDateString, type ChartsConfig,
} from "./countdownChartsCore";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) pass += 1; else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}
const cfg = (over: Partial<ChartsConfig>): ChartsConfig => ({ pastMode: "off", customFrom: "", keepDays: 365, ...over });

// ---- dates ----
check("addDays forward", addDays("2026-10-18", 1) === "2026-10-19");
check("addDays across month", addDays("2026-10-31", 1) === "2026-11-01");
check("addDays back across year", addDays("2026-01-01", -1) === "2025-12-31");
check("leap day valid", isDateString("2028-02-29"));
check("bad date rejected", !isDateString("2026-02-30") && !isDateString("2026-2-3") && !isDateString("tomorrow") && !isDateString(5));

// ---- compact storage ----
const entries = [
  { position: 3, title: " Gratitude ", artist: "Asake" },
  { position: 1, title: "Yoyo", artist: "Joshua Baraka" },
  { position: 2, title: "Oh No", artist: "Rema" },
  { position: 4, title: "", artist: "No title is dropped" },
];
const c = compactEntries(entries);
check("sorted best-first and trimmed", JSON.stringify(c) === JSON.stringify([["Yoyo", "Joshua Baraka"], ["Oh No", "Rema"], ["Gratitude", "Asake"]]), c);
check("round trip positions are index+1", JSON.stringify(expandEntries(c).map((e) => e.position)) === "[1,2,3]");
check("missing artist becomes empty string", compactEntries([{ position: 1, title: "X", artist: undefined as never }])[0][1] === "");
check("same entries equal", sameEntries(c, compactEntries(entries)));
check("different title not equal", !sameEntries(c, [["Yoyo", "Joshua Baraka"], ["Oh No", "Rema"], ["Other", "Asake"]]));
check("different length not equal", !sameEntries(c, c.slice(0, 2)));
check("caps entries at 100", compactEntries(Array.from({ length: 150 }, (_, i) => ({ position: i + 1, title: "t" + i, artist: "a" }))).length === 100);
check("long text capped", compactEntries([{ position: 1, title: "x".repeat(500), artist: "y" }])[0][0].length === 200);
// A Top 10 must stay small: this is the "most space friendly" requirement.
const top10 = compactEntries(Array.from({ length: 10 }, (_, i) => ({ position: i + 1, title: "A fairly long song title " + i, artist: "Some Artist Name" })));
check("Top 10 under 700 bytes as JSON", JSON.stringify(top10).length < 700, JSON.stringify(top10).length);

// ---- config validation ----
check("default is off", normalizeChartsConfig(undefined).pastMode === "off");
check("week kept", normalizeChartsConfig({ pastMode: "week" }).pastMode === "week");
check("junk mode -> off", normalizeChartsConfig({ pastMode: "forever" }).pastMode === "off");
check("custom without a date -> off", normalizeChartsConfig({ pastMode: "custom" }).pastMode === "off");
check("custom with bad date -> off", normalizeChartsConfig({ pastMode: "custom", customFrom: "31/12/2026" }).pastMode === "off");
check("custom with date kept", normalizeChartsConfig({ pastMode: "custom", customFrom: "2026-09-01" }).customFrom === "2026-09-01");
check("keepDays clamps low", normalizeChartsConfig({ keepDays: 1 }).keepDays === 7);
check("keepDays clamps high", normalizeChartsConfig({ keepDays: 99999 }).keepDays === 3650);
check("keepDays junk -> default", normalizeChartsConfig({ keepDays: "lots" }).keepDays === 365);

// ---- the window ----
const today = "2026-10-18";
check("off -> no window", earliestAllowed(cfg({ pastMode: "off" }), today) === null);
check("week = 7 days back", earliestAllowed(cfg({ pastMode: "week" }), today) === "2026-10-11");
check("month = 30 days back", earliestAllowed(cfg({ pastMode: "month" }), today) === "2026-09-18");
check("custom = that date", earliestAllowed(cfg({ pastMode: "custom", customFrom: "2026-10-01" }), today) === "2026-10-01");
check("custom in the future clamps to today", earliestAllowed(cfg({ pastMode: "custom", customFrom: "2027-01-01" }), today) === today);
check("custom older than retention clamps to it", earliestAllowed(cfg({ pastMode: "custom", customFrom: "2020-01-01", keepDays: 30 }), today) === "2026-09-18");

// ---- offered dates ----
const wk = pastDates(cfg({ pastMode: "week" }), today, "2026-01-01");
check("week offers 7 dates, newest first", wk.length === 7 && wk[0] === "2026-10-17" && wk[6] === "2026-10-11", wk);
check("nothing saved yet -> none", pastDates(cfg({ pastMode: "week" }), today, null).length === 0);
check("clipped to the first saved day", JSON.stringify(pastDates(cfg({ pastMode: "month" }), today, "2026-10-15")) === JSON.stringify(["2026-10-17", "2026-10-16", "2026-10-15"]));
check("first saved is today -> no past dates", pastDates(cfg({ pastMode: "month" }), today, today).length === 0);
check("off -> none even with history", pastDates(cfg({ pastMode: "off" }), today, "2026-01-01").length === 0);
check("capped at 60", pastDates(cfg({ pastMode: "custom", customFrom: "2026-01-01" }), today, "2026-01-01").length === 60);

// ---- who may view what ----
check("viewable inside week", isViewable(cfg({ pastMode: "week" }), today, "2026-10-12", "2026-01-01"));
check("not viewable outside week", !isViewable(cfg({ pastMode: "week" }), today, "2026-10-01", "2026-01-01"));
check("not viewable when off", !isViewable(cfg({ pastMode: "off" }), today, "2026-10-17", "2026-01-01"));
check("not viewable before first saved", !isViewable(cfg({ pastMode: "month" }), today, "2026-10-01", "2026-10-10"));
check("future date refused", !isViewable(cfg({ pastMode: "month" }), today, "2026-10-19", "2026-01-01"));

// ---- resolving a date to a saved row ("no row" = unchanged) ----
const rows = [{ day: "2026-10-10", v: "a" }, { day: "2026-10-14", v: "b" }, { day: "2026-10-17", v: "c" }];
check("exact day", resolveSnapshot(rows, "2026-10-14")?.v === "b");
check("gap day uses the earlier row", resolveSnapshot(rows, "2026-10-16")?.v === "b");
check("after the last row", resolveSnapshot(rows, "2026-10-18")?.v === "c");
check("before the first row -> null", resolveSnapshot(rows, "2026-10-09") === null);
check("row order does not matter", resolveSnapshot([...rows].reverse(), "2026-10-15")?.v === "b");

// ---- retention keeps the row that still answers later days ----
const pr = rowsToPrune(rows, "2026-10-16");
check("prune drops only rows older than the carry-over row", JSON.stringify(pr.map((r) => r.day)) === JSON.stringify(["2026-10-10"]), pr);
check("nothing older than cutoff -> nothing pruned", rowsToPrune(rows, "2026-10-01").length === 0);
check("single older row is kept as carry-over", rowsToPrune(rows, "2026-10-12").length === 0);
// After pruning, a date at the cutoff still resolves.
const kept = rows.filter((r) => !pr.includes(r));
check("cutoff date still resolves after prune", resolveSnapshot(kept, "2026-10-16")?.v === "b");

// ---- the shareable card, as handed over by the dashboard ----
// It becomes an <img> source on a phone and on a website, so the shape is what is trusted, never
// the sender: anything that is not a plain https URL is no card at all.
check("a card is read from the dashboard's shape",
  JSON.stringify(readCard({ public_url: "https://control.ejazzug.com/static/x.png?v=1", caption: "hi" })) ===
  JSON.stringify({ url: "https://control.ejazzug.com/static/x.png?v=1", caption: "hi" }));
check("no caption is still a card", readCard({ public_url: "https://a/b.png" })?.caption === "");
check("the url is trimmed", readCard({ public_url: "  https://a/b.png  " })?.url === "https://a/b.png");
check("null, undefined and junk are no card",
  readCard(null) === null && readCard(undefined) === null && readCard("https://a/b.png") === null);
check("a relative url is refused", readCard({ public_url: "/static/x.png" }) === null);
check("plain http is refused", readCard({ public_url: "http://a/b.png" }) === null);
check("a javascript: url is refused", readCard({ public_url: "javascript:alert(1)" }) === null);
check("a data: url is refused", readCard({ public_url: "data:image/png;base64,AAA" }) === null);
check("a url with whitespace in it is refused", readCard({ public_url: "https://a/ b.png" }) === null);
check("a non-string caption becomes empty",
  readCard({ public_url: "https://a/b.png", caption: 42 })?.caption === "");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
