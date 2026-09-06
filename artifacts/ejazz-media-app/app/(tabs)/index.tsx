import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark, PlayButton, StationCard, StoryCard, stories } from '@/components/MediaComponents';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeStation, isPlaying, stations, togglePlayback } = usePlayer();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}
      >
        <View style={styles.topRow}>
          <EJazzWordmark />
          <Pressable
            onPress={() => router.push('/more')}
            accessibilityRole="button"
            accessibilityLabel="Open more"
            style={styles.iconButton}
          >
            <Feather name="more-horizontal" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroKicker}>THE OFFICIAL APP OF EJAZZ MEDIA</Text>
          <Text style={styles.heroTitle}>Listen.{'\n'}Read.{'\n'}Discover.</Text>
          <Text style={styles.heroCopy}>Radio, stories and culture — in one place.</Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Listen live</Text>
          <Pressable onPress={() => router.push('/radio')} hitSlop={8}>
            <Text style={styles.sectionLink}>OPEN RADIO</Text>
          </Pressable>
        </View>

        <View style={styles.stationList}>
          <StationCard station={stations[0]} />
          <StationCard station={stations[1]} />
        </View>

        <View style={styles.nowPlaying}>
          <View style={[styles.nowPlayingMark, { backgroundColor: activeStation.color }]} />
          <View style={styles.nowPlayingCopy}>
            <Text style={styles.nowPlayingLabel}>NOW PLAYING</Text>
            <Text style={styles.nowPlayingTitle}>{activeStation.name}</Text>
          </View>
          <PlayButton playing={isPlaying} onPress={togglePlayback} size="small" />
        </View>

        <View style={[styles.sectionHeading, styles.latestHeading]}>
          <Text style={styles.sectionTitle}>Latest from EJazz</Text>
          <Pressable onPress={() => router.push('/news')} hitSlop={8}>
            <Text style={styles.sectionLink}>SEE ALL</Text>
          </Pressable>
        </View>

        <StoryCard story={stories[0]} featured />
        <View style={styles.storyList}>
          <StoryCard story={stories[1]} />
          <StoryCard story={stories[2]} />
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>EJAZZ MEDIA</Text>
          <Text style={styles.footerSubtext}>AT40 • POP • INDIE • AFRICAN POP</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 150 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: 42, paddingBottom: 35 },
  heroKicker: { color: '#F2B86B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 15 },
  heroTitle: { color: '#F5F1E9', fontSize: 48, lineHeight: 47, fontWeight: '700', letterSpacing: -2.4 },
  heroCopy: { color: '#9298A6', fontSize: 15, lineHeight: 22, marginTop: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F5F1E9', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  sectionLink: { color: '#3E79FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  stationList: { gap: 12 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#282D38' },
  nowPlayingMark: { width: 4, height: 35 },
  nowPlayingCopy: { flex: 1 },
  nowPlayingLabel: { color: '#9298A6', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  nowPlayingTitle: { color: '#F5F1E9', fontSize: 14, fontWeight: '600' },
  latestHeading: { marginTop: 36 },
  storyList: { gap: 20, marginTop: 22 },
  footerNote: { alignItems: 'center', paddingTop: 46, gap: 7 },
  footerText: { color: '#F5F1E9', fontSize: 12, fontWeight: '700', letterSpacing: 2.2 },
  footerSubtext: { color: '#6F7685', fontSize: 9, fontWeight: '600', letterSpacing: 1.1 },
});
