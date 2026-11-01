/**
 * The twelve App Cards, as DATA.
 *
 * The owner's brief asked for "12 named templates as data, not hardcoded designs", and this
 * is that list. A card template is a name, the designer design that DRAWS it, the fields an
 * operator fills, and where the draft content comes from. It holds no drawing code at all:
 * PYTHON DRAWS, NODE REMEMBERS, so every entry here points at one of the designs in
 * /opt/radio/templates/ and the picture is made by /opt/radio/lib/designer.py behind
 * GET /api/designer/render/<design>.
 *
 * Which means a card needs NO new app field and NO Codemagic build to be visible on a phone:
 * `content_items.image_url` is a render URL, and the shipped app already shows an item's
 * image. `template_id` + `template_fields` on the row are what the card was made from, so the
 * same card can be re-rendered later (a fixed typo, a new design) without an operator
 * retyping it.
 *
 * Field keys ARE designer placeholder ids on purpose. A second naming layer would have to be
 * kept in step with nineteen designs by hand, and the first rename would break it silently.
 * `cardDesignCoversFields` in the test asserts every key exists in the design on disk.
 *
 * What is NOT here: the approval policy (that is the dashboard's lib/content_os.py), the
 * schedule (content_items.schedule_at and Node's lib/scheduler.ts), and the push (one choke
 * point, lib/contentPush.ts). A card joins all three; it gets a second copy of none of them.
 */
import crypto from "node:crypto";

/** A field's shape, which is all the Studio needs to draw an input for it. */
export type CardFieldType =
  /** One line: a headline, a name, a stat. Newlines are flattened -- the renderer wraps. */
  | "line"
  /** Several lines of prose. */
  | "paragraph"
  /** An absolute path to an image ON THIS BOX. The renderer takes paths, never URLs, and
   *  contains them to its own ASSET_ROOTS -- so a traversal is its refusal, not ours. */
  | "asset";

export interface CardField {
  /** The placeholder id in the design. Also the key in `content_items.template_fields`. */
  key: string;
  label: string;
  type: CardFieldType;
  required?: boolean;
  /** Refused above this, never truncated: a headline cut mid-word is a worse card than an
   *  error an operator can answer. Sized to what the design holds at its own width. */
  maxLength: number;
  hint?: string;
  /** Shown in the Studio as placeholder text, and used by the catalogue's own preview. */
  example: string;
}

/** Where a DRAFT of this card comes from, and whether that feed exists on this box today. */
export interface CardSource {
  kind:
    | "airplay"    // AzuraCast play history, via the dashboard's lib/airplay.py
    | "chart"      // our own countdown, via lib/chart_history.py -> lib/music_intel.py
    | "requests"   // song requests, read back out of AzuraCast's history
    | "engagement" // content_votes / content_likes
    | "news"       // the News Desk queue and published articles
    | "podcast"    // podcasts/shows/<Show>/episodes
    | "release"    // a new-release store
    | "manual";    // nothing suggests it; an operator writes it
  /** True only if a real feed can fill this card TODAY. A false here is not a bug to fix in
   *  this file -- it is a fact about the box, and the Studio says so rather than offering a
   *  generator that would invent numbers. */
  available: boolean;
  /** What it reads, or exactly what is missing. Shown to the operator. */
  note: string;
}

/**
 * The three shapes every card can be made in, and the one an operator picks.
 *
 * Asked for by the owner 2026-11-01: "cards should be in 3 formats, 1:1, 16:9, 9:16, someone
 * should be able to choose". Note these are NOT the designer's own three ratios (9:16, 4:5,
 * 1:1 -- `SHAPES` in designer.js): a card is read in an app feed and shared to WhatsApp, so
 * 16:9 earns its place and 4:5 does not.
 *
 * A ratio is not a size the same design is rendered at. Geometry in a design is absolute
 * pixels, so one design cannot serve three ratios without its own layout for each -- which is
 * why a card names a design FAMILY and the family names one design per ratio.
 */
export const CARD_RATIOS = ["1:1", "16:9", "9:16"] as const;
export type CardRatio = (typeof CARD_RATIOS)[number];

/** The ratio as it appears in a URL, where a colon would have to be escaped. */
const RATIO_SLUGS: Record<CardRatio, string> = { "1:1": "1x1", "16:9": "16x9", "9:16": "9x16" };
const SLUG_RATIOS = new Map(Object.entries(RATIO_SLUGS).map(([r, s]) => [s, r as CardRatio]));

