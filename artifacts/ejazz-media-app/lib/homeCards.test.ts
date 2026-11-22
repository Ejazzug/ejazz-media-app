import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_HOME_CARD_LIMITS, cardCategory, selectHomeCards } from './homeCards.ts';

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

test('three song facts from one station show only the newest one', () => {
  const picked = selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T06:00:00.000Z' }),
    card({ id: 2, relatedStation: 'radio', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [3]);
});

test('one song fact per station, then a card of another category', () => {
  const picked = selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:30:00.000Z' }),
    card({ id: 3, relatedStation: 'radio', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 4, templateId: 'chart-move', createdAt: '2026-11-23T06:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [1, 2, 4]);
  assert.deepEqual(picked.map((c) => c.stationLabel), ['EJazz Radio', 'EJazz Xtra', '']);
});

test('a third station cannot put a third song fact up', () => {
  const picked = selectHomeCards([
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, relatedStation: 'tv', createdAt: '2026-11-23T06:30:00.000Z' }),
    card({ id: 4, templateId: 'premiere', createdAt: '2026-11-23T06:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [1, 2, 4]);
});

test('never more than the maximum, newest first', () => {
  const picked = selectHomeCards([
    card({ id: 1, templateId: 'a', createdAt: '2026-11-23T01:00:00.000Z' }),
    card({ id: 2, templateId: 'b', createdAt: '2026-11-23T02:00:00.000Z' }),
    card({ id: 3, templateId: 'c', createdAt: '2026-11-23T03:00:00.000Z' }),
    card({ id: 4, templateId: 'd', createdAt: '2026-11-23T04:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [4, 3, 2]);
});

test('startAt is what the operator meant by newest', () => {
  const picked = selectHomeCards([
    card({ id: 1, templateId: 'a', createdAt: '2026-11-23T01:00:00.000Z', startAt: '2026-11-23T20:00:00.000Z' }),
    card({ id: 2, templateId: 'b', createdAt: '2026-11-23T02:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [1, 2]);
});

test('a card whose picture never rendered is skipped, not drawn empty', () => {
  const picked = selectHomeCards([
    card({ id: 1, templateId: 'a', imageUrl: '' }),
    card({ id: 2, templateId: 'b', imageUrl: '   ' }),
    card({ id: 3, templateId: 'c' }),
  ]);
  assert.deepEqual(picked.map((c) => c.id), [3]);
});

test('only cards -- a fact, a tip or an announcement is not one', () => {
  const picked = selectHomeCards([
    card({ id: 1, type: 'fact', templateId: null }),
    card({ id: 2, type: 'tip', templateId: null }),
    card({ id: 3, type: 'announcement', templateId: null }),
  ]);
  assert.deepEqual(picked, []);
});

test('the caption is the operator\'s, falling back to the title', () => {
  const picked = selectHomeCards([
    card({ id: 1, templateId: 'a', title: 'Row label', shareCaption: 'Clock this 👀', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, templateId: 'b', title: 'Second card', shareCaption: '   ', createdAt: '2026-11-23T07:00:00.000Z' }),
  ]);
  assert.deepEqual(picked.map((c) => c.caption), ['Clock this 👀', 'Second card']);
});

test('the operator can widen or close the rail', () => {
  const items = [
    card({ id: 1, relatedStation: 'radio', createdAt: '2026-11-23T08:00:00.000Z' }),
    card({ id: 2, relatedStation: 'xtra', createdAt: '2026-11-23T07:00:00.000Z' }),
    card({ id: 3, templateId: 'chart-move', createdAt: '2026-11-23T06:00:00.000Z' }),
  ];
  assert.equal(selectHomeCards(items, { max: 1, perCategory: 2 }).length, 1);
  assert.equal(selectHomeCards(items, { max: 3, perCategory: 1 }).length, 2);
  assert.equal(selectHomeCards(items, { max: 0, perCategory: 2 }).length, 0);
});

test('a card with no template still has a category of its own', () => {
  assert.equal(cardCategory({ id: 7, type: 'card', templateId: null }), 'card');
  assert.equal(cardCategory({ id: 7, type: 'card', templateId: ' song-fact ' }), 'song-fact');
  assert.equal(cardCategory({ id: 7, type: '' as never, templateId: '' }), 'item-7');
});

test('the defaults are the three the owner asked for', () => {
  assert.deepEqual(DEFAULT_HOME_CARD_LIMITS, { max: 3, perCategory: 2 });
});
