/**
 * Tests for the notifications hub's merge rules and the tip drip.
 *
 * This is the app's FIRST node-runnable test, so it carries the recipe. The modules under
 * test are pure, but they sit in a tree that imports react-native and AsyncStorage, which
 * cannot be loaded in node -- so those three packages are aliased to the stubs in
 * tools/test-stubs/. Nothing under test calls them.
 *
 * esbuild is not a dependency of the app, so the api-server's copy runs it:
 *
 *   cd /opt/ejazz-media/artifacts/ejazz-media-app
 *   ../api-server/node_modules/.bin/esbuild lib/hubItems.test.ts \
 *     --bundle --platform=node --format=esm \
 *     --alias:react-native=./tools/test-stubs/react-native.js \
 *     --alias:@react-native-async-storage/async-storage=./tools/test-stubs/async-storage.js \
 *     --alias:@tanstack/react-query=./tools/test-stubs/react-query.js \
 *     --outfile=/tmp/hubItems.test.mjs && node /tmp/hubItems.test.mjs
 */
import { buildHubItems, filterHubItems, type HubNotification } from './hubItems';
import { releasedTipCount, releasedTipIds } from './tipDrip';
import type { PulseContentItem, PulseContentType } from './pulse';

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
}

const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-22T09:00:00+03:00');

function card(over: Partial<PulseContentItem> & { id: number }): PulseContentItem {
  return {
    id: over.id,
    type: (over.type ?? 'card') as PulseContentType,
    title: over.title ?? `Card ${over.id}`,
    body: over.body ?? null,
    imageUrl: over.imageUrl ?? 'https://control.ejazzug.com/api/designer/card/1-1x1.jpg',
    dest: over.dest ?? '',
    relatedArtist: null, relatedSong: null, relatedShow: null, relatedStation: null,
    placement: 'home', pushEnabled: false, pushTopic: 'all', status: 'live',
    pollOptions: null, quizCorrectIndex: null,
    startAt: over.startAt ?? null,
    endAt: null, createdBy: null,
    createdAt: over.createdAt ?? new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
  } as PulseContentItem;
}
const push = (over: Partial<HubNotification> & { id: string }): HubNotification => ({
  id: over.id, title: over.title ?? `Push ${over.id}`, body: over.body ?? '',
  receivedAt: over.receivedAt ?? T0, imageUrl: over.imageUrl, linkUrl: over.linkUrl,
  openMode: over.openMode,
});
const build = (over: Partial<Parameters<typeof buildHubItems>[0]> = {}) => buildHubItems({
  notifications: [], content: [], dismissed: new Set(), releasedTipIds: new Set(), ...over,
});

// --- which content items belong in the hub ---
check("a card is in", build({ content: [card({ id: 1 })] }).map((i) => i.key), ["c:1"]);
check("a fact is not: it is Home's Clock it",
  build({ content: [card({ id: 2, type: 'fact' })] }).length, 0);
for (const type of ['poll', 'quiz', 'announcement', 'song_battle', 'push_alert', 'show_alert'] as const) {
  check(`a ${type} is not: it arrives as a push`, build({ content: [card({ id: 3, type })] }).length, 0);
}
check("an unreleased tip is not shown at all",
  build({ content: [card({ id: 4, type: 'tip' })] }).length, 0);
check("a released tip is",
  build({ content: [card({ id: 4, type: 'tip' })], releasedTipIds: new Set([4]) }).map((i) => i.kind), ["tip"]);

// --- a card and its own push are one thing ---
const dedupe = build({
  content: [card({ id: 5, title: 'The chart is in' })],
  notifications: [push({ id: '9', title: 'The chart is in' }), push({ id: '10', title: 'Something else' })],
});
check("the card wins over its own push", dedupe.map((i) => i.key).sort(), ["c:5", "n:10"]);
check("matching ignores case and padding", build({
  content: [card({ id: 6, title: 'The Chart Is In' })],
  notifications: [push({ id: '11', title: '  the chart is in ' })],
}).map((i) => i.key), ["c:6"]);
check("an untitled push is not deduped away by an untitled card", build({
  content: [card({ id: 7, title: '' })],
  notifications: [push({ id: '12', title: '' })],
}).length, 2);