export interface CardFormat {
  ratio: CardRatio;
  /** The design in /opt/radio/templates/ that draws this ratio. */
  design: string;
  /** The size that design declares. Pinned rather than left to the renderer's first-allowed,
   *  so the URL says what it asked for; the test checks it against the design on disk, so a
   *  drift is caught there and not by a card that renders 400. */
  size: string;
}

/**
 * One design per ratio, per family.
 *
 * Every cut of a family draws the SAME placeholder ids, which is what lets one card template
 * offer all three without a second field list. The test asserts that for every field of every
 * card against every one of its three designs on disk.
 */
export const CARD_FAMILIES: Record<string, CardFormat[]> = {
  achievement: [
    { ratio: "1:1", design: "achievement", size: "1080x1080" },
    { ratio: "16:9", design: "achievement-wide", size: "1920x1080" },
    { ratio: "9:16", design: "achievement-story", size: "1080x1920" },
  ],
  premiere: [
    { ratio: "1:1", design: "premiere", size: "1080x1080" },
    { ratio: "16:9", design: "premiere-wide", size: "1920x1080" },
    { ratio: "9:16", design: "premiere-story", size: "1080x1920" },
  ],
  // The 16:9 cut here is 1200x675, not 1920x1080: it is also the WordPress cover for a news
  // article, and that size shipped long before cards existed. Both are 16:9, which is what
  // was asked for -- the pixel count is the design's business.
  "news-cover": [
    { ratio: "1:1", design: "news-cover-square", size: "1080x1080" },
    { ratio: "16:9", design: "news-cover", size: "1200x675" },
    { ratio: "9:16", design: "news-cover-story", size: "1080x1920" },
  ],
  "episode-promo": [
    { ratio: "1:1", design: "episode-promo", size: "1080x1080" },
    { ratio: "16:9", design: "episode-promo-wide", size: "1920x1080" },
    { ratio: "9:16", design: "episode-promo-story", size: "1080x1920" },
  ],
  announcement: [
    { ratio: "1:1", design: "announcement", size: "1080x1080" },
    { ratio: "16:9", design: "announcement-wide", size: "1920x1080" },
    { ratio: "9:16", design: "announcement-story", size: "1080x1920" },
  ],
};

/** The ratio a card is made in unless the operator picks another. */
export const DEFAULT_CARD_RATIO: CardRatio = "1:1";

export function cardRatio(value: unknown): CardRatio | null {
  return typeof value === "string" && (CARD_RATIOS as readonly string[]).includes(value)
    ? (value as CardRatio)
    : null;
}

export interface CardTemplate {
  /** Stored in `content_items.template_id`. Stable: rows reference it. */
  id: string;
  /** The owner's name for it, from the brief. */
  name: string;
  /** Which set of designs draws it -- a key of CARD_FAMILIES, one design per ratio. */
  family: keyof typeof CARD_FAMILIES;
  /** Which palette rule the designs follow -- see CLAUDE.md, "Design system". A reading card
   *  and an engagement card are meant to look nothing like each other. */
  bucket: "engagement" | "reading";
  /** Placeholder values the template pins. An operator never sees or edits these -- a card
   *  whose kicker could say anything is not a named template any more. */
  fixed?: Record<string, string>;
  fields: CardField[];
  /** Which field becomes `content_items.title` (notNull) and which becomes `body`. The row
   *  and the picture then cannot disagree about what the card says. */
  titleFrom: string;
  bodyFrom?: string;
  source: CardSource;
}

/**
 * Where the phone fetches a render from. Absolute on purpose: `image_url` is read by the app
 * off the Cloudflare tunnel, where a relative path resolves against the bundle and loads
 * nothing. Overridable for a box that is not this one.
 */
function publicOrigin(): string {
  return (process.env.PUBLIC_API_ORIGIN || "https://control.ejazzug.com").replace(/\/+$/, "");
}

/**
 * The secret the card image path is signed with.
 *
 * Derived from SESSION_SECRET with its own label rather than used raw, so a card URL and an
 * admin session are not signed by the same key -- and settable on its own if it should ever
 * be rotated without logging every operator out.
 */
function cardSecret(): string {
  const secret = process.env.CARD_IMAGE_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("CARD_IMAGE_SECRET or SESSION_SECRET must be set to sign card images");
  return crypto.createHmac("sha256", secret).update("ejazz-card-image-v1").digest("hex");
}

