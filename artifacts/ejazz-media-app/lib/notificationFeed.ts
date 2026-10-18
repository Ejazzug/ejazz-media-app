import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * The server-side notification list (GET /api/notifications), which is what the
 * Notifications screen shows. The station can retract a notification, and a retracted or
 * expired one simply stops being returned here -- so it disappears on the next load.
 *
 * Dismissals are the other half and are the opposite: they are LOCAL AND PER DEVICE.
 * Clearing a notification is this person tidying their own list; it must not remove it
 * from anybody else's phone, so the id goes into AsyncStorage and is filtered out on read.
 * Nothing about a dismissal is sent to the server.
 */

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const REQUEST_TIMEOUT_MS = 10_000;
const DISMISSED_STORAGE_KEY = 'ejazz_notifications_dismissed_v1';
/** Keeps the dismissed list from growing without limit on a long-lived install. */
const MAX_DISMISSED = 500;

export type ServerNotification = {
  id: string;
  title: string;
  body: string;
  topic: string;
  sentAt: number;
  imageUrl: string;
  linkUrl: string;
  openMode: 'details' | 'link';
};

export function isNotificationFeedConfigured(): boolean {
  return Boolean(PULSE_API_URL);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toServerNotification(raw: unknown): ServerNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.id == null || typeof r.title !== 'string') return null;
  const sentAt = typeof r.sentAt === 'string' ? Date.parse(r.sentAt) : NaN;
  return {
    id: String(r.id),
    title: r.title,
    body: typeof r.body === 'string' ? r.body : '',
    topic: typeof r.topic === 'string' ? r.topic : 'all',
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : '',
    linkUrl: typeof r.linkUrl === 'string' ? r.linkUrl : '',
    openMode: r.openMode === 'link' ? 'link' : 'details',
    sentAt: Number.isNaN(sentAt) ? Date.now() : sentAt,
  };
}

/** Throws on any failure, so the caller can fall back to the local history. */
export async function fetchServerNotifications(): Promise<ServerNotification[]> {
  if (!PULSE_API_URL) throw new Error('EXPO_PUBLIC_PULSE_API_URL is not set.');
  const url = `${PULSE_API_URL.replace(/\/$/, '')}/api/notifications`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/0.1.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Notifications API returned HTTP ${response.status}`);
    const data = (await response.json()) as { notifications?: unknown };
    const list = Array.isArray(data?.notifications) ? data.notifications : [];
    return list
      .map(toServerNotification)
      .filter((n): n is ServerNotification => n !== null);
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Notifications request timed out after ${REQUEST_TIMEOUT_MS}ms.`
        : describeError(error);
    console.warn('[EJazz Notifications] Could not load the list.', message);
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDismissedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    console.warn('[EJazz Notifications] Could not read dismissed ids.', error);
    return [];
  }
}

async function writeDismissed(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify(ids.slice(0, MAX_DISMISSED)),
    );
  } catch (error) {
    console.warn('[EJazz Notifications] Could not save dismissed ids.', error);
  }
}

/** Hide these notifications on this device. Newest ids first, so the cap trims oldest. */
export async function dismissNotifications(ids: string[]): Promise<string[]> {
  const existing = await getDismissedIds();
  const next = [...new Set([...ids.map(String), ...existing])];
  await writeDismissed(next);
  return next;
}

/** Only used if a "restore" affordance is ever added; kept so the key has one owner. */
export async function clearDismissed(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISMISSED_STORAGE_KEY);
  } catch (error) {
    console.warn('[EJazz Notifications] Could not reset dismissed ids.', error);
  }
}
