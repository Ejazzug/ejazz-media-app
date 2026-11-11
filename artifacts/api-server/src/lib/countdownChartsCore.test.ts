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
  readDesign, sameDesign, readEntries, type CompactEntries,
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
check("sorted best-first and trimmed", JSON.stringify(c) === JSON.stringify([
  ["Yoyo", "Joshua Baraka", "", 0, ""], ["Oh No", "Rema", "", 0, ""], ["Gratitude", "Asake", "", 0, ""],
]), c);
check("round trip positions are index+1", JSON.stringify(expandEntries(c).map((e) => e.position)) === "[1,2,3]");
check("missing artist becomes empty string", compactEntries([{ position: 1, title: "X", artist: undefined as never }])[0][1] === "");
check("same entries equal", sameEntries(c, compactEntries(entries)));
check("different title not equal", !sameEntries(c, [["Yoyo", "Joshua Baraka"], ["Oh No", "Rema"], ["Other", "Asake"]]));
// A chart with nothing extra must compare equal to the SHORT rows already in the database, or the
// first sync after this change would rewrite every day that has not actually changed.
check("a long row carrying nothing equals the short row it replaced",
  sameEntries(c, [["Yoyo", "Joshua Baraka"], ["Oh No", "Rema"], ["Gratitude", "Asake"]]));
check("different length not equal", !sameEntries(c, c.slice(0, 2)));
check("caps entries at 100", compactEntries(Array.from({ length: 150 }, (_, i) => ({ position: i + 1, title: "t" + i, artist: "a" }))).length === 100);
check("long text capped", compactEntries([{ position: 1, title: "x".repeat(500), artist: "y" }])[0][0].length === 200);
// A Top 10 must stay small: this is the "most space friendly" requirement.
const top10 = compactEntries(Array.from({ length: 10 }, (_, i) => ({ position: i + 1, title: "A fairly long song title " + i, artist: "Some Artist Name" })));
check("Top 10 with no extras under 900 bytes as JSON", JSON.stringify(top10).length < 900, JSON.stringify(top10).length);

// ---- covers, arrows and last week ---------------------------------------------------------
// What the app needs to draw the chart the way the PICTURE draws it. Each of the three is
// independently optional, and each one reaches a phone -- a cover becomes an <Image> source --
// so every one of them is validated rather than trusted.
const DASH_ROWS = [
  { position: 1, title: "Yoyo", artist: "Joshua Baraka", move: "up", last_week: 4,
    art_url: "https://control.ejazzug.com/api/chart-art/" + "a".repeat(40) + ".jpg" },
  { position: 2, title: "Oh No", artist: "Rema", move: "new" },
  { position: 3, title: "Gratitude", artist: "Asake", move: "same", last_week: 3 },
];
{
  const read = readEntries(DASH_ROWS);
  check("snake_case becomes camelCase", read[0].move === "up" && read[0].lastWeek === 4);
  check("a cover url comes through", read[0].artUrl?.endsWith(".jpg") === true);
  check("a row with no extras carries none",
    read[1].lastWeek === undefined && read[1].artUrl === undefined && read[1].move === "new");
  const round = expandEntries(compactEntries(read));
  check("the extras survive storage", round[0].move === "up" && round[0].lastWeek === 4
    && round[0].artUrl === DASH_ROWS[0].art_url);
  check("absent extras are absent after storage, not zero",
    round[1].lastWeek === undefined && round[1].artUrl === undefined);
  check("a cover appearing is a real change (so the day gets rewritten)",
    !sameEntries(compactEntries(read), compactEntries(read.map((e, i) => i ? e : { ...e, artUrl: undefined }))));
  check("a changed arrow is a real change",
    !sameEntries(compactEntries(read), compactEntries(read.map((e, i) => i ? e : { ...e, move: "down" as const }))));
}
{
  // Movement words and positions, held to the dashboard's own vocabulary.
  const junk = readEntries([
    { position: 1, title: "A", artist: "B", move: "sideways", last_week: 0, art_url: "javascript:alert(1)" },
    { position: 2, title: "C", artist: "D", move: "UP", last_week: "7", art_url: "http://control/x.jpg" },
    { position: 3, title: "E", artist: "F", last_week: 101 },
    { position: 4, title: "G", artist: "H", last_week: -2, art_url: "https://a/ b.jpg" },
  ]);
  check("an unknown movement word is dropped", junk[0].move === undefined);
  check("a javascript: cover is refused", junk[0].artUrl === undefined);
  check("plain http is refused too", junk[1].artUrl === undefined);
  check("a movement word is case-insensitive", junk[1].move === "up");
  check("a numeric string last week is read", junk[1].lastWeek === 7);
  check("last week beyond the chart length is dropped", junk[2].lastWeek === undefined);
  check("a negative last week is dropped", junk[3].lastWeek === undefined);
  check("a cover url with whitespace is refused", junk[3].artUrl === undefined);
  check("a row with no position or title is dropped",
    readEntries([{ title: "no position" }, { position: 2, title: "   " }, { position: 3, title: "kept" }]).length === 1);
  check("junk in place of rows is no rows", readEntries(null).length === 0 && readEntries("rows").length === 0);
}
{
  // The short rows already in the database must keep working, unchanged, for ever.
  const legacy: CompactEntries = [["Yoyo", "Joshua Baraka"], ["Oh No", "Rema"]];
  const out = expandEntries(legacy);
  check("a legacy day still expands", out.length === 2 && out[1].position === 2 && out[1].title === "Oh No");
  check("a legacy day simply has no extras",
    out[0].move === undefined && out[0].lastWeek === undefined && out[0].artUrl === undefined);
  check("a stored row full of junk expands to a usable row",
    JSON.stringify(expandEntries([["T", "A", "sideways", 999, "data:x"] as never])) === JSON.stringify([{ position: 1, title: "T", artist: "A" }]));
}

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


