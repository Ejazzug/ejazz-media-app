/**
 * THE CARD RAIL ON HOME, straight after Now Playing.
 *
 * Owner, 2026-11-23: *"cards should appear on the home page after the now playing section, it
 * should show a maximum of 3 of the latest cards and not from the same category"*.
 *
 * The rail draws; it decides nothing. Which three cards it shows is `selectHomeCards`
 * (lib/homeCards.ts), and how many is the Control Room's (`homeCards` in the app config), so
 * the rule and the limits can be read and changed without touching a screen.
 *
 * A card IS its picture -- the words were drawn into the image by the Control Room -- so the
 * tile is the picture, the title under it is for anyone who cannot see it, and the share
 * carries the picture itself with the operator's caption beside it.
 */
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAppConfig } from '@/lib/appConfig';
import { destinationRoute } from '@/lib/destination';
import { selectHomeCards } from '@/lib/homeCards';
import type { PulseContentItem } from '@/lib/pulse';
import { useShareApp } from '@/lib/shareApp';

export function HomeCardRail({ items }: { items: ReadonlyArray<PulseContentItem> }) {
  const colors = useColors();
  const router = useRouter();
  const { homeCards } = useAppConfig();
  const { enabled: shareEnabled, shareCardImage } = useShareApp();
  const cards = React.useMemo(
    () => (homeCards.enabled ? selectHomeCards(items, homeCards) : []),
    [homeCards, items],
  );
  // Nothing to show renders NOTHING -- no heading, no empty box. A rail that announces itself
  // and then has nothing in it reads as a fault on the one screen everybody opens first.
  if (cards.length === 0) return null;

  return (
    <>
      <View style={styles.heading}>
        <Text style={[styles.headingText, { color: colors.foreground }]}>{homeCards.heading}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        // One card is not a carousel: without this a single card sits left-aligned under a
        // heading with a wide empty space beside it.
        style={styles.railOuter}
      >
        {cards.map((card) => {
          const route = destinationRoute(card.dest);
          return (
            <View key={card.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => { if (route) router.push(route as never); }}
                disabled={!route}
                accessibilityRole={route ? 'button' : 'image'}
                accessibilityLabel={card.title}
                style={({ pressed }) => [styles.pictureWrap, { opacity: pressed && route ? 0.85 : 1 }]}
              >
                <Image source={{ uri: card.imageUrl }} contentFit="cover" style={styles.picture} transition={150} />
              </Pressable>
              <View style={styles.meta}>
                {card.stationLabel ? (
                  <Text style={[styles.station, { color: colors.accent }]} numberOfLines={1}>
                    {card.stationLabel.toUpperCase()}
                  </Text>
                ) : null}
                <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
                  {card.title}
                </Text>
                {shareEnabled ? (
                  <Pressable
                    onPress={() => { void shareCardImage(card.caption, card.imageUrl); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${card.title}`}
                    style={styles.shareRow}
                  >
                    <Feather name="share-2" size={13} color={colors.primary} />
                    <Text style={[styles.shareLabel, { color: colors.primary }]}>SHARE</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  headingText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  railOuter: { marginBottom: 4 },
  rail: { paddingHorizontal: 20, gap: 12 },
  card: { width: 232, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  pictureWrap: { width: '100%', aspectRatio: 1 },
  picture: { width: '100%', height: '100%' },
  meta: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 4 },
  station: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  shareLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
});
