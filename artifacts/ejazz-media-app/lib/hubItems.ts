/**
 * ONE LIST: the pushes a listener was sent, plus the TIPS released to them (lib/tipDrip.ts).
 *
 * NO CARD LISTING. It had one for a few hours on 2026-11-22 and the owner removed it the next
 * morning: *"I dont need a cards page in the app, that page is needed in the dashboard and i
 * told you"*. A roster of what the Control Room has sent is an OPERATOR's view, and the
 * dashboard already has it at /approvals. A listener has no use for a list of cards: they
 * meet a card where it is published -- on Home, or as the push that announced it -- not in a
 * filing cabinet.
 *
 * So a card reaches this list the way everything else does, as the PUSH that carried it, with
 * whatever picture that push had. The content feed is not read here at all beyond tips.
 *
 * The merge is pure and lives here rather than in the screen, because the interesting parts
 * are decisions, not drawing:
 *
 *  - WHICH content items belong here. Only `tip`. A fact is Home's "Clock it", and
 *    announcements, quizzes, polls and alerts reach people AS pushes -- so they are already in
 *    this list once, under their own notification id. Showing them again from the content feed
 *    would double every one of them.
 *  - IDS ARE NAMESPACED (`n:` / `c:`). Dismissals are local and keyed by id (notificationFeed),
 *    and a notification id 7 is not tip 7. Without the prefix, clearing one would hide the
 *    other.
 */
import type { PulseContentItem } from '@/lib/pulse';
import { pulseKickerLabel } from '@/lib/pulse';

export type HubKind = 'notification' | 'tip';

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
   * True when the picture IS the content, because the words were drawn into it. A row shows
   * it, and a tap with nowhere else to go opens it full size. Nothing sets it since the card
   * listing was removed; a push that carries an image still shows that image inline.
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
    kind: 'tip',
    title: item.title,
    body: item.body ?? '',
    kicker: pulseKickerLabel(item.type),
    imageUrl: item.imageUrl ?? '',
    at: arrivedAt(item),
    dest: item.dest ?? '',
    linkUrl: '',
    openMode: 'details',
    isPicture: false,
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
 * The hub's list: newest first, with dismissals removed.
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
  const tips = input.content
    .filter((item) => item.type === 'tip' && input.releasedTipIds.has(item.id))
    .map(contentToHubItem);

  const pushes = input.notifications.map(notificationToHubItem);

  return [...tips, ...pushes]
    .filter((item) => !input.dismissed.has(item.key))
    .sort((a, b) => b.at - a.at);
}

/** The hub's filter chips. `tips` is where the `tips` destination lands. */
export type HubFilter = 'all' | 'tips';

export function filterHubItems(items: ReadonlyArray<HubItem>, filter: HubFilter): HubItem[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.kind === 'tip');
}
