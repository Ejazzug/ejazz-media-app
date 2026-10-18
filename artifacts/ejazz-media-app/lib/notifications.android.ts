import { useEffect } from 'react';
import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  subscribeToTopic,
} from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';

import { appendNotificationToHistory } from './notificationHistory';
import { notificationTarget, openNotification } from './notificationOpen';

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
  const router = useRouter();

  // A tap on a notification: open the full message, or go straight to its link. Three
  // routes in, all funnelled through one function:
  //  - app killed, notification tapped          -> getInitialNotification
  //  - app in the background, tapped            -> onNotificationOpenedApp
  //  - shown by us while the app was open       -> expo-notifications response listener
  // The same tap must never open twice, so a recent id is remembered.
  useEffect(() => {
    const firebaseMessaging = getMessaging();
    let lastOpened = '';
    let lastOpenedAt = 0;
    // Two listeners can both report one tap with different ids; treat taps within 3 s as one.
    const isDuplicate = (key: string) => {
      const now = Date.now();
      const dup = key === lastOpened || now - lastOpenedAt < 3000;
      if (!dup) {
        lastOpened = key;
        lastOpenedAt = now;
      }
      return dup;
    };
    const handle = (message: RemoteMessage | null | undefined, delayMs = 0) => {
      if (!message) return;
      const text = getMessageText(message);
      const key = String(message.messageId ?? message.data?.contentId ?? text.title);
      if (isDuplicate(key)) return;
      const target = notificationTarget(message.data as Record<string, unknown> | undefined, text);
      // On a cold start the navigator is not ready for a moment.
      setTimeout(() => openNotification(router, target), delayMs);
    };

    getInitialNotification(firebaseMessaging)
      .then((message) => handle(message as RemoteMessage | null, 700))
      .catch(() => undefined);
    const unsubscribeOpened = onNotificationOpenedApp(firebaseMessaging, (message) =>
      handle(message as RemoteMessage),
    );
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      const key = response.notification.request.identifier;
      if (isDuplicate(key)) return;
      openNotification(
        router,
        notificationTarget(content.data as Record<string, unknown> | undefined, {
          title: content.title ?? undefined,
          body: content.body ?? undefined,
        }),
      );
    });
    return () => {
      unsubscribeOpened();
      responseSub.remove();
    };
  }, [router]);

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
