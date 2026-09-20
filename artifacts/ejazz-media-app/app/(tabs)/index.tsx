import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark, MINI_PLAYER_CLEARANCE, PlayButton, StationCard, StoryCard } from '@/components/MediaComponents';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';
import { useFeaturedNews, useLatestNews } from '@/lib/news';
import { usePulseContent } from '@/lib/pulse';
import { useShows, classifyLineup, formatShowTime } from '@/lib/shows';
import { FreshEjazzSection } from '@/components/FreshEjazzSection';
import { ContinueEjazzSection } from '@/components/ContinueEjazzSection';
import { TheTeaSection } from '@/components/TheTeaSection';

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
  const pulseContent = usePulseContent();
  const pulseItems = (pulseContent.data ?? []).filter((item) => item.type !== 'poll');
  const showsQuery = useShows();
  const lineup = classifyLineup(showsQuery.data ?? []);
  const handleSharePulse = (item: { title: string; body: string | null }) => {
    Share.share({ message: item.body ? `${item.title}\n\n${item.body}\n\nvia EJazz Media` : `${item.title}\n\nvia EJazz Media` }).catch(() => {});
  };
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom }]}
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
          <Text style={styles.heroKicker}>EJAZZ MEDIA</Text>
          <Text style={styles.heroTitle}>What's The EJazz? 👋</Text>
          <Text style={styles.heroCopy}>Radio, culture &amp; the stories everyone's talking about — all in one app.</Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.listenLiveTitle}>Listen live</Text>
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

        {/* <FreshEjazzSection /> - temporarily hidden until backend is ready; re-enable for a future release */}

        {pulseItems.length > 0 ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>EJazz Pulse</Text>
            </View>
            <View style={styles.pulseList}>
              {pulseItems.map((item) => (
                <View key={item.id} style={styles.pulseCard}>
                  <Text style={styles.pulseCardKicker}>CLOCK IT</Text>
                  <Text style={styles.pulseCardTitle}>{item.title}</Text>
                  {item.body ? <Text style={styles.pulseCardBody}>{item.body}</Text> : null}
                  <Pressable onPress={() => handleSharePulse(item)} hitSlop={8} style={styles.pulseShareBtn}>
                    <Text style={styles.pulseShareLabel}>SHARE THE EJAZZ</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* <ContinueEjazzSection /> - temporarily hidden until backend is ready; re-enable for a future release */}

        {lineup.now || lineup.next ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Coming Up</Text>
            </View>
            <View style={styles.lineupList}>
              {lineup.now ? (
                <View style={styles.lineupCard}>
                  <Text style={styles.lineupBadgeLive}>LIVE NOW</Text>
                  <Text style={styles.lineupShowName}>{lineup.now.name}</Text>
                  {lineup.now.hostName ? <Text style={styles.lineupHost}>{lineup.now.hostName}</Text> : null}
                  <Text style={styles.lineupTime}>{formatShowTime(lineup.now.startMinute, lineup.now.endMinute)}</Text>
                </View>
              ) : null}
              {lineup.next ? (
                <View style={styles.lineupCard}>
                  <Text style={styles.lineupBadge}>NEXT</Text>
                  <Text style={styles.lineupShowName}>{lineup.next.name}</Text>
                  {lineup.next.hostName ? <Text style={styles.lineupHost}>{lineup.next.hostName}</Text> : null}
                  <Text style={styles.lineupTime}>{formatShowTime(lineup.next.startMinute, lineup.next.endMinute)}</Text>
                </View>
              ) : null}
              {lineup.later.map((show) => (
                <View key={show.id} style={styles.lineupCard}>
                  <Text style={styles.lineupBadge}>LATER</Text>
                  <Text style={styles.lineupShowName}>{show.name}</Text>
                  {show.hostName ? <Text style={styles.lineupHost}>{show.hostName}</Text> : null}
                  <Text style={styles.lineupTime}>{formatShowTime(show.startMinute, show.endMinute)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={[styles.sectionHeading, styles.latestHeading]}>
          <Text style={styles.sectionTitle}>The Latest EJazz</Text>
          <Pressable onPress={() => router.push('/news')} hitSlop={8}>
            <Text style={styles.sectionLink}>E-JAZZ IT</Text>
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

        <TheTeaSection />

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
  listenLiveTitle: { color: '#F7F9FC', fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  sectionLink: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  stationList: { flexDirection: 'row', gap: 12 },
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
  pulseList: { gap: 12, marginTop: 4 },
  pulseCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 6,
  },
  pulseCardKicker: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  pulseCardTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '700' },
  pulseCardBody: { color: '#A7B7CC', fontSize: 13, lineHeight: 19 },
  pulseShareBtn: { alignSelf: 'flex-start', marginTop: 4 },
  pulseShareLabel: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  lineupList: { gap: 12, marginTop: 4 },
  lineupCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  lineupBadgeLive: { color: '#4ADE80', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  lineupBadge: { color: '#7890AE', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  lineupShowName: { color: '#F7F9FC', fontSize: 16, fontWeight: '700' },
  lineupHost: { color: '#A7B7CC', fontSize: 13 },
  lineupTime: { color: '#7890AE', fontSize: 12, fontWeight: '600' },
});
