/**
 * Tests for the twelve App Card templates: that each one names a design that exists, that
 * every field it offers is a placeholder that design actually draws, and that what an
 * operator types becomes a render URL deterministically.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/cardTemplates.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/cardTemplates.test.mjs && node /tmp/cardTemplates.test.mjs
 *
 * Touches no database and no network. It DOES read the designs off disk from
 * /opt/radio/templates -- that is the point of half of it: the designs live in the other
 * repo and a card template that names a placeholder which has been renamed there would
 * otherwise only be found by an operator looking at a card with a blank in it.
 */
import fs from "node:fs";
import path from "node:path";
// Signed before the module is asked for a card path. There is no real secret here and the
// test asserts the shape of a token, never a particular value.
process.env.CARD_IMAGE_SECRET = "test-card-secret";
import {
  CARD_TEMPLATES, CARD_RATIOS, CARD_FAMILIES, DEFAULT_CARD_RATIO,
  cardTemplate, cardTemplateIds, cardCatalogue, cardFormats, cardFormat, cardRatio,
  normaliseCardFields, cardRenderData, cardRenderPath,
  cardImageToken, cardImagePath, parseCardImagePath, cardImageUrl, cardRatioFromUrl, cardRow,
  type CardRatio, type CardTemplate,
} from "./cardTemplates";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { pass += 1; } else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}

/** The dashboard's designer templates. Read, never written. */
const DESIGN_DIR = "/opt/radio/templates";

type Design = { id?: string; sizes?: string[]; placeholders?: Array<{ id?: string; type?: string }> };

