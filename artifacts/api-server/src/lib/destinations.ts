/**
 * WHERE A TAP GOES.
 *
 * One grammar, used by three things that all need to say "open this exact spot in the app"
 * (owner, 2026-11-22):
 *
 *   - a push notification: "if someone taps them they go to a section or feature I choose";
 *   - a shared link: it opens the item for anyone who has the app, and the Play Store for
 *     anyone who does not;
 *   - an app card or a tip, which carries the same field.
 *
 * A destination is a short string, because it has to survive three hops that all hate
 * structure: FCM data (string values only, ~4 KB for everything), a URL path, and a database
 * column read by two services in two languages. `article:123` does that; a JSON blob does not.
 *
 * The grammar, deliberately small -- every entry here is a place that already exists in the
 * app, because a destination the app cannot open is a broken promise in somebody's tray:
 *
 *   home                     the Home tab
 *   news                     the News tab
 *   article:<id>             one story, opened
 *   category:<id>            the News tab filtered to that category
 *   radio                    the Radio tab (EJazz Radio)
 *   radio:xtra               the Radio tab, showing EJazz Xtra
 *   play / play:xtra         the Radio tab AND start that station playing
 *   requests / requests:xtra the Radio tab with the request panel open
 *   chart / chart:xtra       the Radio tab, scrolled to that station's chart
 *   podcasts                 the podcasts section
 *   podcast:<slug>           one show
 *   episode:<slug>:<ref>     one episode, opened (<ref> is episodeRef() of its feed guid)
 *   tips                     the tips the listener has been sent
 *   details                  the notification's own message (the old default)
 *   link                     whatever linkUrl holds (the old "go straight to the link")
 *
 * Anything unrecognised is treated as `details`, never guessed at: a tap that lands somewhere
 * unexpected is worse than a tap that opens the message it came from.
 */

/** One choice an operator can make, for building a picker without hard-coding it twice. */
export type DestinationOption = {
  /** The prefix, as stored. */
  kind: string;
  /** What the Control Room shows. */
  label: string;
  /** What the operator must supply after the prefix, if anything. */
  needs?: "article" | "category" | "podcast" | "episode" | "url";
  /** A longer line for the form. */
  hint?: string;
};

export const DESTINATIONS: DestinationOption[] = [
  { kind: "details", label: "Open the full message in the app" },
  { kind: "link", label: "Go straight to the link", needs: "url", hint: "Uses the Link field above." },
  { kind: "home", label: "Home" },
  { kind: "news", label: "News" },
  { kind: "article", label: "One article, opened", needs: "article", hint: "The article's id." },
  { kind: "category", label: "A news category", needs: "category", hint: "The category's id." },
  { kind: "radio", label: "Radio - EJazz Radio" },
  { kind: "radio:xtra", label: "Radio - EJazz Xtra" },
  { kind: "play", label: "Radio - EJazz Radio, playing", hint: "Opens the player and presses play." },
  { kind: "play:xtra", label: "Radio - EJazz Xtra, playing" },
  { kind: "requests", label: "Song requests - EJazz Radio" },
  { kind: "requests:xtra", label: "Song requests - EJazz Xtra" },
  { kind: "chart", label: "The chart - EJazz Radio" },
  { kind: "chart:xtra", label: "The chart - EJazz Xtra" },
  { kind: "podcasts", label: "Podcasts" },
  { kind: "podcast", label: "One podcast show", needs: "podcast", hint: "The show's slug." },
  {
    kind: "episode",
    label: "One podcast episode",
    needs: "episode",
    // Paste the guid as the feed writes it: EJazz's own feeds use
    // "echoes_of_fame/echoes_of_fame_2026-11-22.mp3", which is cleaned to a safe reference
    // rather than refused. See episodeRef.
    hint: "show-slug:episode guid",
  },
  { kind: "tips", label: "Tips" },
];

const WITH_ARGUMENT = new Set(["article", "category", "podcast", "episode"]);
const PLAIN = new Set(
  DESTINATIONS.map((d) => d.kind).filter((k) => !WITH_ARGUMENT.has(k.split(":")[0])),
);

/** The id part of a destination may only be these characters -- it ends up in a URL path. */
const ARGUMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

/**
 * AN EPISODE REFERENCE: a feed guid, made safe to carry.
 *
 * The id in `episode:<slug>:<ref>` has to survive a URL path and a colon-separated string,
 * and a podcast guid respects neither. The two kinds in use here prove it:
 *
 *   anchor.fm        7282c818-54c1-4839-8c2e-aaf1c5309091      already safe
 *   EJazz's own      echoes_of_fame/echoes_of_fame_2026-11-22.mp3   has a slash
 *
 * So anything that is not a letter or a digit becomes "-". A guid that was already safe comes
 * out unchanged, which is what keeps this idempotent: cleaning a stored destination a second
 * time returns the same string, and an operator may paste either form.
 *
 * The app derives the same reference from each episode's own guid and compares the two
 * (lib/destination.ts). Nothing anywhere has to store it.
 */
export function episodeRef(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

/**
 * Clean a destination, or "" when it is not one. "" means "behave exactly as before", which
 * is why it is the empty answer rather than an error: an operator who leaves the picker alone
 * must get the old behaviour, not a refusal.
 */
export function cleanDestination(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "";
  if (PLAIN.has(value)) return value;
  const cut = value.indexOf(":");
  if (cut <= 0) return "";
  const kind = value.slice(0, cut);
  const rest = value.slice(cut + 1);
  if (!WITH_ARGUMENT.has(kind)) return "";
  // An episode is two parts, and both have to be there: "episode:the-tea" would open a show
  // and claim to be an episode. The guid half is cleaned rather than tested, because a real
  // guid frequently fails ARGUMENT -- see episodeRef.
  if (kind === "episode") {
    const split = rest.indexOf(":");
    if (split <= 0) return "";
    const show = episodeRef(rest.slice(0, split));
    const ref = episodeRef(rest.slice(split + 1));
    if (!show || !ref) return "";
    return `episode:${show}:${ref}`;
  }
  if (!ARGUMENT.test(rest)) return "";
  return `${kind}:${rest}`;
}

/**
 * The path form, for a shareable link: `https://<site>/app/<path>`.
 * The app claims these; everyone else is redirected to the Play Store by the web side.
 */
export function destinationPath(dest: string): string {
  const clean = cleanDestination(dest);
  if (!clean || clean === "details" || clean === "link") return "";
  return clean.split(":").join("/");
}

/** The reverse, for the app and for the web redirect: `article/123` -> `article:123`. */
export function destinationFromPath(path: string): string {
  const parts = String(path || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return cleanDestination(parts.join(":"));
}

/** A line of plain English for a sent-items list, so an operator can see where a tap went. */
export function describeDestination(dest: string): string {
  const clean = cleanDestination(dest);
  if (!clean) return "The full message";
  const exact = DESTINATIONS.find((d) => d.kind === clean);
  if (exact) return exact.label;
  const kind = clean.slice(0, clean.indexOf(":"));
  const rest = clean.slice(clean.indexOf(":") + 1);
  const option = DESTINATIONS.find((d) => d.kind === kind);
  return option ? `${option.label} (${rest})` : "The full message";
}
