/**
 * Tests for the takeover: what the Control Room may save, and what a phone is told.
 *
 * The takeover is the loudest thing the app can draw, and three separate conditions have to
 * agree before it appears (switch, words, window). None of them is visible to an operator
 * until a listener either sees it or doesn't, so they are pinned here.
 *
 * There is no test runner in this repo, so it is bundled and run directly. Two wrinkles,
 * both because appConfig.ts reaches @workspace/db for the row it normally reads: the bundle
 * needs a `require` shim, and the import throws without a DATABASE_URL. The one below points
 * at a closed port on purpose -- the functions under test are pure, nothing ever connects,
 * and a real URL in a test file is how a test ends up writing to production.
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/appConfigTakeover.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/appConfigTakeover.test.mjs \
 *     --banner:js="import{createRequire}from'node:module';const require=createRequire(import.meta.url);"
 *   DATABASE_URL="postgres://test:test@127.0.0.1:1/appconfig_test" node /tmp/appConfigTakeover.test.mjs
 */
import { normalizeAppConfig, toPublicConfig, DEFAULT_APP_CONFIG } from "./appConfig";

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
}

const NOW = Date.parse("2026-11-22T18:00:00+03:00");
/** A takeover as the Control Room would save it, with whatever this case overrides. */
const saved = (over: Record<string, unknown>) =>
  normalizeAppConfig({ takeover: { enabled: true, title: "The chart is in", ...over } });
const shown = (over: Record<string, unknown>) => toPublicConfig(saved(over), NOW).takeover.enabled;

// --- the switch, the words, the window: all three have to agree ---
check("on, with something to say", shown({}), true);
check("off stays off", shown({ enabled: false }), false);
check("a message alone is enough", shown({ title: "", message: "Tune in at six" }), true);
check("nothing to say is off whatever the switch says", shown({ title: "", message: "" }), false);
check("before its window", shown({ startAt: "2026-11-23T00:00:00+03:00" }), false);
check("after its window", shown({ endAt: "2026-11-22T17:00:00+03:00" }), false);
check("inside its window", shown({
  startAt: "2026-11-22T06:00:00+03:00", endAt: "2026-11-22T23:00:00+03:00",
}), true);
check("an open-ended window is open", shown({ startAt: "2026-11-01T06:00:00+03:00" }), true);
check("the default config has no takeover", toPublicConfig(DEFAULT_APP_CONFIG, NOW).takeover.enabled, false);

// --- the app still gets the words and the window, because its own clock re-checks them ---
const live = toPublicConfig(saved({ startAt: "2026-11-22T06:00:00+03:00", endAt: "2026-11-22T23:00:00+03:00" }), NOW).takeover;
check("the window reaches the phone", [live.startAt, live.endAt],
  ["2026-11-22T03:00:00.000Z", "2026-11-22T20:00:00.000Z"]);

// --- the destination is validated at save time, never at tap time ---
check("a good destination is kept", saved({ dest: "chart:xtra" }).takeover.dest, "chart:xtra");
check("an episode guid is cleaned", saved({ dest: "episode:echoes-of-fame:echoes_of_fame/echoes_of_fame_2026-11-22.mp3" }).takeover.dest,
  "episode:echoes-of-fame:echoes-of-fame-echoes-of-fame-2026-11-22-mp3");
check("an unknown destination becomes nothing, so the takeover still reads", saved({ dest: "profile" }).takeover.dest, "");
check("a junk link is dropped", saved({ linkUrl: "javascript:alert(1)" }).takeover.linkUrl, "");
check("a real link is kept", saved({ linkUrl: "https://ejazzug.com/chart" }).takeover.linkUrl, "https://ejazzug.com/chart");

// --- the fields are bounded, because they are drawn on a phone ---
check("the title is capped", saved({ title: "t".repeat(200) }).takeover.title.length, 90);
check("the message is capped", saved({ message: "m".repeat(500) }).takeover.message.length, 300);
check("the kicker is capped", saved({ kicker: "k".repeat(60) }).takeover.kicker.length, 24);
check("the button label is capped", saved({ buttonLabel: "b".repeat(60) }).takeover.buttonLabel.length, 28);
check("dismissible defaults to true", saved({}).takeover.dismissible, true);
check("showUntilTapped defaults to true", saved({}).takeover.showUntilTapped, true);
check("a nonsense takeover is the default takeover", normalizeAppConfig({ takeover: "yes" }).takeover, DEFAULT_APP_CONFIG.takeover);

// --- the operator-only sections never reach a phone ---
const publicKeys = Object.keys(toPublicConfig(DEFAULT_APP_CONFIG, NOW));
check("no operator sections in the public config",
  ["funFacts", "songFacts", "charts"].filter((key) => publicKeys.includes(key)), []);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
