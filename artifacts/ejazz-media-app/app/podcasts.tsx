import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark } from '@/components/MediaComponents';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';
import {
  PODCAST_SHOWS,
  PodcastEpisode,
  PodcastSlug,
  usePodcastFeed,
} from '@/lib/podcasts';

export default function PodcastsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedShow, setSelectedShow] = React.useState<PodcastSlug | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = React.useState<string | null>(null);
  const [playbackError, setPlaybackError] = React.useState(false);
  const xtreme = usePodcastFeed('xtreme-bpm');
  const finance = usePodcastFeed('finance-future-tech');
  const podcastPlayer = useAudioPlayer(null, {
    updateInterval: 800,
    keepAudioSessionActive: true,
  });
  const podcastStatus = useAudioPlayerStatus(podcastPlayer);
  const radio = usePlayer();
  const selectedQuery = selectedShow === 'xtreme-bpm'
    ? xtreme
    : selectedShow === 'finance-future-tech'
      ? finance
      : null;

  React.useEffect(() => {
    if (podcastStatus.error) setPlaybackError(true);
  }, [podcastStatus.error]);

  React.useEffect(() => () => podcastPlayer.pause(), [podcastPlayer]);

  const toggleEpisode = (episode: PodcastEpisode, artworkUrl: string, showName: string) => {
    setPlaybackError(false);
    if (activeEpisodeId === episode.id && podcastStatus.playing) {
      podcastPlayer.pause();
      return;
    }
    if (radio.isPlaying) radio.togglePlayback();
    if (activeEpisodeId !== episode.id) {
      podcastPlayer.replace(episode.audioUrl);
      setActiveEpisodeId(episode.id);
    }
    podcastPlayer.setActiveForLockScreen(
      true,
      {
        title: episode.title,
        artist: showName,
        albumTitle: 'EJazz Podcasts',
        artworkUrl: artworkUrl || undefined,
      },
      { showSeekForward: true, showSeekBackward: true },
    );
    podcastPlayer.play();
  };

  const goBack = () => {
    if (selectedShow) {
      setSelectedShow(null);
      return;
    }
    router.back();
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.background, colors.gradientEnd]} style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 60 }}
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={styles.backButton}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <EJazzWordmark compact />
        </View>

        {!selectedShow ? (
          <>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>EJAZZ ORIGINAL AUDIO</Text>
              <Text style={styles.title}>Podcasts</Text>
              <Text style={styles.introCopy}>Fresh conversations, culture and ideas—ready when you are.</Text>
            </View>
            <View style={styles.showList}>
              {PODCAST_SHOWS.map((config) => {
                const query = config.slug === 'xtreme-bpm' ? xtreme : finance;
                return (
                  <View key={config.slug} style={styles.showCard}>
                    {query.data?.artworkUrl ? (
                      <Image source={query.data.artworkUrl} contentFit="cover" style={styles.showArtwork} />
                    ) : (
                      <View style={styles.showArtworkFallback}>
                        {query.isLoading
                          ? <ActivityIndicator color={colors.primary} />
                          : <Feather name="mic" size={30} color={colors.accent} />}
                      </View>
                    )}
                    <View style={styles.showCopy}>
                      <Text style={styles.showTitle}>{config.name}</Text>
                      {query.data && (
                        <>
                          <Text numberOfLines={3} style={styles.showDescription}>{query.data.description}</Text>
                          <Text style={styles.episodeCount}>{query.data.episodes.length} LATEST EPISODES</Text>
                        </>
                      )}
                      {query.isError && (
                        <Pressable onPress={() => query.refetch()}>
                          <Text style={styles.errorText}>Couldn’t load this show. TAP TO RETRY</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => setSelectedShow(config.slug)}
                        disabled={!query.data}
                        style={({ pressed }) => [styles.openShow, { opacity: !query.data ? 0.4 : pressed ? 0.7 : 1 }]}
                      >
                        <Text style={styles.openShowText}>VIEW EPISODES</Text>
                        <Feather name="arrow-right" size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : selectedQuery?.isLoading ? (
          <View style={styles.fullStatus}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>Loading episodes…</Text>
          </View>
        ) : selectedQuery?.isError || !selectedQuery?.data ? (
          <Pressable onPress={() => selectedQuery?.refetch()} style={styles.fullStatus}>
            <Feather name="wifi-off" size={24} color={colors.accent} />
            <Text style={styles.statusTitle}>Couldn’t load this podcast right now.</Text>
            <Text style={styles.errorText}>TAP TO RETRY</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.showHero}>
              {selectedQuery.data.artworkUrl ? (
                <Image source={selectedQuery.data.artworkUrl} contentFit="cover" style={styles.heroArtwork} />
              ) : (
                <View style={styles.heroArtworkFallback}><Feather name="mic" size={42} color={colors.accent} /></View>
              )}
              <Text style={styles.eyebrow}>EJAZZ PODCASTS</Text>
              <Text style={styles.showHeroTitle}>{selectedQuery.data.name}</Text>
              <Text style={styles.showHeroDescription}>{selectedQuery.data.description}</Text>
            </View>
            {playbackError && (
              <View style={styles.playbackError}>
                <Text style={styles.statusText}>This episode couldn’t play. Try again in a moment.</Text>
              </View>
            )}
            <View style={styles.episodeList}>
              {selectedQuery.data.episodes.map((episode, index) => {
                const playing = activeEpisodeId === episode.id && podcastStatus.playing;
                const loading = activeEpisodeId === episode.id && podcastStatus.isBuffering;
                return (
                  <View key={episode.id} style={styles.episodeRow}>
                    <Text style={styles.episodeNumber}>{String(index + 1).padStart(2, '0')}</Text>
                    <View style={styles.episodeCopy}>
                      <Text style={styles.episodeDate}>{episode.dateLabel}</Text>
                      <Text style={styles.episodeTitle}>{episode.title}</Text>
                    </View>
                    <Pressable
                      onPress={() => toggleEpisode(
                        episode,
                        selectedQuery.data.artworkUrl,
                        selectedQuery.data.name,
                      )}
                      accessibilityLabel={`${playing ? 'Pause' : 'Play'} ${episode.title}`}
                      style={styles.episodePlay}
                    >
                      {loading
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Feather name={playing ? 'pause' : 'play'} size={17} color={colors.primary} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C4B75' },
  intro: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 28 },
  eyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: '#F7F9FC', fontSize: 40, fontWeight: '700', letterSpacing: -1.6 },
  introCopy: { color: '#A7B7CC', fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 320 },
  showList: { paddingHorizontal: 20, gap: 18 },
  showCard: { overflow: 'hidden', borderWidth: 1, borderColor: '#204570', backgroundColor: '#0D2A57' },
  showArtwork: { width: '100%', height: 220, backgroundColor: '#123363' },
  showArtworkFallback: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123363' },
  showCopy: { padding: 17 },
  showTitle: { color: '#F7F9FC', fontSize: 23, fontWeight: '700', letterSpacing: -0.6 },
  showDescription: { color: '#A7B7CC', fontSize: 12, lineHeight: 18, marginTop: 8 },
  episodeCount: { color: '#7890AE', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginTop: 12 },
  openShow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderTopWidth: 1, borderTopColor: '#204570' },
  openShowText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  errorText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 0.7, lineHeight: 16, marginTop: 10 },
  fullStatus: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  statusTitle: { color: '#F7F9FC', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  statusText: { color: '#A7B7CC', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  showHero: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  heroArtwork: { width: '100%', aspectRatio: 1, maxHeight: 350, marginBottom: 20, backgroundColor: '#123363' },
  heroArtworkFallback: { width: '100%', height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 20, backgroundColor: '#123363' },
  showHeroTitle: { color: '#F7F9FC', fontSize: 30, fontWeight: '700', letterSpacing: -1 },
  showHeroDescription: { color: '#A7B7CC', fontSize: 13, lineHeight: 20, marginTop: 10 },
  playbackError: { marginHorizontal: 20, marginBottom: 12, padding: 12, borderWidth: 1, borderColor: '#682B38', backgroundColor: '#2A1A2E' },
  episodeList: { paddingHorizontal: 20 },
  episodeRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#204570', paddingVertical: 12 },
  episodeNumber: { width: 24, color: '#7890AE', fontSize: 10, fontWeight: '700' },
  episodeCopy: { flex: 1 },
  episodeDate: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5 },
  episodeTitle: { color: '#F7F9FC', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  episodePlay: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E43B48' },
});