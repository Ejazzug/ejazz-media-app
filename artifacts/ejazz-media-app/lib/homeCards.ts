/**
 * WHICH CARDS HOME SHOWS, and in which order.
 *
 * The rule the owner gave on 2026-11-23: *"it should show a maximum of 3 of the latest cards
 * and not from the same category for example only two song facts can show at a time (meaning
 * one from each radio) then one other card can show"*.
 *
 * So the rail is not "the newest three". Three song facts in a row would be the newest three
 * most mornings -- the Control Room makes far more of them than of anything else -- and Home
 * would read like one feature repeating. What it shows is three DIFFERENT things, newest
 * first, where a song fact from Radio and a song fact from Xtra count as different things
 * because they are about different stations.
 *
 * Expressed as one key per card: its CATEGORY and its STATION. One card per key, in date
 * order, until the rail is full. Nothing here knows the names of any categories, so a new
 * template appears in the rail the day it is first published without a line changing.
 *
 * The limits are the operator's, not this file's -- `HomeCardLimits` comes from the Control
 * Room's app config, so "show two" or "stop showing these" is a save on the dashboard rather
 * than a release. The defaults below are what the owner asked for.
 */
import type { PulseContentItem } from '@/lib/pulse';

export type HomeCardLimits = {
  /** How many cards the rail may show at once. */
  max: number;
  /**
   * How many may share a CATEGORY, across stations. Two, so Radio and Xtra can each have a
   * song fact up, and a third never crowds out everything else.
   */
  perCategory: number;
};

export const DEFAULT_HOME_CARD_LIMITS: HomeCardLimits = { max: 3, perCategory: 2 };

export type HomeCard = {
  id: number;
  title: string;
  /** The caption a share carries. Falls back to the title when no one wrote one. */
  caption: string;
  imageUrl: string;
  /** Where a tap goes, in the grammar of lib/destination.ts; '' stays on Home. */
  dest: string;
  /** For the rail's own label: 'EJazz Radio', 'EJazz Xtra', or '' when it is for everyone. */
  stationLabel: string;
  category: string;
  at: number;
};

/**
 * A card's category.
 *
 * `templateId` is the real answer for a card -- 'song-fact', 'chart-move', 'premiere' -- and
 * it is what makes two song facts recognisably the same kind of thing. A card with no
 * template falls back to its content type, which at least keeps announcements apart from
 * facts, and an unnamed one stands alone under its own id so a missing field can never
 * silently collapse several cards into one category and hide two of them.
 */
export function cardCategory(item: Pick<PulseContentItem, 'id' | 'type' | 'templateId'>): string {
  const template = (item.templateId ?? '').trim();
  if (template) return template;
  const type = (item.type ?? '').trim();
  return type || `item-${item.id}`;
}

function stationKey(item: Pick<PulseContentItem, 'relatedStation'>): string {
  return (item.relatedStation ?? '').trim().toLowerCase();
}

const STATION_LABELS: Record<string, string> = {
  radio: 'EJazz Radio',
  xtra: 'EJazz Xtra',
  extra: 'EJazz Xtra',
};

export function stationLabelFor(item: Pick<PulseContentItem, 'relatedStation'>): string {
  return STATION_LABELS[stationKey(item)] ?? '';
}

/** Newest first, by when the operator scheduled it if they did, else when it was made. */
function publishedAt(item: PulseContentItem): number {
  for (const value of [item.startAt, item.createdAt]) {
    const at = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(at)) return at;
  }
  return 0;
}

/**
 * The rail.
 *
 * Expiry is NOT re-checked here: `endAt` is applied by the server when it serves the feed, and
 * applying it twice would mean a phone with a wrong clock hiding a live card. What this does
 * guard is the thing the server cannot know -- a card with no picture. The rail is pictures,
 * so a card whose render failed is skipped rather than drawn as an empty box.
 */
export function selectHomeCards(
  items: ReadonlyArray<PulseContentItem>,
  limits: HomeCardLimits = DEFAULT_HOME_CARD_LIMITS,
): HomeCard[] {
  const max = Math.max(0, Math.trunc(limits.max));
  const perCategory = Math.max(1, Math.trunc(limits.perCategory));
  if (max === 0) return [];

  const newestFirst = items
    .filter((item) => item.type === 'card' && Boolean((item.imageUrl ?? '').trim()))
    .map((item) => ({ item, at: publishedAt(item) }))
    .sort((a, b) => b.at - a.at || b.item.id - a.item.id);

  const taken: HomeCard[] = [];
  const seenKeys = new Set<string>();
  const perCategoryCount = new Map<string, number>();

  for (const { item, at } of newestFirst) {
    if (taken.length >= max) break;
    const category = cardCategory(item);
    const key = `${category}|${stationKey(item)}`;
    // One per category-and-station: the second song fact from the SAME station is the same
    // thing said twice, which is what the owner was looking at when they asked for this.
    if (seenKeys.has(key)) continue;
    if ((perCategoryCount.get(category) ?? 0) >= perCategory) continue;
    seenKeys.add(key);
    perCategoryCount.set(category, (perCategoryCount.get(category) ?? 0) + 1);
    taken.push({
      id: item.id,
      title: item.title,
      caption: (item.shareCaption ?? '').trim() || item.title,
      imageUrl: (item.imageUrl ?? '').trim(),
      dest: item.dest ?? '',
      stationLabel: stationLabelFor(item),
      category,
      at,
    });
  }
  return taken;
}
