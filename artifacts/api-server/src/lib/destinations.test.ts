/**
 * Tests for the destination grammar: what a stored destination may be, and whether the
 * link form survives a round trip.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/destinations.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/destinations.test.mjs && node /tmp/destinations.test.mjs
 *
 * Touches no database and no network. The episode cases use the two guid shapes actually in
 * the EJazz config: an anchor.fm uuid, and EJazz's own "<show>/<file>.mp3".
 */
import { cleanDestination, describeDestination, destinationFromPath, destinationPath, episodeRef } from "./destinations";

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
}

const ANCHOR_GUID = "7282c818-54c1-4839-8c2e-aaf1c5309091";
const EJAZZ_GUID = "echoes_of_fame/echoes_of_fame_2026-11-22.mp3";

// --- the plain destinations, stored as they are written ---
for (const kind of ["home", "news", "radio", "radio:xtra", "play", "play:xtra", "requests",
  "requests:xtra", "chart", "chart:xtra", "podcasts", "tips", "details", "link"]) {
  check(`plain ${kind}`, cleanDestination(kind), kind);
}
check("case and padding are not the operator's problem", cleanDestination("  Radio:XTRA "), "radio:xtra");
check("nothing is the old behaviour, not an error", cleanDestination(""), "");
check("unrecognised is refused, never guessed", cleanDestination("profile"), "");
check("a plain kind that needs an argument is refused", cleanDestination("article"), "");
check("an argument on a kind that takes none is refused", cleanDestination("home:1"), "");

// --- ids ---
check("article id", cleanDestination("article:1234"), "article:1234");
check("category id", cleanDestination("category:7"), "category:7");
check("podcast slug", cleanDestination("podcast:echoes-of-fame"), "podcast:echoes-of-fame");
check("an id may not carry a path", cleanDestination("article:12/34"), "");
check("an empty id is not an id", cleanDestination("article:"), "");

// --- episodes: the guid is cleaned, not refused ---
check("an anchor.fm guid is already safe", cleanDestination(`episode:the-xtreme-bpm:${ANCHOR_GUID}`),
  `episode:the-xtreme-bpm:${ANCHOR_GUID}`);
check("EJazz's own guid is cleaned rather than refused", cleanDestination(`episode:echoes-of-fame:${EJAZZ_GUID}`),
  "episode:echoes-of-fame:echoes-of-fame-echoes-of-fame-2026-11-22-mp3");
check("a show pretending to be an episode is refused", cleanDestination("episode:echoes-of-fame"), "");
check("an episode with no guid is refused", cleanDestination("episode:echoes-of-fame:"), "");
check("an episode with no show is refused", cleanDestination(`episode::${ANCHOR_GUID}`), "");
check("a guid of pure punctuation is refused", cleanDestination("episode:echoes-of-fame:///"), "");

// --- idempotency: cleaning a stored value again must not change it ---
for (const dest of ["home", "radio:xtra", "article:1234", "podcast:echoes-of-fame",
  `episode:the-xtreme-bpm:${ANCHOR_GUID}`, `episode:echoes-of-fame:${EJAZZ_GUID}`]) {
  const once = cleanDestination(dest);
  check(`idempotent ${dest}`, cleanDestination(once), once);
}

// --- episodeRef on its own ---
check("episodeRef leaves a uuid alone", episodeRef(ANCHOR_GUID), ANCHOR_GUID);
check("episodeRef flattens a path", episodeRef(EJAZZ_GUID), "echoes-of-fame-echoes-of-fame-2026-11-22-mp3");
check("episodeRef has nothing to say about nothing", episodeRef(""), "");
check("episodeRef refuses pure punctuation", episodeRef("—/—"), "");
check("episodeRef never ends on a dash", episodeRef(`${"a".repeat(99)}/bb`), "a".repeat(99));
check("episodeRef caps the length", episodeRef("b".repeat(140)).length, 100);

// --- the link form, both ways ---
check("path form", destinationPath("article:1234"), "article/1234");
check("path form of an episode", destinationPath(`episode:echoes-of-fame:${EJAZZ_GUID}`),
  "episode/echoes-of-fame/echoes-of-fame-echoes-of-fame-2026-11-22-mp3");
check("details has no link form", destinationPath("details"), "");
check("link has no link form", destinationPath("link"), "");
for (const dest of ["home", "radio:xtra", "article:1234", `episode:the-xtreme-bpm:${ANCHOR_GUID}`,
  `episode:echoes-of-fame:${EJAZZ_GUID}`]) {
  const clean = cleanDestination(dest);
  check(`round trip ${dest}`, destinationFromPath(destinationPath(clean)), clean);
}
check("an unknown path is not a destination", destinationFromPath("profile/4"), "");
check("an empty path is not a destination", destinationFromPath(""), "");

// --- what an operator reads in a sent list ---
check("describe a plain one", describeDestination("play:xtra"), "Radio - EJazz Xtra, playing");
check("describe nothing", describeDestination(""), "The full message");
check("describe an article", describeDestination("article:1234"), "One article, opened (1234)");
check("describe an episode", describeDestination(`episode:echoes-of-fame:${ANCHOR_GUID}`),
  `One podcast episode (echoes-of-fame:${ANCHOR_GUID})`);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
