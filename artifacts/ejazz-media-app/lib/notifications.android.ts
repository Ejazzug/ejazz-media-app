import { useEffect } from 'react';
import {
  getMessaging,
  onMessage,
  subscribeToTopic,
} from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';

import { appendNotificationToHistory } from './notificationHistory';

const NOTIFICATION_CHANNEL_ID = 'default';
const FCM_TOPICS = ['all', 'radio', 'xtra'] as const;

type RemoteMessage = {
  messageId?: string;
  sentTime?: number;
  notification?: { title?: string; body?: string };
  data?: Record<string, string | object>;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (Number(Platform.Version) < 33) return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function getMessageText(message: RemoteMessage) {
  const title = message.notification?.title ?? message.data?.title;
  const body = message.notification?.body ?? message.data?.body;
  return {
    title: typeof title === 'string' ? title : 'EJazz Media',
    body: typeof body === 'string' ? body : '',
  };
}

async function showForegroundMessage(
  message: RemoteMessage,
): Promise<void> {
  const { title, body } = getMessageText(message);
  if (!body && !message.notification?.title && !message.data?.title) return;

  const data = message.data ?? {};
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null,
  });
  await appendNotificationToHistory({
    id: message.messageId,
    title,
    body,
    receivedAt: message.sentTime ?? Date.now(),
    data,
  });
}

export function usePushNotifications(): void {
  useEffect(() => {
    let isMounted = true;
    const firebaseMessaging = getMessaging();
    const unsubscribe = onMessage(firebaseMessaging, (message) => {
      showForegroundMessage(message).catch((error: unknown) => {
        console.warn('[EJazz FCM] Could not display foreground notification.', error);
      });
    });

    async function initializeTopicSubscriptions() {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'EJazz updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });

      const granted = await requestAndroidNotificationPermission();
      if (!granted || !isMounted) return;

      await Promise.all(
        FCM_TOPICS.map((topic) => subscribeToTopic(firebaseMessaging, topic)),
      );
    }

    initializeTopicSubscriptions().catch((error: unknown) => {
      console.warn('[EJazz FCM] Notification permission or topic subscription failed.', error);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
}
