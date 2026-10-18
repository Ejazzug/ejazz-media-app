import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark, MINI_PLAYER_CLEARANCE, PlayButton, StationCard, StoryCard } from '@/components/MediaComponents';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';
import { useFeaturedNews, useLatestNews } from '@/lib/news';
import { usePulseContent } from '@/lib/pulse';
import { useShows, classifyLineup, showStationFor } from '@/lib/shows';
import { LineupRow, ShowLineupCard } from '@/components/LineupCard';
import { ShareAppButton } from '@/components/ShareAppButton';
import { useShareApp } from '@/lib/shareApp';
import { FreshEjazzSection } from '@/components/FreshEjazzSection';
import { ContinueEjazzSection } from '@/components/ContinueEjazzSection';
import { TheTeaSection } from '@/components/TheTeaSection';
import { FeaturedCard, PromoBanner, SponsorSlot, UpdateBanner } from '@/components/RemoteControls';
import { useAppConfig } from '@/lib/appConfig';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { features, links } = useAppConfig();
  const { activeStation, isPlaying, stations, togglePlayback } = usePlayer();
  const featured = useFeaturedNews();
  const latest = useLatestNews();
  const stories = [
    ...(featured.data ?? []),
    ...(latest.data?.pages.flatMap((page) => page.stories) ?? []),
  ].filter((story, index, all) => all.findIndex((item) => item.id === story.id) === index);
  const pulseContent = usePulseContent();
  // "Clock it" is for the fun fact only, and only ever one: the newest live fact. To change what
  // it says, publish a newer fact in the Control Room. Announcements, quizzes and alerts reach
  // people as notifications and no longer appear here.
  const funFact =
    (pulseContent.data ?? [])
      .filter((item) => item.type === 'fact')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  const showsQuery = useShows();
  const lineup = classifyLineup(showsQuery.data ?? [], new Date(), showStationFor(activeStation.id));
  const { shareWithLink } = useShareApp();
  const handleSharePulse = (item: { title: string; body: string | null }) => {
    const suffix = links.shareText || 'via EJazz Media';
    shareWithLink(item.body ? `${item.title}\n\n${item.body}\n\n${suffix}` : `${item.title}\n\n${suffix}`);
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
          <View style={styles.topActions}>
            <ShareAppButton style={styles.iconButton} />
            <Pressable
              onPress={() => router.push('/more')}
              accessibilityRole="button"
              accessibilityLabel="Open more"
              style={styles.iconButton}
            >
              <Feather name="more-horizontal" size={22} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <UpdateBanner />
        <PromoBanner />

        <View style={styles.hero}>
          <Text style={styles.heroKicker}>EJAZZ MEDIA</Text>
          <Text style={styles.heroTitle}>What's The EJazz? 👋</Text>
          <Text style={styles.heroCopy}>Radio, culture &amp; the stories everyone's talking about — all in one app.</Text>
        </View>

        <FeaturedCard />

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

        {features.pulse && funFact ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>EJazz Pulse</Text>
            </View>
            <View style={styles.pulseList}>
              <View style={styles.pulseCard}>
                <Text style={styles.pulseCardKicker}>CLOCK IT</Text>
                <Text style={styles.pulseCardTitle}>{funFact.title}</Text>
                {funFact.body ? <Text style={styles.pulseCardBody}>{funFact.body}</Text> : null}
                {features.share ? (
                  <Pressable onPress={() => handleSharePulse(funFact)} hitSlop={8} style={styles.pulseShareBtn}>
                    <Text style={styles.pulseShareLabel}>SHARE THE EJAZZ</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        {/* <ContinueEjazzSection /> - temporarily hidden until backend is ready; re-enable for a future release */}

        {features.schedule && (lineup.now || lineup.next) ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Coming Up</Text>
            </View>
            <LineupRow>
              {lineup.now ? <ShowLineupCard show={lineup.now} badge="LIVE NOW" live /> : null}
              {lineup.next ? <ShowLineupCard show={lineup.next} badge="NEXT" /> : null}
              {lineup.later.map((show) => (
                <ShowLineupCard key={show.id} show={show} badge="LATER" />
              ))}
            </LineupRow>
          </>
        ) : null}

        {features.news ? (
          <>
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
          </>
        ) : null}

        <SponsorSlot />

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
  topActions: { flexDirection: 'row', alignItems: 'center' },
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
});
