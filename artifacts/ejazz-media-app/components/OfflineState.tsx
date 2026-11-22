/**
 * WHAT A SECTION SHOWS WHEN ITS SERVICE CANNOT BE REACHED.
 *
 * The rule the owner set (2026-11-22) is that the app must look finished with no network and
 * must never pretend: no invented Now Playing, no yesterday's chart dressed as today's, no
 * placeholder headlines that read like news. So each of these says plainly that the thing is
 * not available right now, says what the listener CAN still do, and offers one button.
 *
 * Everything here is bundled: the type, the icons (vector, from the icon font already in the
 * app) and the colours. Nothing is fetched to draw an offline state, which would be a joke.
 */
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useReachability, type ServiceKey } from '@/lib/reachability';

type Kind = 'news' | 'podcasts' | 'charts' | 'nowplaying' | 'notifications' | 'generic';

const COPY: Record<Kind, { icon: keyof typeof Feather.glyphMap; title: string; body: string; still?: string }> = {
  notifications: {
    icon: 'bell-off',
    title: 'Your notifications need a connection',
    body: 'Cards and tips cannot be reached right now, and nothing was kept on this phone yet.',
    still: 'Anything already delivered stays on this phone.',
  },
  news: {
    icon: 'file-text',
    title: 'Stories need a connection',
    body: 'EJazz News cannot be reached right now, so there is nothing to show yet.',
    still: 'The radio still plays when you have a signal.',
  },
  podcasts: {
    icon: 'mic',
    title: 'Podcasts need a connection',
    body: 'The episode list cannot be reached right now.',
  },
  charts: {
    icon: 'bar-chart-2',
    title: 'The chart is not in yet',
    body: 'We only show a chart we can confirm is the current one.',
  },
  nowplaying: {
    icon: 'radio',
    title: 'Track details unavailable',
    body: 'The station is there; what is playing cannot be read right now.',
  },
  generic: {
    icon: 'cloud-off',
    title: 'Cannot reach EJazz',
    body: 'This part of the app needs a connection.',
  },
};

export function OfflineState({
  kind = 'generic',
  service,
  compact,
}: {
  kind?: Kind;
  /** Which service this section waits on; the retry button probes it. */
  service?: ServiceKey;
  compact?: boolean;
}) {
  const { recheck, checking } = useReachability();
  const copy = COPY[kind];
  return (
    <View style={[styles.box, compact && styles.boxCompact]}>
      <View style={styles.iconWrap}>
        <Feather name={copy.icon} size={compact ? 18 : 22} color="#FF6B6B" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.still && !compact ? <Text style={styles.still}>{copy.still}</Text> : null}
        <Pressable
          onPress={() => void recheck()}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel="Check the connection again"
          style={styles.retry}
          hitSlop={8}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#FF6B6B" />
          ) : (
            <Text style={styles.retryText}>TRY AGAIN</Text>
          )}
        </Pressable>
      </View>
      {/* `service` is accepted so a caller can say what it waits on even while the retry
          button probes everything -- one tap repairing the whole app is kinder than making
          somebody tap per section. It is NOT rendered. It used to be parked in a hidden
          <Text style={{ fontSize: 0 }}>, which crashed the app on launch: Fabric measures
          every Text node, including invisible ones inside a 0x0 parent, and throws
          "FontSize should be a positive value. Current value: 0" rather than skipping it.
          There is no zero-size way to hide text; do not add one. */}
    </View>
  );
}

/**
 * The one line at the top of Home when NOTHING answers. Deliberately not a blocking screen:
 * the stations, the player and every tab still work, so the app must not behave as if it is
 * broken.
 */
export function OfflineBanner() {
  const { allUnreachable, checking, recheck } = useReachability();
  if (!allUnreachable) return null;
  return (
    <Pressable
      onPress={() => void recheck()}
      accessibilityRole="button"
      accessibilityLabel="Offline. Tap to check again."
      style={styles.banner}
    >
      <Feather name="cloud-off" size={15} color="#0B1730" />
      <Text style={styles.bannerText}>
        No connection to EJazz — live radio and stories will fill in when you are back.
      </Text>
      {checking ? <ActivityIndicator size="small" color="#0B1730" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2C4B75',
    backgroundColor: '#0D2A57',
  },
  boxCompact: { padding: 11, marginTop: 8 },
  iconWrap: { paddingTop: 2 },
  copy: { flex: 1, gap: 3 },
  title: { color: '#F7F9FC', fontSize: 13.5, fontWeight: '700' },
  body: { color: '#A7B7CC', fontSize: 12, lineHeight: 17 },
  still: { color: '#7D8FA8', fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  retry: { marginTop: 8, alignSelf: 'flex-start' },
  retryText: { color: '#FF6B6B', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#FFC247',
  },
  bannerText: { flex: 1, color: '#0B1730', fontSize: 12, fontWeight: '700' },
});
