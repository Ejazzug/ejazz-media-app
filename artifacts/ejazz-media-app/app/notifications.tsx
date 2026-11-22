import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINI_PLAYER_CLEARANCE } from '@/components/MediaComponents';
import { ShareAppButton } from '@/components/ShareAppButton';
import { useColors } from '@/hooks/useColors';
import { stripLinkMarkup } from '@/lib/linkText';
import { notificationTarget, openNotification } from '@/lib/notificationOpen';
import { goToDestination } from '@/lib/destination';
import {
  clearNotificationHistory,
  getNotificationHistory,
  type StoredNotification,
} from '@/lib/notificationHistory';
import {
  dismissNotifications,
  fetchServerNotifications,
  getDismissedIds,
  isNotificationFeedConfigured,
} from '@/lib/notificationFeed';
import {
  buildHubItems,
  filterHubItems,
  type HubFilter,
  type HubItem,
  type HubNotification,
} from '@/lib/hubItems';
import { usePulseContent } from '@/lib/pulse';
import { releasedTipIds, tipDripStartedAt } from '@/lib/tipDrip';
import { useShareApp } from '@/lib/shareApp';
import { OfflineState } from '@/components/OfflineState';
import { useService } from '@/lib/reachability';

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

const FILTER_LABELS: Record<HubFilter, string> = { all: 'ALL', cards: 'CARDS', tips: 'TIPS' };

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The `tips` destination (lib/destination.ts) lands here asking for the tips filter.
  const params = useLocalSearchParams<{ tips?: string }>();
  const [history, setHistory] = useState<HubNotification[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<HubFilter>(params.tips ? 'tips' : 'all');
  /** The card being looked at full size. A card IS a picture, so this is how you read one. */
  const [peek, setPeek] = useState<HubItem | null>(null);
  /** Set once the drip has been asked when this device's tip series started. */
  const [dripStartedAt, setDripStartedAt] = useState<number | null>(null);

  const content = usePulseContent();
  const pulseService = useService('pulse');
  const { shareCardImage, shareWithLink, enabled: shareEnabled } = useShareApp();

  React.useEffect(() => {
    let active = true;
    tipDripStartedAt().then((at) => {
      if (active) setDripStartedAt(at);
    });
    return () => {
      active = false;
    };
  }, []);

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
    const toHub = (list: Awaited<ReturnType<typeof fetchServerNotifications>>): HubNotification[] =>
      list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        receivedAt: n.sentAt,
        imageUrl: n.imageUrl,
        linkUrl: n.linkUrl,
        openMode: n.openMode,
      }));
    const storedToHub = (list: StoredNotification[]): HubNotification[] =>
      list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        receivedAt: n.receivedAt,
        imageUrl: typeof n.data?.image === 'string' ? n.data.image : '',
        linkUrl: typeof n.data?.url === 'string' ? n.data.url : '',
        openMode: n.data?.openMode === 'link' ? 'link' : 'details',
      }));

    (async () => {
      const storedDismissals = await getDismissedIds();
      /**
       * Hub keys are namespaced (`n:7`), but dismissals written before this screen merged
       * cards are bare notification ids (`7`). Both forms are honoured on read, or every
       * notification someone had already cleared would come back once.
       */
      const dismissedKeys = new Set<string>();
      for (const id of storedDismissals) {
        dismissedKeys.add(id);
        dismissedKeys.add(`n:${id}`);
      }
      let items: HubNotification[] = [];
      let serverAnswered = false;
      try {
        if (!isNotificationFeedConfigured()) throw new Error('Notification feed is not configured.');
        items = toHub(await fetchServerNotifications());
        serverAnswered = true;
      } catch {
        items = [];
      }
      if (!serverAnswered) {
        // Offline, or the feed is not configured: show what this device kept, so the screen
        // is not empty just because there is no signal.
        items = storedToHub(await getNotificationHistory());
      } else if (items.length === 0) {
        // The server answered, and the answer is "nothing" -- everything was retracted or has
        // expired. That is the truth, so the local copies go too: keeping them here is what
        // made retracted notifications reappear on the phone once the list emptied.
        await clearNotificationHistory();
      }
      if (cancelled) return;
      setDismissed(dismissedKeys);
      setHistory(items);
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

  const tips = useMemo(
    () =>
      (content.data ?? [])
        .filter((item) => item.type === 'tip')
        .map((item) => ({ id: item.id, at: Date.parse(item.startAt || item.createdAt) || 0 })),
    [content.data],
  );

  const items = useMemo(
    () =>
      buildHubItems({
        notifications: history,
        content: content.data ?? [],
        dismissed,
        // Until the drip has answered, no tip is released: showing the series and then
        // taking part of it away a moment later would be worse than a beat of patience.
        releasedTipIds:
          dripStartedAt === null ? new Set<number>() : releasedTipIds(tips, dripStartedAt, Date.now()),
      }),
    [history, content.data, dismissed, dripStartedAt, tips],
  );

  const kinds = useMemo(() => new Set(items.map((item) => item.kind)), [items]);
  const chips = useMemo<HubFilter[]>(() => {
    const available: HubFilter[] = ['all'];
    if (kinds.has('card')) available.push('cards');
    if (kinds.has('tip')) available.push('tips');
    // One kind of thing needs no chips to choose between.
    return available.length > 1 ? available : [];
  }, [kinds]);
  const shown = useMemo(() => filterHubItems(items, filter), [items, filter]);

  const hide = (keys: string[]) => {
    setDismissed((current) => new Set([...current, ...keys]));
    // A notification also stores its bare id, so a rollback to a build that reads the old
    // key scheme still sees it as cleared.
    const stored = keys.flatMap((key) => (key.startsWith('n:') ? [key, key.slice(2)] : [key]));
    void dismissNotifications(stored);
  };

  const handleDismissOne = (item: HubItem) => {
    Alert.alert(
      item.kind === 'notification' ? 'Delete this notification?' : 'Hide this?',
      'It is removed from this device only.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => hide([item.key]) },
      ],
    );
  };

  const handleClearAll = () => {
    if (shown.length === 0) return;
    Alert.alert(
      'Clear these?',
      'This clears the list on this device only. It does not affect other devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => hide(shown.map((item) => item.key)) },
      ],
    );
  };

  /**
   * A tap, in order of what the sender asked for: an aimed destination first, then the
   * picture if it IS one, then the old behaviour (the message, or its link).
   */
  const handleOpen = (item: HubItem) => {
    if (item.dest && goToDestination(router, item.dest)) return;
    if (item.isPicture) {
      setPeek(item);
      return;
    }
    openNotification(
      router,
      notificationTarget(
        {
          fullTitle: item.title,
          fullBody: item.body,
          image: item.imageUrl,
          url: item.linkUrl,
          openMode: item.openMode,
        },
        { title: item.title, body: item.body },
      ),
    );
  };

  const handleShare = (item: HubItem) => {
    const words = [item.title, stripLinkMarkup(item.body)].filter(Boolean).join('\n\n');
    // A card is a picture, so it is shared AS one; everything else is words.
    if (item.isPicture) void shareCardImage(words, item.imageUrl);
    else shareWithLink(words);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topSide}>
          <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={[styles.topSide, styles.topSideRight]}>
          <Pressable
            onPress={handleClearAll}
            style={styles.topButton}
            hitSlop={8}
            disabled={shown.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Clear all notifications"
          >
            <Feather
              name="trash-2"
              size={19}
              color={shown.length === 0 ? colors.mutedForeground : colors.primary}
            />
          </Pressable>
          <ShareAppButton style={styles.topButton} />
        </View>
      </View>

      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((chip) => (
            <Pressable
              key={chip}
              onPress={() => setFilter(chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === chip }}
              accessibilityLabel={`Show ${FILTER_LABELS[chip].toLowerCase()}`}
              style={[styles.chip, filter === chip && styles.chipOn]}
            >
              <Text style={[styles.chipText, filter === chip && styles.chipTextOn]}>
                {FILTER_LABELS[chip]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom,
          flexGrow: 1,
        }}
      >
        {isLoading ? null : shown.length === 0 ? (
          // A hub with nothing in it because nothing can be reached is a different thing from
          // a hub with nothing in it, and says so.
          pulseService.unreachable && history.length === 0 ? (
            <OfflineState kind="notifications" service="pulse" />
          ) : (
            <View style={styles.empty}>
              <Feather
                name={filter === 'tips' ? 'award' : 'bell-off'}
                size={28}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyTitle}>
                {filter === 'tips' ? 'No tips yet' : filter === 'cards' ? 'No cards yet' : 'No notifications yet'}
              </Text>
              <Text style={styles.emptyCopy}>
                {filter === 'tips'
                  ? 'EJazz tips arrive here, one at a time.'
                  : 'Push notifications and cards from EJazz will show up here.'}
              </Text>
            </View>
          )
        ) : (
          <View style={styles.list}>
            {shown.map((item) => (
              <Pressable
                key={item.key}
                style={styles.item}
                onPress={() => handleOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`Open: ${item.title}`}
              >
                {item.isPicture ? (
                  <Image source={item.imageUrl} contentFit="cover" style={styles.itemPicture} />
                ) : (
                  <View style={styles.itemIcon}>
                    <Feather name={item.kind === 'tip' ? 'award' : 'bell'} size={16} color={colors.primary} />
                  </View>
                )}
                <View style={styles.itemCopy}>
                  {item.kicker ? <Text style={styles.itemKicker}>{item.kicker}</Text> : null}
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.body ? (
                    <Text numberOfLines={3} style={styles.itemBody}>{stripLinkMarkup(item.body)}</Text>
                  ) : null}
                  <View style={styles.itemFooter}>
                    <Text style={styles.itemTime}>{formatReceivedAt(item.at)}</Text>
                    {shareEnabled ? (
                      <Pressable
                        onPress={() => handleShare(item)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Share: ${item.title}`}
                      >
                        <Text style={styles.itemShare}>SHARE</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={() => handleDismissOne(item)}
                  style={styles.itemDelete}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete: ${item.title}`}
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={peek !== null} transparent animationType="fade" onRequestClose={() => setPeek(null)}>
        <Pressable style={styles.peekBackdrop} onPress={() => setPeek(null)} accessibilityLabel="Close the card">
          {peek ? (
            <Image
              source={peek.imageUrl}
              contentFit="contain"
              style={styles.peekImage}
              accessibilityLabel={peek.title}
            />
          ) : null}
          {peek && shareEnabled ? (
            <Pressable
              onPress={() => handleShare(peek)}
              accessibilityRole="button"
              accessibilityLabel={`Share: ${peek.title}`}
              style={styles.peekShare}
            >
              <Feather name="share-2" size={14} color="#FFFFFF" />
              <Text style={styles.peekShareText}>SHARE THIS</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
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
  // Equal-width sides keep the title centred now that the right side holds two buttons.
  topSide: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topSideRight: { justifyContent: 'flex-end' },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 2 },
  chip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#204570' },
  chipOn: { borderColor: '#E43B48', backgroundColor: 'rgba(228,59,72,0.16)' },
  chipText: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  chipTextOn: { color: '#F7F9FC' },
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
  // A card's own picture, in place of the icon: square, because that is the shape the
  // Control Room renders (…-1x1.jpg).
  itemPicture: { width: 56, height: 56, backgroundColor: '#123363' },
  itemCopy: { flex: 1, gap: 3 },
  itemDelete: { width: 28, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  itemKicker: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  itemTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '700' },
  itemBody: { color: '#C7D3E5', fontSize: 13, lineHeight: 18 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  itemTime: { color: '#7890AE', fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  itemShare: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  peekBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 20,
    backgroundColor: 'rgba(4,12,26,0.94)',
  },
  peekImage: { width: '100%', height: '72%' },
  peekShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    backgroundColor: '#E43B48',
  },
  peekShareText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
});
