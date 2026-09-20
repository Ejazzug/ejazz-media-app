import { Feather } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINI_PLAYER_CLEARANCE } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import {
  clearNotificationHistory,
  getNotificationHistory,
  type StoredNotification,
} from '@/lib/notificationHistory';

function formatReceivedAt(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(timestamp),
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [history, setHistory] = useState<StoredNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(() => {
    getNotificationHistory()
      .then(setHistory)
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const handleClearAll = () => {
    if (history.length === 0) return;
    Alert.alert(
      'Clear all notifications?',
      'This removes your notification history from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearNotificationHistory().then(() => setHistory([]));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={styles.topTitle}>Notifications</Text>
        <Pressable
          onPress={handleClearAll}
          style={styles.topButton}
          hitSlop={8}
          disabled={history.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear all notifications"
        >
          <Feather
            name="trash-2"
            size={19}
            color={history.length === 0 ? colors.mutedForeground : colors.primary}
          />
        </Pressable>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom,
          flexGrow: 1,
        }}
      >
        {isLoading ? null : history.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="bell-off" size={28} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyCopy}>Push notifications from EJazz will show up here.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {history.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemIcon}>
                  <Feather name="bell" size={16} color={colors.primary} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
                  <Text style={styles.itemTime}>{formatReceivedAt(item.receivedAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D2A57',
  },
  topTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 96,
    paddingHorizontal: 32,
  },
  emptyTitle: { color: '#F7F9FC', fontSize: 15, fontWeight: '700' },
  emptyCopy: { color: '#A7B7CC', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  list: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  item: {
    flexDirection: 'row',
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: '#0D2A57',
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(122,168,255,0.14)',
  },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '700' },
  itemBody: { color: '#C7D3E5', fontSize: 13, lineHeight: 18 },
  itemTime: { color: '#7890AE', fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
});