/** Every card the Studio can make. Order is the brief's order. */
export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "first-time-played",
    name: "First Time Played",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "FIRST TIME ON EJAZZ" },
    fields: [
      { key: "headline", label: "Song", type: "line", required: true, maxLength: 70, example: "Sometimes" },
      { key: "subhead", label: "Artist", type: "line", required: true, maxLength: 60, example: "Joshua Baraka" },
      { key: "stat", label: "Stat", type: "line", maxLength: 16, hint: "Short and loud -- it is drawn big.", example: "1ST SPIN" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "Straight into rotation on EJazz Xtra." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "EJazz Xtra - 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "airplay",
      available: true,
      note: "A first play WITHIN the window podcasts/airplay/ covers (29 days today), never \"ever\" -- the digests do not go back further and a card claiming otherwise would be a lie.",
    },
  },
  {
    id: "artist-spotlight",
    name: "Artist Spotlight",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "ARTIST SPOTLIGHT" },
    fields: [
      { key: "headline", label: "Artist", type: "line", required: true, maxLength: 60, example: "Azawi" },
      { key: "stat", label: "Stat", type: "line", maxLength: 16, example: "42 SPINS" },
      { key: "subhead", label: "Why them", type: "line", maxLength: 70, example: "Most played on EJazz Xtra this week" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "Three songs in rotation and the count keeps climbing." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "26 Oct - 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "airplay",
      available: true,
      note: "Spins and rotation from lib/airplay.py, which separates imaging from music -- so a sweeper cannot be spotlighted as an artist.",
    },
  },
  {
    id: "chart-number-one",
    name: "Chart No. 1",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "NUMBER ONE", stat: "#1" },
    fields: [
      { key: "headline", label: "Song", type: "line", required: true, maxLength: 70, example: "Sometimes" },
      { key: "subhead", label: "Artist", type: "line", required: true, maxLength: 60, example: "Joshua Baraka" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "Second week at the top of the Daily Top 10." },
      { key: "detail", label: "Which chart", type: "line", maxLength: 60, example: "EJazz Xtra Daily Top 10 - 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "chart",
      available: true,
      note: "Our own countdown only, scoped to ONE countdown id, from lib/chart_history.py -- the chart generator's saved runs come from outside sources and are a research tool, not a record of what we played.",
    },
  },
  {
    id: "most-requested",
    name: "Most Requested",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "MOST REQUESTED" },
    fields: [
      { key: "headline", label: "Song", type: "line", required: true, maxLength: 70, example: "Kampala Nights" },
      { key: "subhead", label: "Artist", type: "line", required: true, maxLength: 60, example: "Elijah Kitaka" },
      { key: "stat", label: "Stat", type: "line", maxLength: 16, example: "31 ASKS" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "You kept asking, so it kept playing." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "EJazz Xtra - this week" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "requests",
      available: true,
      note: "EJazz XTRA ONLY. Requests POST straight to AzuraCast and lib/airplay.py reads them back; Centova reports no requests at all, so EJazz Radio has no figure and gets none invented for it.",
    },
  },
  {
    id: "poll-winner",
    name: "Poll Winner",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "POLL RESULT" },
    fields: [
      { key: "headline", label: "The question", type: "line", required: true, maxLength: 80, example: "Best Ugandan album of the year?" },
      { key: "subhead", label: "What won", type: "line", required: true, maxLength: 60, example: "Dalilah" },
      { key: "stat", label: "Share", type: "line", maxLength: 16, example: "58%" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "You voted. It was not even close." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "1,204 votes - closed 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "engagement",
      available: false,
      note: "The vote store (content_votes) exists but NOTHING writes to it: the shipped app POSTs nothing, anywhere, and the ingest needs a Codemagic build this box cannot produce. Until then a winner can only be typed in by hand, and every tally reads an honest zero.",
    },
  },
  {
    id: "most-voted",
    name: "Most Voted",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "MOST VOTED" },
    fields: [
      { key: "headline", label: "What it was", type: "line", required: true, maxLength: 80, example: "Song of the week" },
      { key: "subhead", label: "The winner", type: "line", required: true, maxLength: 60, example: "Mbeere - Azawi" },
      { key: "stat", label: "Votes", type: "line", maxLength: 16, example: "2,140" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "The most voted-on card in the app this week." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "26 Oct - 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "engagement",
      available: false,
      note: "Same as Poll Winner: content_votes is live and empty until an app build can POST into it.",
    },
  },
  {
    id: "most-liked",
    name: "Most Liked",
    family: "achievement",
    bucket: "engagement",
    fixed: { kicker: "MOST LIKED" },
    fields: [
      { key: "headline", label: "What it was", type: "line", required: true, maxLength: 80, example: "ShockTok: the one about Kampala nightlife" },
      { key: "stat", label: "Likes", type: "line", maxLength: 16, example: "1,860" },
      { key: "subhead", label: "Line beside it", type: "line", maxLength: 70, example: "The card you liked most this week" },
      { key: "body", label: "Line under it", type: "paragraph", maxLength: 180, example: "Still being shared days later." },
      { key: "detail", label: "Footnote", type: "line", maxLength: 60, example: "26 Oct - 1 Nov" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "engagement",
      available: false,
      note: "Same as Poll Winner: content_likes is live and empty until an app build can POST into it.",
    },
  },
  {
    id: "new-music-release",
    name: "New Music Release",
    family: "premiere",
    bucket: "engagement",
    fields: [
      { key: "title", label: "Release", type: "line", required: true, maxLength: 60, example: "DAILY - Joshua Baraka" },
      { key: "date", label: "When", type: "line", maxLength: 28, example: "Out Friday" },
      { key: "artwork", label: "Cover art", type: "asset", maxLength: 300, hint: "A path on this box. Left empty, the station logo stands in.", example: "/opt/radio/podcasts/station_art/generic_cover.png" },
      { key: "cta", label: "Call to action", type: "line", maxLength: 22, hint: "Short -- it is a button, and it wraps past about twenty characters.", example: "Out now on EJazz" },
    ],
    titleFrom: "title",
    source: {
      kind: "release",
      available: false,
      note: "This box has no release store -- nothing anywhere records an upcoming release date. An operator fills this card by hand until one exists.",
    },
  },
  {
    id: "trending-story",
    name: "Trending Story",
    family: "news-cover",
    bucket: "reading",
    fixed: { badge: "TRENDING" },
    fields: [
      {
        key: "headline",
        label: "Headline",
        type: "line",
        required: true,
        maxLength: 120,
        hint: "Judge it at thumbnail size -- this card is seen at 132px in a WhatsApp preview.",
        example: "Kampala's club scene is quietly becoming East Africa's main character",
      },
    ],
    titleFrom: "headline",
    source: {
      kind: "news",
      available: true,
      note: "Published ejazzug.com articles and the News Desk queue. Source news is research input and is never republished -- a card carries our own headline, not an outlet's.",
    },
  },
  {
    id: "breaking-music-news",
    name: "Breaking Music News",
    family: "news-cover",
    bucket: "reading",
    fixed: { badge: "BREAKING" },
    fields: [
      {
        key: "headline",
        label: "Headline",
        type: "line",
        required: true,
        maxLength: 120,
        hint: "Judge it at thumbnail size -- this card is seen at 132px in a WhatsApp preview.",
        example: "Azawi announces a Lugogo show and tickets go in an hour",
      },
    ],
    titleFrom: "headline",
    source: {
      kind: "news",
      available: true,
      note: "Same feed as Trending Story. The news state of this design draws no station chip, no show line and no station logo -- a music news card has no broadcast origin, and lib/preview_news_cover.py fails if one ever appears.",
    },
  },
  {
    id: "podcast-highlight",
    name: "Podcast Highlight",
    family: "episode-promo",
    bucket: "engagement",
    fixed: { kicker: "NEW EPISODE" },
    fields: [
      { key: "show", label: "Show", type: "line", required: true, maxLength: 40, example: "ShockTok" },
      { key: "headline", label: "Episode", type: "line", required: true, maxLength: 90, example: "The Kampala nightlife episode everyone's quoting" },
      { key: "time", label: "When it airs", type: "line", maxLength: 40, example: "Tonight, 8pm" },
      { key: "artwork", label: "Cover art", type: "asset", maxLength: 300, hint: "A path on this box. Left empty, nothing is drawn where it would be.", example: "/opt/radio/podcasts/station_art/generic_cover.png" },
      { key: "cta", label: "Call to action", type: "line", maxLength: 40, example: "Listen in the EJazz app" },
    ],
    titleFrom: "headline",
    source: {
      kind: "podcast",
      available: true,
      note: "Episodes are discovered from the filesystem every run and their metadata comes from each MP3's ID3 tags; shows.cover_for() answers the artwork, so a card never has to guess a path.",
    },
  },
  {
    id: "custom-promo",
    name: "Custom Promo",
    family: "announcement",
    bucket: "engagement",
    fields: [
      { key: "kicker", label: "Label", type: "line", maxLength: 24, example: "ANNOUNCEMENT" },
      { key: "headline", label: "Headline", type: "line", required: true, maxLength: 90, example: "EJazz Xtra is live from Lugogo this Saturday" },
      { key: "body", label: "The message", type: "paragraph", maxLength: 220, example: "Doors at 6. We are broadcasting the whole thing, so bring the noise." },
      { key: "cta", label: "Call to action", type: "line", maxLength: 40, example: "Read in the app" },
    ],
    titleFrom: "headline",
    bodyFrom: "body",
    source: {
      kind: "manual",
      available: true,
      note: "Whatever the station wants to say. Nothing suggests it, and nothing needs to.",
    },
  },
];

