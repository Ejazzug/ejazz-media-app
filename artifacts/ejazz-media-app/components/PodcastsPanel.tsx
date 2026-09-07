import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer } from '@/context/PlayerContext';
import { useColors } from '@/hooks/useColors';
import {
  PODCAST_SHOWS,
  PodcastSlug,
  usePodcastFeed,
} from '@/lib/podcasts';

export function PodcastsPanel() {
  const colors = useColors();
  const [selectedShow, setSelectedShow] = React.useState<PodcastSlug | null>(null);
  const xtreme = usePodcastFeed('xtreme-bpm');
  const finance = usePodcastFeed('finance-future-tech');
  const {
    playbackKind,
    currentPodcast,
    podcastQueue,
    isPlaying,
    isBuffering,
    playbackError,
    togglePlayback,
    playPodcast,
    enqueuePodcast,
    removeQueuedPodcast,
    skipPodcast,
  } = usePlayer();
  const selectedQuery = selectedShow === 'xtreme-bpm'
    ? xtreme
    : selectedShow === 'finance-future-tech'
      ? finance
      : null;

  if (!selectedShow) {
    return (
      <View style={styles.panel}>
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
                    style={({ pressed }) => [
                      styles.openShow,
                      { opacity: !query.data ? 0.4 : pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.openShowText}>VIEW EPISODES</Text>
                    <Feather name="arrow-right" size={14} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  if (selectedQuery?.isLoading) {
    return (
      <View style={styles.fullStatus}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.statusText}>Loading episodes…</Text>
      </View>
    );
  }

  if (selectedQuery?.isError || !selectedQuery?.data) {
    return (
      <Pressable onPress={() => selectedQuery?.refetch()} style={styles.fullStatus}>
        <Feather name="wifi-off" size={24} color={colors.accent} />
        <Text style={styles.statusTitle}>Couldn’t load this podcast right now.</Text>
        <Text style={styles.errorText}>TAP TO RETRY</Text>
      </Pressable>
    );
  }

  const show = selectedQuery.data;
  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setSelectedShow(null)} style={styles.allShows}>
        <Feather name="arrow-left" size={15} color={colors.primary} />
        <Text style={styles.allShowsText}>ALL SHOWS</Text>
      </Pressable>
      <View style={styles.showHero}>
        {show.artworkUrl ? (
          <Image source={show.artworkUrl} contentFit="cover" style={styles.heroArtwork} />
        ) : (
          <View style={styles.heroArtworkFallback}>
            <Feather name="mic" size={42} color={colors.accent} />
          </View>
        )}
        <Text style={styles.eyebrow}>EJAZZ PODCASTS</Text>
        <Text style={styles.showHeroTitle}>{show.name}</Text>
        <Text style={styles.showHeroDescription}>{show.description}</Text>
      </View>

      {podcastQueue.length > 0 && (
        <View style={styles.queueCard}>
          <View style={styles.queueHeading}>
            <View>
              <Text style={styles.eyebrow}>UP NEXT</Text>
              <Text style={styles.queueTitle}>{podcastQueue.length} queued</Text>
            </View>
            <Pressable onPress={skipPodcast} accessibilityLabel="Play next queued episode" style={styles.skipButton}>
              <Feather name="skip-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>
          {podcastQueue.slice(0, 5).map((episode, index) => (
            <View key={episode.id} style={styles.queueRow}>
              <Text style={styles.queueNumber}>{index + 1}</Text>
              <View style={styles.queueCopy}>
                <Text numberOfLines={1} style={styles.queueEpisode}>{episode.title}</Text>
                <Text numberOfLines={1} style={styles.queueShow}>{episode.showName}</Text>
              </View>
              <Pressable
                onPress={() => removeQueuedPodcast(episode.id)}
                accessibilityLabel={`Remove ${episode.title} from queue`}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {playbackError && (
        <View style={styles.playbackError}>
          <Text style={styles.statusText}>This episode couldn’t play. Try it again in a moment.</Text>
        </View>
      )}

      <View style={styles.episodeList}>
        {show.episodes.map((episode, index) => {
          const isCurrent = playbackKind === 'podcast' && currentPodcast?.id === episode.id;
          const playing = isCurrent && isPlaying;
          const loading = isCurrent && isBuffering;
          const queued = podcastQueue.some((queuedEpisode) => queuedEpisode.id === episode.id);
          return (
            <View key={episode.id} style={styles.episodeRow}>
              <Text style={styles.episodeNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.episodeCopy}>
                <Text style={styles.episodeDate}>{episode.dateLabel}</Text>
                <Text style={styles.episodeTitle}>{episode.title}</Text>
              </View>
              <Pressable
                onPress={() => enqueuePodcast(episode, show)}
                disabled={queued || isCurrent}
                accessibilityLabel={`Add ${episode.title} to queue`}
                style={[styles.queueButton, (queued || isCurrent) && styles.buttonDisabled]}
              >
                <Feather name={queued ? 'check' : 'plus'} size={17} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (isCurrent) togglePlayback();
                  else playPodcast(episode, show);
                }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingBottom: 30 },
  intro: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  eyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 7 },
  title: { color: '#F7F9FC', fontSize: 34, fontWeight: '700', letterSpacing: -1.2 },
  introCopy: { color: '#A7B7CC', fontSize: 13, lineHeight: 20, marginTop: 9, maxWidth: 320 },
  showList: { paddingHorizontal: 20, gap: 18 },
  showCard: { overflow: 'hidden', borderWidth: 1, borderColor: '#204570', backgroundColor: '#0D2A57' },
  showArtwork: { width: '100%', height: 200, backgroundColor: '#123363' },
  showArtworkFallback: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123363' },
  showCopy: { padding: 17 },
  showTitle: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', letterSpacing: -0.6 },
  showDescription: { color: '#A7B7CC', fontSize: 12, lineHeight: 18, marginTop: 8 },
  episodeCount: { color: '#7890AE', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginTop: 12 },
  openShow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderTopWidth: 1, borderTopColor: '#204570' },
  openShowText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  errorText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 0.7, lineHeight: 16, marginTop: 10 },
  fullStatus: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  statusTitle: { color: '#F7F9FC', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  statusText: { color: '#A7B7CC', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  allShows: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginHorizontal: 20, marginBottom: 16 },
  allShowsText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  showHero: { paddingHorizontal: 20, paddingBottom: 20 },
  heroArtwork: { width: '100%', aspectRatio: 1, maxHeight: 340, marginBottom: 20, backgroundColor: '#123363' },
  heroArtworkFallback: { width: '100%', height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 20, backgroundColor: '#123363' },
  showHeroTitle: { color: '#F7F9FC', fontSize: 29, fontWeight: '700', letterSpacing: -1 },
  showHeroDescription: { color: '#A7B7CC', fontSize: 13, lineHeight: 20, marginTop: 10 },
  queueCard: { marginHorizontal: 20, marginBottom: 20, padding: 15, borderWidth: 1, borderColor: '#2C4B75', backgroundColor: '#0D2A57' },
  queueHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  queueTitle: { color: '#F7F9FC', fontSize: 18, fontWeight: '700' },
  skipButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E43B48' },
  queueRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#204570' },
  queueNumber: { width: 16, color: '#7890AE', fontSize: 10, fontWeight: '700' },
  queueCopy: { flex: 1 },
  queueEpisode: { color: '#F7F9FC', fontSize: 12, fontWeight: '600' },
  queueShow: { color: '#A7B7CC', fontSize: 10, marginTop: 3 },
  playbackError: { marginHorizontal: 20, marginBottom: 12, padding: 12, borderWidth: 1, borderColor: '#682B38', backgroundColor: '#2A1A2E' },
  episodeList: { paddingHorizontal: 20 },
  episodeRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#204570', paddingVertical: 12 },
  episodeNumber: { width: 24, color: '#7890AE', fontSize: 10, fontWeight: '700' },
  episodeCopy: { flex: 1 },
  episodeDate: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5 },
  episodeTitle: { color: '#F7F9FC', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  queueButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C4B75' },
  buttonDisabled: { opacity: 0.45 },
  episodePlay: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E43B48' },
});