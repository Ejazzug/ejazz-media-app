import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { appendNotificationToHistory } from './notificationHistory';

const PUSH_TOKEN_STORAGE_KEY = '@ejazz/expo-push-token';
const DEFAULT_CHANNEL_ID = 'default';
const PUSH_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'EJazz updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('Expo project ID is unavailable for push registration.');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  if (!PUSH_API_URL) {
    console.warn('[EJazz Push] Token was created but not registered: EXPO_PUBLIC_PULSE_API_URL is not configured.');
    return token;
  }

  const response = await fetch(new URL('/api/notifications/register', PUSH_API_URL), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Push token registration failed (HTTP ${response.status}): ${details.slice(0, 200)}`);
  }
  return token;
}

export function usePushNotifications(): {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  response: Notifications.NotificationResponse | null;
} {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const [response, setResponse] =
    useState<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    registerForPushNotifications()
      .then((token) => {
        if (isMounted) setExpoPushToken(token);
      })
      .catch((error: unknown) => {
        console.warn('Push notification registration failed.', error);
      });

    Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (isMounted && lastResponse) setResponse(lastResponse);
    });

    const notificationSubscription = Notifications.addNotificationReceivedListener(
      (incoming) => {
        setNotification(incoming);
        appendNotificationToHistory(incoming).catch((error) => {
          console.warn('Failed to save notification to history.', error);
        });
      },
    );
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(setResponse);

    return () => {
      isMounted = false;
      notificationSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return { expoPushToken, notification, response };
}