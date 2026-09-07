import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark, PlayButton, StationCard, StoryCard } from '@/components/MediaComponents';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';
import { useFeaturedNews, useLatestNews } from '@/lib/news';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeStation, isPlaying, stations, togglePlayback } = usePlayer();
  const featured = useFeaturedNews();
  const latest = useLatestNews();
  const stories = [
    ...(featured.data ?? []),
    ...(latest.data?.pages.flatMap((page) => page.stories) ?? []),
  ].filter((story, index, all) => all.findIndex((item) => item.id === story.id) === index);
  const isLoading = featured.isLoading || latest.isLoading;
  const isError = featured.isError && latest.isError;
  const retryNews = () => {
    featured.refetch();
    latest.refetch();
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.background, colors.gradientEnd]} style={styles.screen}>
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
          <Text style={styles.heroTitle}>Your Vibe.{'\n'}Your News.{'\n'}Your EJazz.</Text>
          <Text style={styles.heroCopy}>Radio, culture &amp; the stories that matter - all in one app.</Text>
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

        {isLoading ? (
          <View style={styles.newsStatus}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.newsStatusText}>Loading the latest stories…</Text>
          </View>
        ) : isError ? (
          <Pressable onPress={retryNews} style={styles.newsStatus}>
            <Text style={styles.newsStatusTitle}>Couldn’t load stories right now.</Text>
            <Text style={styles.sectionLink}>TAP TO RETRY</Text>
          </Pressable>
        ) : stories.length > 0 ? (
          <>
            <StoryCard story={stories[0]} featured />
            <View style={styles.storyList}>
              {stories.slice(1, 3).map((story) => <StoryCard key={story.id} story={story} />)}
            </View>
          </>
        ) : (
          <Text style={styles.newsStatusText}>No stories have been published yet.</Text>
        )}

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>EJAZZ MEDIA</Text>
          <Text style={styles.footerSubtext}>AT40 • POP • INDIE • AFRICAN POP</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 144 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: 42, paddingBottom: 35 },
  heroKicker: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 15 },
  heroTitle: { color: '#F7F9FC', fontSize: 40, lineHeight: 40, fontWeight: '700', letterSpacing: -1.6 },
  heroCopy: { color: '#A7B7CC', fontSize: 15, lineHeight: 22, marginTop: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  sectionLink: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  stationList: { gap: 12 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#204570' },
  nowPlayingMark: { width: 4, height: 35 },
  nowPlayingCopy: { flex: 1 },
  nowPlayingLabel: { color: '#A7B7CC', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  nowPlayingTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '600' },
  latestHeading: { marginTop: 20 },
  storyList: { gap: 20, marginTop: 22 },
  newsStatus: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 24 },
  newsStatusTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  newsStatusText: { color: '#A7B7CC', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  footerNote: { alignItems: 'center', paddingTop: 46, gap: 7 },
  footerText: { color: '#F7F9FC', fontSize: 12, fontWeight: '700', letterSpacing: 2.2 },
  footerSubtext: { color: '#7890AE', fontSize: 9, fontWeight: '600', letterSpacing: 1.1 },
});
