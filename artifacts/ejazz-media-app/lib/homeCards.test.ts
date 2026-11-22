/**
 * Tests for WHICH cards Home shows (lib/homeCards.ts).
 *
 * Same recipe as hubItems.test.ts, and for the same reason: `node:test` would need node types
 * the app's tsconfig does not carry, and adding them to typecheck a test file would weaken the
 * check that a build depends on. esbuild is not a dependency of the app, so the api-server's
 * copy runs it:
 *
 *   cd /opt/ejazz-media/artifacts/ejazz-media-app
 *   ../api-server/node_modules/.bin/esbuild lib/homeCards.test.ts \
 *     --bundle --platform=node --format=esm --outfile=/tmp/homeCards.test.mjs \
 *     && node /tmp/homeCards.test.mjs
 *
 * No stubs are needed: homeCards.ts imports one TYPE and nothing else, which is what makes
 * the rule testable at all.
 */
import { DEFAULT_HOME_CARD_LIMITS, cardCategory, selectHomeCards } from './homeCards';

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
}

type Any = Parameters<typeof selectHomeCards>[0][number];

let nextId = 1;
function card(over: Partial<Any> = {}): Any {
  const id = over.id ?? nextId++;
  return {
    id,
    type: 'card',
    title: `Card ${id}`,
    body: null,
    imageUrl: `https://control.ejazzug.com/cards/${id}.jpg`,
    relatedArtist: null,
    relatedSong: null,
    relatedShow: null,
    relatedStation: null,
    placement: 'home',
    dest: '',
    pushEnabled: false,
    pushTopic: 'all',
    status: 'live',
    pollOptions: null,
    quizCorrectIndex: null,
    templateId: 'song-fact',
    shareCaption: null,
    startAt: null,
    endAt: null,
    createdBy: null,
    createdAt: new Date(2026, 10, 23, 9, 0, 0).toISOString(),
    updatedAt: new Date(2026, 10, 23, 9, 0, 0).toISOString(),
    ...over,
  } as Any;
}

check('three song facts from one station show only the newest',
  selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T06:00:00.000Z' }),
    card({ id: 2, relatedStation: 'radio', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
  ]).map((c) => c.id), [3]);

check('one song fact per station, then a card of another kind',
  selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:30:00.000Z' }),
    card({ id: 3, relatedStation: 'radio', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 4, templateId: 'chart-move', createdAt: '2026-11-23T06:00:00.000Z' }),
  ]).map((c) => c.id), [1, 2, 4]);

check('the station is named on the card it belongs to',
  selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, templateId: 'premiere', createdAt: '2026-11-23T06:00:00.000Z' }),
  ]).map((c) => c.stationLabel), ['EJazz Radio', 'EJazz Xtra', '']);

check('a third station cannot put a third song fact up',
  selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, relatedStation: 'tv', createdAt: '2026-11-23T06:30:00.000Z' }),
    card({ id: 4, templateId: 'premiere', createdAt: '2026-11-23T06:00:00.000Z' }),
  ]).map((c) => c.id), [1, 2, 4]);

check('never more than the maximum, newest first',
  selectHomeCards([
    card({ id: 1, templateId: 'a', createdAt: '2026-11-23T01:00:00.000Z' }),
    card({ id: 2, templateId: 'b', createdAt: '2026-11-23T02:00:00.000Z' }),
    card({ id: 3, templateId: 'c', createdAt: '2026-11-23T03:00:00.000Z' }),
    card({ id: 4, templateId: 'd', createdAt: '2026-11-23T04:00:00.000Z' }),
  ]).map((c) => c.id), [4, 3, 2]);

check('startAt is what the operator meant by newest',
  selectHomeCards([
    card({ id: 1, templateId: 'a', createdAt: '2026-11-23T01:00:00.000Z', startAt: '2026-11-23T20:00:00.000Z' }),
    card({ id: 2, templateId: 'b', createdAt: '2026-11-23T02:00:00.000Z' }),
  ]).map((c) => c.id), [1, 2]);

check('a card whose picture never rendered is skipped, not drawn empty',
  selectHomeCards([
    card({ id: 1, templateId: 'a', imageUrl: '' }),
    card({ id: 2, templateId: 'b', imageUrl: '   ' }),
    card({ id: 3, templateId: 'c' }),
  ]).map((c) => c.id), [3]);

check('only cards -- a fact, a tip or an announcement is not one',
  selectHomeCards([
    card({ id: 1, type: 'fact', templateId: null }),
    card({ id: 2, type: 'tip', templateId: null }),
    card({ id: 3, type: 'announcement', templateId: null }),
  ]), []);

check('the caption is the operator\'s, falling back to the title',
  selectHomeCards([
    card({ id: 1, templateId: 'a', title: 'Row label', shareCaption: 'Clock this', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, templateId: 'b', title: 'Second card', shareCaption: '   ', createdAt: '2026-11-23T07:00:00.000Z' }),
  ]).map((c) => c.caption), ['Clock this', 'Second card']);

const threeKinds = [
  card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
  card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:00:00.000Z' }),
  card({ id: 3, templateId: 'chart-move', createdAt: '2026-11-23T06:00:00.000Z' }),
];
check('the operator can narrow the rail', selectHomeCards(threeKinds, { max: 1, perCategory: 2 }).length, 1);
check('one per kind drops the second song fact', selectHomeCards(threeKinds, { max: 3, perCategory: 1 }).length, 2);
check('a maximum of none shows none', selectHomeCards(threeKinds, { max: 0, perCategory: 2 }).length, 0);

check('a card with no template still has a category of its own',
  [cardCategory({ id: 7, type: 'card', templateId: null }),
   cardCategory({ id: 7, type: 'card', templateId: ' song-fact ' }),
   cardCategory({ id: 7, type: '' as never, templateId: '' })],
  ['card', 'song-fact', 'item-7']);

check('the defaults are the three the owner asked for', DEFAULT_HOME_CARD_LIMITS, { max: 3, perCategory: 2 });

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
