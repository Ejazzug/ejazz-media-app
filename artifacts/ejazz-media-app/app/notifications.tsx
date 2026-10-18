import { Feather } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINI_PLAYER_CLEARANCE } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import { stripLinkMarkup } from '@/lib/linkText';
import { notificationTarget, openNotification } from '@/lib/notificationOpen';
import {
  getNotificationHistory,
  type StoredNotification,
} from '@/lib/notificationHistory';
import {
  dismissNotifications,
  fetchServerNotifications,
  getDismissedIds,
  isNotificationFeedConfigured,
} from '@/lib/notificationFeed';

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

  /**
   * The server list is the source of truth: the station can retract a notification, and a
   * retracted or expired one stops coming back from the API, so it disappears here too.
   *
   * Two things keep this honest offline and on older installs:
   *  - if the request fails we fall back to the locally stored history, so the screen is
   *    not empty just because the phone has no signal;
   *  - dismissals are local and per device (they never reach the server), so clearing a
   *    notification here cannot remove it from anyone else's phone.
   */
  const loadHistory = useCallback(() => {
    let cancelled = false;
    const toStored = (list: Awaited<ReturnType<typeof fetchServerNotifications>>) =>
      list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        receivedAt: n.sentAt,
        // What a tap needs to open the full message or go straight to the link.
        data: { fullTitle: n.title, fullBody: n.body, image: n.imageUrl, url: n.linkUrl, openMode: n.openMode },
      }));

    (async () => {
      const dismissed = new Set(await getDismissedIds());
      let items: StoredNotification[] = [];
      try {
        if (!isNotificationFeedConfigured()) throw new Error('Notification feed is not configured.');
        items = toStored(await fetchServerNotifications());
      } catch {
        items = [];
      }
      // Fall back to the on-device history when the server has nothing to show -- the
      // request failed, the feed is not configured, or the server list is genuinely empty
      // (every install was local-only before this screen moved to the API, and those
      // notifications should not vanish the first time it loads).
      if (items.length === 0) {
        items = await getNotificationHistory();
      }
      if (cancelled) return;
      setHistory(items.filter((item) => !dismissed.has(item.id)));
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cleanup = loadHistory();
      return cleanup;
    }, [loadHistory])
  );

  const handleDismissOne = (item: StoredNotification) => {
    Alert.alert(
      'Delete this notification?',
      'It is removed from this device only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Hide it immediately, then persist -- the list should never feel laggy, and a
            // storage failure is already logged and self-corrects on the next load.
            setHistory((current) => current.filter((n) => n.id !== item.id));
            void dismissNotifications([item.id]);
          },
        },
      ],
    );
  };

  const handleClearAll = () => {
    if (history.length === 0) return;
    Alert.alert(
      'Clear all notifications?',
      'This clears the list on this device only. It does not affect other devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            const ids = history.map((n) => n.id);
            setHistory([]);
            void dismissNotifications(ids);
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
              <Pressable
                key={item.id}
                style={styles.item}
                onPress={() =>
                  openNotification(router, notificationTarget(item.data, { title: item.title, body: item.body }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Open notification: ${item.title}`}
              >
                <View style={styles.itemIcon}>
                  <Feather name="bell" size={16} color={colors.primary} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.body ? <Text numberOfLines={3} style={styles.itemBody}>{stripLinkMarkup(item.body)}</Text> : null}
                  <Text style={styles.itemTime}>{formatReceivedAt(item.receivedAt)}</Text>
                </View>
                <Pressable
                  onPress={() => handleDismissOne(item)}
                  style={styles.itemDelete}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete notification: ${item.title}`}
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
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
  itemDelete: { width: 28, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  itemTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '700' },
  itemBody: { color: '#C7D3E5', fontSize: 13, lineHeight: 18 },
  itemTime: { color: '#7890AE', fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
});