const BY_ID = new Map(CARD_TEMPLATES.map((t) => [t.id, t]));

export function cardTemplate(id: unknown): CardTemplate | null {
  return typeof id === "string" ? BY_ID.get(id) || null : null;
}

export function cardTemplateIds(): string[] {
  return CARD_TEMPLATES.map((t) => t.id);
}

/** The three shapes this card can be made in. Every card offers all three. */
export function cardFormats(template: CardTemplate): CardFormat[] {
  return CARD_FAMILIES[template.family];
}

/** One of them. An unknown ratio is the default rather than an error: a share asking for a
 *  shape nobody offers should still get a picture. */
export function cardFormat(template: CardTemplate, ratio: CardRatio = DEFAULT_CARD_RATIO): CardFormat {
  const formats = cardFormats(template);
  return formats.find((f) => f.ratio === ratio) || formats[0];
}

/**
 * The catalogue as the Studio needs it: every field, what fills it, and the three shapes to
 * choose between. `examplePath` is a render of the field examples, so the Studio can show a
 * real picture of a template -- in whichever shape is being chosen -- before an operator has
 * typed anything.
 */
export function cardCatalogue(ratio: CardRatio = DEFAULT_CARD_RATIO) {
  return CARD_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    family: t.family,
    bucket: t.bucket,
    ratios: cardFormats(t).map((f) => f.ratio),
    fields: t.fields,
    source: t.source,
    examplePath: cardRenderPath(t, Object.fromEntries(t.fields.map((f) => [f.key, f.example])), ratio),
  }));
}

