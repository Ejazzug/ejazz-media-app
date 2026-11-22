/**
 * ONE LIST, TWO SOURCES.
 *
 * The notifications hub used to show only pushes. It now also shows the CARDS the Control
 * Room has sent (owner: "see which card have been sent" -- the dashboard half shipped first)
 * and the TIPS a listener has been released (lib/tipDrip.ts).
 *
 * The merge is pure and lives here rather than in the screen, because the interesting parts
 * are decisions, not drawing:
 *
 *  - WHICH content items belong here. Only `card` and `tip`. A fact is Home's "Clock it", and
 *    announcements, quizzes, polls and alerts reach people AS pushes -- so they are already in
 *    this list once, under their own notification id. Showing them again from the content feed
 *    would double every one of them.
 *  - A CARD AND ITS OWN PUSH ARE ONE THING. Pushing a card writes a notifications row with the
 *    same words, so the two arrive separately and read as a duplicate. When a card and a
 *    notification share a title, the card wins: it carries the picture, which is the thing the
 *    card actually is.
 *  - WHEN something arrived. A scheduled card is "sent" when its window opened, not when an
 *    operator typed it, so `startAt` beats `createdAt` whenever it is set.
 *  - IDS ARE NAMESPACED (`n:` / `c:`). Dismissals are local and keyed by id (notificationFeed),
 *    and a notification id 7 is not card 7. Without the prefix, clearing one would hide the
 *    other.
 */
import type { PulseContentItem } from '@/lib/pulse';
import { pulseKickerLabel } from '@/lib/pulse';

export type HubKind = 'notification' | 'card' | 'tip';

export type HubItem = {
  /** Namespaced id, and the key a local dismissal is stored under. */
  key: string;
  kind: HubKind;
  title: string;
  body: string;
  /** '' for a push, which has no kicker of its own. */
  kicker: string;
  imageUrl: string;
  /** When it reached this listener, in ms. */
  at: number;
  /** Where a tap goes, in the grammar of lib/destination.ts. */
  dest: string;
  linkUrl: string;
  openMode: 'details' | 'link';
  /**
   * True for a card: the picture IS the content, because the Control Room drew the words into
   * it. A row shows it, and a tap with nowhere else to go opens it full size.
   */
  isPicture: boolean;
};

/** What the hub needs from a stored notification, so this module needs no screen types. */
export type HubNotification = {
  id: string;
  title: string;
  body: string;
  receivedAt: number;
  imageUrl?: string;
  linkUrl?: string;
  openMode?: 'details' | 'link';
};

const normalise = (title: string) => title.trim().toLowerCase();

/** `startAt` when the operator scheduled one, else when it was made. */
function arrivedAt(item: PulseContentItem): number {
  for (const value of [item.startAt, item.createdAt]) {
    const at = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(at)) return at;
  }
  return Date.now();
}

export function contentToHubItem(item: PulseContentItem): HubItem {
  return {
    key: `c:${item.id}`,
    kind: item.type === 'tip' ? 'tip' : 'card',
    title: item.title,
    body: item.body ?? '',
    kicker: pulseKickerLabel(item.type),
    imageUrl: item.imageUrl ?? '',
    at: arrivedAt(item),
    dest: item.dest ?? '',
    linkUrl: '',
    openMode: 'details',
    isPicture: item.type === 'card' && Boolean(item.imageUrl),
  };
}

export function notificationToHubItem(item: HubNotification): HubItem {
  return {
    key: `n:${item.id}`,
    kind: 'notification',
    title: item.title,
    body: item.body,
    kicker: '',
    imageUrl: item.imageUrl ?? '',
    at: item.receivedAt,
    dest: '',
    linkUrl: item.linkUrl ?? '',
    openMode: item.openMode === 'link' ? 'link' : 'details',
    isPicture: false,
  };
}

/**
 * The hub's list: newest first, dismissals removed, a card preferred over its own push.
 *
 * `releasedTipIds` is the drip's answer (lib/tipDrip.ts). A tip that has not been released to
 * this listener yet is not theirs to see, so it is dropped rather than greyed out.
 */
export function buildHubItems(input: {
  notifications: ReadonlyArray<HubNotification>;
  content: ReadonlyArray<PulseContentItem>;
  dismissed: ReadonlySet<string>;
  releasedTipIds: ReadonlySet<number>;
}): HubItem[] {
  const cards = input.content
    .filter((item) => item.type === 'card' || (item.type === 'tip' && input.releasedTipIds.has(item.id)))
    .map(contentToHubItem);

  const cardTitles = new Set(cards.map((card) => normalise(card.title)).filter(Boolean));
  const pushes = input.notifications
    .map(notificationToHubItem)
    .filter((push) => !cardTitles.has(normalise(push.title)));

  return [...cards, ...pushes]
    .filter((item) => !input.dismissed.has(item.key))
    .sort((a, b) => b.at - a.at);
}

/** The hub's filter chips. `tips` is where the `tips` destination lands. */
export type HubFilter = 'all' | 'cards' | 'tips';

export function filterHubItems(items: ReadonlyArray<HubItem>, filter: HubFilter): HubItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'tips') return items.filter((item) => item.kind === 'tip');
  return items.filter((item) => item.kind === 'card');
}