function design(id: string): Design | null {
  const file = path.join(DESIGN_DIR, id + ".json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Design;
}

/** "1920x1080" -> "16:9", so a pinned size cannot quietly be the wrong shape. */
function ratioOf(size: string): string {
  const [w, h] = size.split("x").map(Number);
  const r = w / h;
  if (Math.abs(r - 1) < 0.01) return "1:1";
  if (Math.abs(r - 16 / 9) < 0.01) return "16:9";
  if (Math.abs(r - 9 / 16) < 0.01) return "9:16";
  return size;
}

const designsReadable = fs.existsSync(DESIGN_DIR);
check("the designer templates are where the catalogue expects them", designsReadable, DESIGN_DIR);

// ------------------------------------------------------------------ the catalogue itself
check("twelve cards, as the brief asked for", CARD_TEMPLATES.length === 12, CARD_TEMPLATES.length);
check("ids are unique", new Set(cardTemplateIds()).size === 12);
check("lookup finds one", cardTemplate("chart-number-one")?.name === "Chart No. 1");
check("lookup refuses a stranger", cardTemplate("no-such-card") === null);
check("lookup refuses a non-string", cardTemplate(7) === null);

const expectedNames = [
  "First Time Played", "Artist Spotlight", "Chart No. 1", "Most Requested", "Poll Winner",
  "Most Voted", "Most Liked", "New Music Release", "Trending Story", "Breaking Music News",
  "Podcast Highlight", "Custom Promo",
];
check("the twelve are the brief's twelve, in its order",
  JSON.stringify(CARD_TEMPLATES.map((t) => t.name)) === JSON.stringify(expectedNames),
  CARD_TEMPLATES.map((t) => t.name));

for (const t of CARD_TEMPLATES) {
  const fieldKeys = t.fields.map((f) => f.key);
  check(t.id + ": field keys are unique", new Set(fieldKeys).size === fieldKeys.length);
  check(t.id + ": nothing is both pinned and editable",
    Object.keys(t.fixed || {}).every((k) => !fieldKeys.includes(k)),
    Object.keys(t.fixed || {}).filter((k) => fieldKeys.includes(k)));
  check(t.id + ": titleFrom names a field", fieldKeys.includes(t.titleFrom), t.titleFrom);
  check(t.id + ": bodyFrom names a field", !t.bodyFrom || fieldKeys.includes(t.bodyFrom), t.bodyFrom);
  check(t.id + ": the title field is required",
    t.fields.find((f) => f.key === t.titleFrom)?.required === true);
  check(t.id + ": every field has an example the Studio can preview",
    t.fields.every((f) => f.example.trim().length > 0));
  check(t.id + ": no example is longer than the field it demonstrates",
    t.fields.every((f) => f.example.length <= f.maxLength),
    t.fields.filter((f) => f.example.length > f.maxLength).map((f) => f.key));
  check(t.id + ": a source note says what fills it", t.source.note.trim().length > 20);
}

// -------------------------------------------------- every card matches the designs on disk
check("the three ratios are the ones the owner asked for",
  JSON.stringify(CARD_RATIOS) === JSON.stringify(["1:1", "16:9", "9:16"]), CARD_RATIOS);
check("a card is square unless someone chooses otherwise", DEFAULT_CARD_RATIO === "1:1");
check("cardRatio accepts the three and nothing else",
  CARD_RATIOS.every((r) => cardRatio(r) === r) && cardRatio("4:5") === null && cardRatio(1) === null);

for (const [family, formats] of Object.entries(CARD_FAMILIES)) {
  check(family + ": offers all three ratios",
    JSON.stringify(formats.map((f) => f.ratio)) === JSON.stringify(["1:1", "16:9", "9:16"]),
    formats.map((f) => f.ratio));
  check(family + ": a different design draws each ratio",
    new Set(formats.map((f) => f.design)).size === 3, formats.map((f) => f.design));
}

if (designsReadable) {
  // Every cut of a family must draw the same placeholder ids, because one card template
  // offers all three shapes from one field list. A renamed placeholder in one cut only would
  // otherwise show up as a blank in that shape alone.
  for (const [family, formats] of Object.entries(CARD_FAMILIES)) {
    for (const f of formats) {
      const d = design(f.design);
      check(family + "/" + f.ratio + ": " + f.design + " exists on disk", d !== null, f.design);
      if (!d) continue;
      check(family + "/" + f.ratio + ": the design's own id matches the file", d.id === f.design, d.id);
      check(family + "/" + f.ratio + ": declares the size the catalogue pins",
        (d.sizes || []).includes(f.size), { pinned: f.size, declared: d.sizes });
      check(family + "/" + f.ratio + ": the pinned size IS that ratio",
        ratioOf(f.size) === f.ratio, { size: f.size, is: ratioOf(f.size) });
    }
  }

  for (const t of CARD_TEMPLATES) {
    for (const f of cardFormats(t)) {
      const d = design(f.design);
      if (!d) continue;
      const slots = new Map((d.placeholders || []).map((p) => [String(p.id), String(p.type)]));
      for (const key of [...Object.keys(t.fixed || {}), ...t.fields.map((x) => x.key)]) {
        check(t.id + " at " + f.ratio + ": " + f.design + " has a placeholder called " + key,
          slots.has(key), [...slots.keys()]);
      }
      // A band is geometry and takes no value, so offering one as a field would be a field
      // that cannot do anything.
      check(t.id + " at " + f.ratio + ": no field points at a band",
        t.fields.every((x) => slots.get(x.key) !== "band"),
        t.fields.filter((x) => slots.get(x.key) === "band").map((x) => x.key));
      // An asset field must be an image/logo slot, and a text field must not be.
      check(t.id + " at " + f.ratio + ": asset fields are image slots and text fields are not",
        t.fields.every((x) => (x.type === "asset") === ["image", "logo"].includes(slots.get(x.key) || "")),
        t.fields.map((x) => x.key + "=" + x.type + "/" + slots.get(x.key)));
    }
  }

  // The news cover's "news" state draws no broadcast origin -- no station chip, no show line,
  // no station logo. lib/preview_news_cover.py fails if one ever appears there, and a card
  // template that filled one would be how it appeared.
  for (const t of CARD_TEMPLATES.filter((c) => c.family === "news-cover")) {
    const touched = [...Object.keys(t.fixed || {}), ...t.fields.map((f) => f.key)];
    check(t.id + ": a news card fills no station chip, show line or station logo",
      !touched.some((k) => ["station", "meta", "station_logo", "socials"].includes(k)), touched);
  }
}

// --------------------------------------------------------------------------- normalisation
const promo = cardTemplate("custom-promo") as CardTemplate;
const news = cardTemplate("trending-story") as CardTemplate;
const release = cardTemplate("new-music-release") as CardTemplate;

let out = normaliseCardFields(promo, { headline: "  Live from Lugogo  ", body: "Doors at 6." });
check("whitespace is trimmed", out.fields.headline === "Live from Lugogo", out.fields);
check("a clean card has no problems", out.problems.length === 0, out.problems);

out = normaliseCardFields(promo, { headline: "Live\nfrom\nLugogo" });
check("a line field is flattened to one line", out.fields.headline === "Live from Lugogo", out.fields);

out = normaliseCardFields(promo, { body: "No headline here" });
check("a missing required field is named", out.problems.some((p) => p.includes("Headline")), out.problems);
check("and the rest of the card still comes back", out.fields.body === "No headline here");

out = normaliseCardFields(promo, { headline: "x", nonsense: "y" });
check("an unknown key is reported, never silently dropped",
  out.problems.some((p) => p.startsWith("nonsense is not a field")), out.problems);
check("and it does not reach the render data", !("nonsense" in out.fields));

out = normaliseCardFields(news, { headline: "h".repeat(121) });
check("an over-long field is refused with its length and the limit",
  out.problems.some((p) => p.includes("121") && p.includes("120")), out.problems);
check("and is NOT truncated into the card", !("headline" in out.fields));

out = normaliseCardFields(release, { title: "DAILY", artwork: "relative/path.jpg" });
check("a relative asset path is refused", out.problems.some((p) => p.includes("absolute path")), out.problems);
out = normaliseCardFields(release, { title: "DAILY", artwork: "/opt/radio/../etc/passwd" });
check("so is a traversal", out.problems.some((p) => p.includes("absolute path")), out.problems);
out = normaliseCardFields(release, { title: "DAILY", artwork: "/opt/radio/media_library/art/daily.jpg" });
check("an absolute path is kept", out.fields.artwork === "/opt/radio/media_library/art/daily.jpg");

out = normaliseCardFields(promo, "not an object");
check("a non-object body is treated as empty, not a crash", out.problems.length === 1, out.problems);
out = normaliseCardFields(promo, { headline: 42 });
check("a number is read as its text", out.fields.headline === "42", out.fields);
out = normaliseCardFields(promo, { headline: "ok", kicker: "   " });
check("a blank optional field is simply absent", !("kicker" in out.fields), out.fields);

// --------------------------------------------------------------------------- render data
const chart = cardTemplate("chart-number-one") as CardTemplate;
const chartFields = normaliseCardFields(chart, { headline: "Sometimes", subhead: "Joshua Baraka" }).fields;
const chartData = cardRenderData(chart, chartFields);
check("pinned values are in the render data", chartData.kicker === "NUMBER ONE" && chartData.stat === "#1", chartData);
check("the operator's values are too", chartData.headline === "Sometimes", chartData);
check("pinned values come first, then fields in declaration order",
  JSON.stringify(Object.keys(chartData)) === JSON.stringify(["kicker", "stat", "headline", "subhead"]),
  Object.keys(chartData));

// ---------------------------------------------------- the operator's preview path (data URL)
check("the same card renders the same query string twice",
  cardRenderPath(chart, chartFields) === cardRenderPath(chart, { ...chartFields }));
check("key order in the input does not change the URL",
  cardRenderPath(chart, { subhead: "Joshua Baraka", headline: "Sometimes" }) === cardRenderPath(chart, chartFields));

const chartPath = cardRenderPath(chart, chartFields);
check("the preview path is the designer's render route for the DESIGN, not the card id",
  chartPath.startsWith("/api/designer/render/achievement?"), chartPath);
check("the pinned size is asked for", chartPath.includes("size=1080x1080"), chartPath);
check("the data is url-encoded json", decodeURIComponent((chartPath.split("data=")[1] || "")).startsWith("{\""), chartPath);
check("nothing unencoded leaks into the query",
  !chartPath.slice(chartPath.indexOf("?")).includes("{") && !chartPath.includes(" "), chartPath);

// Each ratio reaches its OWN design at its own size -- a ratio is a layout here, never the
// same design rendered at another size.
const want: Record<CardRatio, [string, string]> = {
  "1:1": ["achievement", "1080x1080"],
  "16:9": ["achievement-wide", "1920x1080"],
  "9:16": ["achievement-story", "1080x1920"],
};
for (const ratio of CARD_RATIOS) {
  const p = cardRenderPath(chart, chartFields, ratio);
  check("the " + ratio + " preview uses " + want[ratio][0] + " at " + want[ratio][1],
    p.startsWith("/api/designer/render/" + want[ratio][0] + "?") && p.includes("size=" + want[ratio][1]), p);
}
check("a news card's 16:9 is the 1200x675 one its design declares",
  cardRenderPath(news, { headline: "A headline" }, "16:9").includes("size=1200x675"));
check("and its 1:1 is the square cut, not the wide one scaled",
  cardRenderPath(news, { headline: "A headline" }, "1:1").startsWith("/api/designer/render/news-cover-square?"));
check("cardFormat falls back to the first shape rather than failing",
  cardFormat(chart, "4:5" as CardRatio).ratio === "1:1");

// ------------------------------------------------------ the app's path (nothing exposed)
const token = cardImageToken(41, chart, chartFields);
check("a token is short and url-safe", /^[A-Za-z0-9_-]{16}$/.test(token), token);
check("the same card signs the same token twice", cardImageToken(41, chart, chartFields) === token);
check("another row cannot reuse it", cardImageToken(42, chart, chartFields) !== token);
check("editing a word on the card changes it",
  cardImageToken(41, chart, normaliseCardFields(chart, { headline: "Something else", subhead: "Joshua Baraka" }).fields) !== token);
check("another template cannot reuse it",
  cardImageToken(41, cardTemplate("most-requested") as CardTemplate, chartFields) !== token);

const appPath = cardImagePath(41, token);
check("the app's path carries the id, the signature and the shape -- and nothing else",
  appPath === "/api/designer/card/41-" + token + "-1x1.jpg", appPath);
check("it exposes no card text", !appPath.includes("Sometimes") && !appPath.includes("Baraka"), appPath);
check("it exposes no design name", !appPath.includes("achievement"), appPath);
check("it has no query string for a caller to steer", !appPath.includes("?"), appPath);
check("it sits under the prefix ejazz-proxy already forwards and already publishes",
  appPath.startsWith("/api/designer/"), appPath);
for (const ratio of CARD_RATIOS) {
  const parsed = parseCardImagePath(cardImagePath(41, token, ratio).split("/").pop() as string);
  check("the " + ratio + " path parses back to the same card and shape",
    parsed?.cardId === 41 && parsed?.token === token && parsed?.ratio === ratio, parsed);
}
check("one token serves all three shapes",
  new Set(CARD_RATIOS.map((r) => cardImagePath(41, token, r).includes(token))).size === 1);
for (const bad of ["41-short-1x1.jpg", "41-" + token + "-4x5.jpg", "x-" + token + "-1x1.jpg",
                   token + ".jpg", "41-" + token + "-1x1.png", "../41-" + token + "-1x1.jpg",
                   "41-" + token + "-1x1.jpg?x=1"]) {
  check("a path the route must refuse: " + bad, parseCardImagePath(bad) === null);
}

const url = cardImageUrl(41, chart, chartFields, "9:16");
check("the stored image url is absolute and https, as the app and the API both require",
  url.startsWith("https://control.ejazzug.com/api/designer/card/"), url);
check("and it is the signed path, not the data one", url.endsWith("-9x16.jpg") && !url.includes("data="), url);
check("the chosen shape is read back out of the stored url", cardRatioFromUrl(url) === "9:16");
check("a square card reads back as square", cardRatioFromUrl(cardImageUrl(41, chart, chartFields)) === "1:1");
check("an unsigned url reads back as no shape at all",
  cardRatioFromUrl("https://control.ejazzug.com/api/designer/render/achievement?size=1080x1080") === null);
check("so does a non-string", cardRatioFromUrl(null) === null);

// --------------------------------------------------------------------------- the row
const row = cardRow(chart, chartFields);
check("the row is a card", row.type === "card");
check("the row carries no image url -- it needs the id the insert hands back",
  !("imageUrl" in row), Object.keys(row));
check("the title comes from the card, so the row and the picture agree", row.title === "Sometimes", row.title);
check("the template id is stored for a re-render later", row.templateId === "chart-number-one");
check("the fields are stored with it", row.templateFields.subhead === "Joshua Baraka");
check("a template with no bodyFrom leaves body null", cardRow(news, { headline: "A headline" }).body === null);
check("a template with one fills it",
  cardRow(promo, normaliseCardFields(promo, { headline: "h", body: "b" }).fields).body === "b");
check("a card with only pinned text still has a title", cardRow(chart, {}).title === "Chart No. 1");

// --------------------------------------------------------------------------- the catalogue
const cat = cardCatalogue();
check("the catalogue covers every card", cat.length === 12);
check("it carries an example render for each", cat.every((c) => c.examplePath.includes("/api/designer/render/")));
check("it says which feeds are real today",
  cat.filter((c) => c.source.available).length === 8
  && cat.filter((c) => !c.source.available).length === 4,
  cat.filter((c) => !c.source.available).map((c) => c.id));
check("the four with no feed are the vote/like three and the release one",
  JSON.stringify(cat.filter((c) => !c.source.available).map((c) => c.id))
  === JSON.stringify(["poll-winner", "most-voted", "most-liked", "new-music-release"]),
  cat.filter((c) => !c.source.available).map((c) => c.id));
check("the catalogue hands out no drawing detail",
  cat.every((c) => !("fixed" in c)), Object.keys(cat[0]));
check("every card offers all three shapes to choose from",
  cat.every((c) => JSON.stringify(c.ratios) === JSON.stringify(["1:1", "16:9", "9:16"])),
  cat.map((c) => c.ratios));
check("the catalogue's example render follows the shape being chosen",
  cardCatalogue("9:16")[0].examplePath.includes("size=1080x1920"), cardCatalogue("9:16")[0].examplePath);

console.log((fail === 0 ? "OK" : "FAILED") + ": " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