// --- ordering and arrival time ---
const ordered = build({
  content: [
    card({ id: 20, createdAt: new Date(T0 - 5 * HOUR).toISOString() }),
    // Scheduled for later than it was written: the schedule is when it was sent.
    card({ id: 21, createdAt: new Date(T0 - 9 * HOUR).toISOString(), startAt: new Date(T0 - HOUR).toISOString() }),
  ],
  notifications: [push({ id: '30', receivedAt: T0 - 3 * HOUR })],
});
check("newest first, startAt beating createdAt", ordered.map((i) => i.key), ["c:21", "n:30", "c:20"]);

// --- dismissals are namespaced ---
check("a dismissed card goes", build({ content: [card({ id: 8 })], dismissed: new Set(['c:8']) }).length, 0);
check("notification 8 and card 8 are different things",
  build({ content: [card({ id: 8 })], notifications: [push({ id: '8' })], dismissed: new Set(['n:8']) })
    .map((i) => i.key), ["c:8"]);
check("a dismissal written before the hub merged cards still counts",
  build({ notifications: [push({ id: '8' })], dismissed: new Set(['8', 'n:8']) }).length, 0);

// --- what a row carries ---
const row = build({ content: [card({ id: 40, body: 'A line about it', dest: 'chart:xtra' })] })[0];
check("a card is a picture", row.isPicture, true);
check("a card carries its destination", row.dest, "chart:xtra");
check("a card gets a kicker", row.kicker, "FOR YOU");
const tipRow = build({ content: [card({ id: 41, type: 'tip' })], releasedTipIds: new Set([41]) })[0];
check("a tip is not a picture, whatever image it has", tipRow.isPicture, false);
check("a tip's kicker", tipRow.kicker, "EJAZZ TIP");
const pushRow = build({ notifications: [push({ id: '50', linkUrl: 'https://ejazzug.com', openMode: 'link' })] })[0];
check("a push keeps its link and mode", [pushRow.linkUrl, pushRow.openMode, pushRow.kicker],
  ["https://ejazzug.com", "link", ""]);

// --- the filter chips ---
const mixed = build({
  content: [card({ id: 60 }), card({ id: 61, type: 'tip' })],
  notifications: [push({ id: '70' })],
  releasedTipIds: new Set([61]),
});
check("all", filterHubItems(mixed, 'all').length, 3);
check("cards only", filterHubItems(mixed, 'cards').map((i) => i.key), ["c:60"]);
check("tips only", filterHubItems(mixed, 'tips').map((i) => i.key), ["c:61"]);

// --- the drip: one tip now, then one a day ---
check("nothing to release", releasedTipCount(T0, T0, 0), 0);
check("the first tip is immediate", releasedTipCount(T0, T0, 5), 1);
check("still one, 23 hours in", releasedTipCount(T0, T0 + 23 * HOUR, 5), 1);
check("two at a day", releasedTipCount(T0, T0 + 24 * HOUR, 5), 2);
check("five at four days", releasedTipCount(T0, T0 + 96 * HOUR, 5), 5);
check("never more than there are", releasedTipCount(T0, T0 + 900 * HOUR, 5), 5);
check("a clock that went backwards never revokes a tip", releasedTipCount(T0, T0 - 50 * HOUR, 5), 1);
check("an unknown start releases everything rather than nothing", releasedTipCount(NaN, T0, 5), 5);
check("the series runs oldest first", [...releasedTipIds(
  [{ id: 3, at: T0 }, { id: 1, at: T0 - 48 * HOUR }, { id: 2, at: T0 - 24 * HOUR }],
  T0, T0 + 24 * HOUR,
)], [1, 2]);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
