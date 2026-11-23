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
 *
 * TAPPING ONE OPENS IT FULL SIZE, here in the app (owner, 2026-11-23: *"i should be able to
 * view the card as an image within the app without showing the link"*). A tile is 232px wide
 * and a card is drawn at 1080 -- the words inside it are simply not readable at that size, so
 * the tile is a thumbnail and the tap is how you read it. The viewer shows the picture and
 * nothing else: no url, no link text, no chrome over the artwork. Where a card HAS a
 * destination it is offered as a button inside the viewer, so the tap that was meant to read
 * the card never navigates away from it by surprise.
 */
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  /* Which card is open full size, by id. Null is closed. */
  const [peeking, setPeeking] = React.useState<number | null>(null);
  const open = cards.find((card) => card.id === peeking) ?? null;
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
          return (
            <View key={card.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setPeeking(card.id)}
                accessibilityRole="button"
                accessibilityLabel={`See ${card.title} full size`}
                style={({ pressed }) => [styles.pictureWrap, { opacity: pressed ? 0.85 : 1 }]}
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

      {/* THE VIEWER. The picture is `contain`, not `cover`: a card cropped to fit the screen
          would cut off the very words the tap was for. Tapping the backdrop closes it, which
          is what every picture viewer on a phone does, and Android's back button closes it
          too via onRequestClose. */}
      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPeeking(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPeeking(null)} accessibilityLabel="Close">
          {open ? (
            <Pressable style={styles.viewer} onPress={() => undefined}>
              <Image
                source={{ uri: open.imageUrl }}
                contentFit="contain"
                style={styles.full}
                accessibilityLabel={open.title}
              />
              <View style={styles.viewerBar}>
                {shareEnabled ? (
                  <Pressable
                    onPress={() => { void shareCardImage(open.caption, open.imageUrl); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${open.title}`}
                    style={[styles.viewerBtn, { backgroundColor: colors.primary }]}
                  >
                    <Feather name="share-2" size={15} color={colors.primaryForeground} />
                    <Text style={[styles.viewerBtnText, { color: colors.primaryForeground }]}>SHARE</Text>
                  </Pressable>
                ) : null}
                {destinationRoute(open.dest) ? (
                  <Pressable
                    onPress={() => {
                      const route = destinationRoute(open.dest);
                      setPeeking(null);
                      if (route) router.push(route as never);
                    }}
                    accessibilityRole="button"
                    style={[styles.viewerBtn, { borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Feather name="arrow-right" size={15} color={colors.foreground} />
                    <Text style={[styles.viewerBtnText, { color: colors.foreground }]}>OPEN</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setPeeking(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={[styles.viewerBtn, { borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Feather name="x" size={15} color={colors.foreground} />
                  <Text style={[styles.viewerBtnText, { color: colors.foreground }]}>CLOSE</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  viewer: { width: '100%', alignItems: 'center', gap: 16 },
  full: { width: '100%', aspectRatio: 1, maxHeight: '78%' },
  viewerBar: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  viewerBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  viewerBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
});
