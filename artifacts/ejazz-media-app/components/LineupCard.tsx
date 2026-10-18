import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatShowTime, type Show } from '@/lib/shows';

/**
 * One "Coming Up" card. Shared by Home and the Radio screen so the two always look alike;
 * the cards sit in a single row that scrolls sideways (see LineupRow).
 */
export function LineupCard({
  badge,
  live,
  name,
  host,
  time,
  imageUrl,
}: {
  badge: string;
  live?: boolean;
  name: string;
  host?: string | null;
  time?: string;
  imageUrl?: string | null;
}) {
  return (
    <View style={[styles.card, imageUrl ? styles.cardRow : null]}>
      {imageUrl ? <Image source={imageUrl} contentFit="cover" style={styles.artwork} /> : null}
      <View style={styles.copy}>
        <Text style={live ? styles.badgeLive : styles.badge}>{badge}</Text>
        <Text numberOfLines={2} style={styles.name}>{name}</Text>
        {host ? <Text numberOfLines={1} style={styles.host}>{host}</Text> : null}
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );
}

/** A Control Room programme as a card. */
export function ShowLineupCard({ show, badge, live }: { show: Show; badge: string; live?: boolean }) {
  return (
    <LineupCard
      badge={badge}
      live={live}
      name={show.name}
      host={show.hostName}
      time={formatShowTime(show.startMinute, show.endMinute)}
      imageUrl={show.imageUrl}
    />
  );
}

/**
 * The single sideways-scrolling row. The negative margin cancels the screen's 20px side padding
 * so the row can run to the screen edge, and the content padding puts the first card back in line.
 */
export function LineupRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { marginHorizontal: -20, marginTop: 4 },
  rowContent: { paddingHorizontal: 20, gap: 12 },
  card: {
    width: 250,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 },
  artwork: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#123363' },
  badgeLive: { color: '#4ADE80', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  badge: { color: '#7890AE', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  name: { color: '#F7F9FC', fontSize: 16, fontWeight: '700' },
  host: { color: '#A7B7CC', fontSize: 13 },
  time: { color: '#7890AE', fontSize: 12, fontWeight: '600' },
});