export interface NormalisedCardFields {
  fields: Record<string, string>;
  problems: string[];
}

/**
 * Check and tidy what an operator typed.
 *
 * Unknown keys are REPORTED, not dropped. Two things on this box drop unknown keys silently
 * (shows.update_show and normalizeAppConfig) and both have cost a session to a change that
 * appeared to save and did nothing, so a card does not join them.
 */
export function normaliseCardFields(template: CardTemplate, input: unknown): NormalisedCardFields {
  const raw = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const known = new Set(template.fields.map((f) => f.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) problems.push(key + " is not a field of the " + template.name + " card.");
  }
  const fields: Record<string, string> = {};
  for (const field of template.fields) {
    const value = raw[field.key];
    let text = value === null || value === undefined ? "" : String(value);
    // A line is one line whatever was pasted into it: the renderer wraps text itself, and a
    // newline inside a headline draws as a gap nobody asked for.
    text = field.type === "line" || field.type === "asset" ? text.replace(/\s+/g, " ").trim() : text.trim();
    if (!text) {
      if (field.required) problems.push(field.label + " is needed for a " + template.name + " card.");
      continue;
    }
    if (text.length > field.maxLength) {
      problems.push(field.label + " is " + text.length + " characters; this card holds " + field.maxLength + ".");
      continue;
    }
    if (field.type === "asset" && (!text.startsWith("/") || text.includes(".."))) {
      problems.push(field.label + " must be an absolute path to a file on this box.");
      continue;
    }
    fields[field.key] = text;
  }
  return { fields, problems };
}

/**
 * What the renderer is handed: the template's pinned values, then the operator's. Built in
 * declaration order both times, so the same card always produces the same query string --
 * which is what makes the render cache hit and the stored image_url stable.
 */
export function cardRenderData(template: CardTemplate, fields: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(template.fixed || {})) data[key] = value;
  for (const field of template.fields) {
    const value = fields[field.key];
    if (typeof value === "string" && value) data[field.key] = value;
  }
  return data;
}

