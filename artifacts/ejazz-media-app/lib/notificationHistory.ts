import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as Notifications from 'expo-notifications';

export type StoredNotification = {
  id: string;
  title: string;
  body: string;
  receivedAt: number;
  data?: Record<string, unknown>;
};

const HISTORY_STORAGE_KEY = 'ejazz_notification_history';
const MAX_HISTORY_LENGTH = 100;

export async function getNotificationHistory(): Promise<StoredNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read notification history.', error);
    return [];
  }
}

export async function appendNotificationToHistory(
  notification: Notifications.Notification,
): Promise<void> {
  try {
    const content = notification.request?.content;
    if (!content) return;
    const entry: StoredNotification = {
      id: notification.request.identifier || String(Date.now()),
      title: content.title ?? 'EJazz Media',
      body: content.body ?? '',
      receivedAt: Date.now(),
      data: (content.data as Record<string, unknown>) ?? undefined,
    };
    const existing = await getNotificationHistory();
    const deduped = existing.filter((item) => item.id !== entry.id);
    const next = [entry, ...deduped].slice(0, MAX_HISTORY_LENGTH);
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Failed to save notification to history.', error);
  }
}

export async function clearNotificationHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear notification history.', error);
  }
}
