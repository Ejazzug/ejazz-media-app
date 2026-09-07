import {
  getAnalytics,
  setAnalyticsCollectionEnabled,
} from '@react-native-firebase/analytics';

export async function initializeFirebaseAnalytics(): Promise<void> {
  await setAnalyticsCollectionEnabled(getAnalytics(), true);
}