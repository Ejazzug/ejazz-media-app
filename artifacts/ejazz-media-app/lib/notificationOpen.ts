import { Linking } from 'react-native';
import type { useRouter } from 'expo-router';
import { firstLinkUrl } from '@/lib/linkText';
import { destinationRoute } from '@/lib/destination';

/** Everything the full-message screen needs, so it works from a cold start with no network. */
export type NotificationTarget = {
  title: string;
  body: string;
  image: string;
  url: string;
  openMode: 'details' | 'link';
  /**
   * Where the operator aimed this tap (lib/destination.ts). Empty means they did not aim it,
   * and `openMode` decides as it always did -- which is what keeps a push sent by an older
   * build, or by an operator who left the picker alone, behaving exactly as before.
   */
  dest: string;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function httpUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : '';
}

/**
 * Builds the target from a push's data (or a stored/server notification). `fallback` is the
 * title/body the system showed, for pushes sent before the richer fields existed.
 */
export function notificationTarget(
  data: Record<string, unknown> | undefined,
  fallback: { title?: string; body?: string } = {},
): NotificationTarget {
  const d = data ?? {};
  const body = str(d.fullBody) || str(d.body) || fallback.body || '';
  const url = httpUrl(str(d.url)) || firstLinkUrl(body) || '';
  return {
    title: str(d.fullTitle) || str(d.title) || fallback.title || 'EJazz Media',
    body,
    image: httpUrl(str(d.image)),
    url,
    openMode: d.openMode === 'link' && url ? 'link' : 'details',
    dest: str(d.dest),
  };
}

/**
 * What a tap does: either straight to the link, or the full message in the app. Anything
 * that is not a plain http(s) link is never opened.
 */
type AppRouter = ReturnType<typeof useRouter>;

export function openNotification(router: AppRouter, target: NotificationTarget): void {
  // An aimed tap wins: the operator chose a place, and the message it came from is the
  // fallback, not the destination. An unrecognised one falls through to that fallback rather
  // than being guessed at.
  const route = destinationRoute(target.dest);
  if (route) {
    router.push(route as never);
    return;
  }
  if (target.openMode === 'link' && target.url) {
    Linking.openURL(target.url).catch(() => undefined);
    return;
  }
  router.push({
    pathname: '/notification-detail',
    params: { title: target.title, body: target.body, image: target.image, url: target.url },
  });
}