// ---- the card design handed to the app (colours only) --------------------------------------
const FULL = {
  bg_mode: "gradient", bg_color: "#112233", bg_color2: "#AABBCC", gradient_direction: "diagonal",
  accent_color: "#ff0056", text_color: "#FFFFFF", header_text: "EJazz Top 10",
  footer_text: "Every weekday on EJazz Xtra",
  // Honoured by the app, so stored:
  show_artwork: true, show_arrows: false, show_last_week: true, show_new_badge: true,
  // Sent by the dashboard and deliberately NOT stored (the app draws its own layout):
  list_style: "squares", font_style: "classic", canvas: "story", track_count: 10, name: "Billboard Dark",
};

{
  const d = readDesign(FULL)!;
  check("design: colours come through", d.bgColor === "#112233" && d.bgColor2 === "#AABBCC");
  check("design: hex is normalised to upper case", d.accentColor === "#FF0056");
  check("design: enums come through", d.bgMode === "gradient" && d.gradientDirection === "diagonal");
  check("design: wording comes through", d.headerText === "EJazz Top 10");
  check("design: the four display switches ARE stored",
    d.showArtwork === true && d.showArrows === false && d.showLastWeek === true && d.showNewBadge === true);
  check("design: the layout switches are NOT stored",
    !("listStyle" in d) && !("fontStyle" in d) && !("trackCount" in d) && !("canvas" in d), Object.keys(d));
  check("design: a missing switch falls back to the dashboard's own default",
    readDesign({ bg_color: "#112233" })!.showArtwork === true
    && readDesign({ bg_color: "#112233" })!.showLastWeek === false);
  check("design: a non-boolean switch falls back rather than being coerced",
    readDesign({ show_artwork: "yes" })!.showArtwork === true
    && readDesign({ show_arrows: 0 })!.showArrows === true);
  check("design: a changed switch compares unequal (the app must be told)",
    !sameDesign(readDesign(FULL), readDesign({ ...FULL, show_artwork: false })));
}

check("design: no design at all is null", readDesign(null) === null && readDesign(undefined) === null);
check("design: a non-object is null", readDesign("#fff") === null && readDesign(42) === null);

{
  // One bad colour draws in the default colour rather than blanking the chart.
  const d = readDesign({ ...FULL, bg_color: "javascript:alert(1)", accent_color: "red" })!;
  check("design: a junk colour falls back, it is never passed through",
    d.bgColor === "#0B0B12" && d.accentColor === "#FF0056", d);
  check("design: a good colour beside a bad one survives", d.bgColor2 === "#AABBCC");
}

{
  const d = readDesign({ ...FULL, bg_mode: "disco", gradient_direction: "sideways" })!;
  check("design: an unknown enum falls back", d.bgMode === "solid" && d.gradientDirection === "vertical");
}

{
  const d = readDesign({ ...FULL, bg_color: "#abc" })!;
  check("design: a 3-digit hex is not accepted", d.bgColor === "#0B0B12");
}

{
  const d = readDesign({ header_text: "x".repeat(99), footer_text: "y".repeat(99) })!;
  check("design: wording is clamped to the dashboard's own limits",
    d.headerText.length === 48 && d.footerText.length === 72);
}

{
  const d = readDesign({ header_text: 7, footer_text: null })!;
  check("design: non-text wording becomes empty, not \"7\"", d.headerText === "" && d.footerText === "");
}

{
  const a = readDesign(FULL), b = readDesign(FULL);
  check("design: identical designs compare equal (no needless writes)", sameDesign(a, b));
  check("design: a changed colour compares unequal",
    !sameDesign(a, readDesign({ ...FULL, accent_color: "#000000" })));
  check("design: null equals null", sameDesign(null, null));
  check("design: null never equals a design", !sameDesign(null, a) && !sameDesign(a, null));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