/**
 * The OPERATOR's render path: the design, the size and the card's words in the query string.
 *
 * This is for the Control Room only -- the Studio's preview pane, which renders a card that
 * has not been saved yet and so has no row to read it back from. It is deliberately NOT what
 * goes on the row: see `cardImagePath`.
 */
export function cardRenderPath(template: CardTemplate, fields: Record<string, string>, ratio: CardRatio = DEFAULT_CARD_RATIO): string {
  const format = cardFormat(template, ratio);
  const data = encodeURIComponent(JSON.stringify(cardRenderData(template, fields)));
  return "/api/designer/render/" + encodeURIComponent(format.design)
    + "?size=" + encodeURIComponent(format.size) + "&data=" + data;
}

/**
 * The signature in a card's own image path. Short, and it covers the card id, the template
 * and every word on the card -- so a token cannot be moved to another row, and editing a card
 * changes its image path rather than serving the old picture from a cache somewhere.
 *
 * The ratio is NOT signed: one token gives all three cuts of the same card, which is what
 * makes "someone should be able to choose" work from a single stored URL.
 */
export function cardImageToken(cardId: number, template: CardTemplate, fields: Record<string, string>): string {
  const payload = JSON.stringify([cardId, template.id, cardRenderData(template, fields)]);
  return crypto.createHmac("sha256", cardSecret()).update(payload).digest("base64url").slice(0, 16);
}

/**
 * The APP's image path, and the reason there are two of these functions.
 *
 * A render URL carries the card's data in its query string: the design it used, every word on
 * it, and a parameter a stranger can edit. Handing that to the app would publish three things
 * nobody asked to publish -- how our cards are made, and a URL that renders ANY text on EJazz
 * branding by changing `data=`, and (for a draft) a card before it was approved. So the row
 * stores this instead: the card's id, a signature, and the ratio. Nothing readable, nothing a
 * caller can steer. The route resolves it back to the row and renders from the ROW, so what
 * comes out is the card the operator approved and nothing else.
 *
 * It sits under /api/designer/ because that prefix is already forwarded to this service by
 * ejazz-proxy and is already public -- a card needs no nginx change and no Codemagic build.
 *
 * It is not SECRET: an image the app shows has to be fetchable with no credentials, because
 * the app sends none (there are no accounts and no tokens). Unguessable and untamperable is
 * the honest ceiling, and that is what this is.
 */
export function cardImagePath(cardId: number, token: string, ratio: CardRatio = DEFAULT_CARD_RATIO): string {
  return "/api/designer/card/" + cardId + "-" + token + "-" + RATIO_SLUGS[ratio] + ".jpg";
}

/** Everything the route needs back out of one of those paths, or null if it is not one. */
export function parseCardImagePath(file: string): { cardId: number; token: string; ratio: CardRatio } | null {
  const m = /^(\d{1,12})-([A-Za-z0-9_-]{16})-(1x1|16x9|9x16)\.jpe?g$/.exec(file);
  if (!m) return null;
  const ratio = SLUG_RATIOS.get(m[3]);
  if (!ratio) return null;
  return { cardId: Number(m[1]), token: m[2], ratio };
}

/** The absolute URL stored on the row as image_url. */
export function cardImageUrl(cardId: number, template: CardTemplate, fields: Record<string, string>, ratio: CardRatio = DEFAULT_CARD_RATIO): string {
  return publicOrigin() + cardImagePath(cardId, cardImageToken(cardId, template, fields), ratio);
}

/**
 * Which ratio a stored image_url was made in.
 *
 * The chosen format lives in the URL and nowhere else -- no column for it, so the row and the
 * picture cannot disagree about what shape the card is, and the Studio reads the operator's
 * choice back out of what was actually published.
 */
export function cardRatioFromUrl(url: unknown): CardRatio | null {
  if (typeof url !== "string") return null;
  const file = url.split("?")[0].split("/").pop() || "";
  return parseCardImagePath(file)?.ratio || null;
}

/**
 * The `content_items` columns a card implies, except image_url -- which needs the row's id and
 * so is written by the route in a second step, right after the insert.
 *
 * The route adds the operator's own choices (placement, schedule, push) and never the other
 * way round: title and body are the card's, so the row and the picture cannot drift apart.
 */
export function cardRow(template: CardTemplate, fields: Record<string, string>) {
  const title = fields[template.titleFrom] || template.name;
  const body = template.bodyFrom ? fields[template.bodyFrom] || null : null;
  return {
    type: "card" as const,
    title,
    body,
    templateId: template.id,
    templateFields: fields,
  };
}
