import { Linking } from 'react-native';
import type { useRouter } from 'expo-router';
import { firstLinkUrl } from '@/lib/linkText';

/** Everything the full-message screen needs, so it works from a cold start with no network. */
export type NotificationTarget = {
  title: string;
  body: string;
  image: string;
  url: string;
  openMode: 'details' | 'link';
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
  };
}

/**
 * What a tap does: either straight to the link, or the full message in the app. Anything
 * that is not a plain http(s) link is never opened.
 */
type AppRouter = ReturnType<typeof useRouter>;

export function openNotification(router: AppRouter, target: NotificationTarget): void {
  if (target.openMode === 'link' && target.url) {
    Linking.openURL(target.url).catch(() => undefined);
    return;
  }
  router.push({
    pathname: '/notification-detail',
    params: { title: target.title, body: target.body, image: target.image, url: target.url },
  });
}
