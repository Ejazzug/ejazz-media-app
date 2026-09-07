import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Station, usePlayer } from '@/context/PlayerContext';
import { Story } from '@/lib/news';

export function PlayingEqualizer({
  playing,
  compact = false,
}: {
  playing: boolean;
  compact?: boolean;
}) {
  const bars = React.useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.7),
    new Animated.Value(0.45),
    new Animated.Value(0.8),
  ]).current;

  React.useEffect(() => {
    if (!playing) {
      bars.forEach((bar) => {
        bar.stopAnimation();
        bar.setValue(0.35);
      });
      return;
    }
    const loops = bars.map((bar, index) => Animated.loop(
      Animated.sequence([
        Animated.timing(bar, {
          toValue: index % 2 === 0 ? 1 : 0.65,
          duration: 280 + index * 65,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(bar, {
          toValue: index % 2 === 0 ? 0.4 : 0.25,
          duration: 320 + index * 55,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [bars, playing]);

  if (!playing) return null;
  return (
    <View
      accessibilityLabel="Live audio playing"
      style={[styles.equalizer, compact && styles.equalizerCompact]}
    >
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.equalizerBar,
            compact && styles.equalizerBarCompact,
            { transform: [{ scaleY: bar }] },
          ]}
        />
      ))}
    </View>
  );
}

export function EditorialPlaceholder({
  style,
  label = 'EJAZZ NEWS',
}: {
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  return (
    <LinearGradient colors={['#173A68', '#091B3A', '#3A132C']} style={[styles.editorialPlaceholder, style]}>
      <View style={styles.placeholderMark}>
        <View style={styles.placeholderCut} />
      </View>
      <View>
        <Text style={styles.placeholderLabel}>{label}</Text>
        <Text style={styles.placeholderTitle}>STORIES{'\n'}THAT MOVE</Text>
      </View>
      <View style={styles.placeholderRule} />
    </LinearGradient>
  );
}

export function EJazzWordmark({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.wordmark}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <View style={styles.markCut} />
      </View>
      <Text style={[styles.wordmarkText, compact && styles.wordmarkCompact]}>EJAZZ</Text>
    </View>
  );
}

export function PlayButton({
  playing,
  onPress,
  size = 'large',
  loading = false,
}: {
  playing: boolean;
  onPress: () => void;
  size?: 'small' | 'large';
  loading?: boolean;
}) {
  const colors = useColors();
  const diameter = size === 'large' ? 64 : 42;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause live stream' : 'Play live stream'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.playButton,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Feather
          name={playing ? 'pause' : 'play'}
          size={size === 'large' ? 24 : 16}
          color={colors.primaryForeground}
          style={playing ? undefined : { marginLeft: 3 }}
        />
      )}
    </Pressable>
  );
}

export function StationCard({ station }: { station: Station }) {
  const { activeStation, isPlaying, playbackKind, selectStation, toggleRadioPlayback } = usePlayer();
  const colors = useColors();
  const isSelected = station.id === activeStation.id;
  return (
    <Pressable
      onPress={() => {
        if (!isSelected) selectStation(station.id);
        else toggleRadioPlayback();
      }}
      style={({ pressed }) => [
        styles.stationCard,
        { borderColor: isSelected ? station.color : colors.border, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Image source={station.artwork} contentFit="cover" style={styles.stationArtwork} />
      <LinearGradient
        colors={['rgba(52,21,46,0.08)', 'rgba(4,17,39,0.97)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.stationCardContent}>
        <View style={styles.stationTopRow}>
          <View style={styles.livePill}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.stationLogoChip}>
            <Image source={station.logo} contentFit="contain" style={styles.stationLogo} />
          </View>
        </View>
        <View style={styles.stationCardBottom}>
          <View style={styles.stationCopy}>
            <Text style={styles.stationName}>{station.name}</Text>
            <Text style={styles.stationDescription}>{station.genre}</Text>
          </View>
          <PlayButton
            playing={playbackKind === 'radio' && isSelected && isPlaying}
            onPress={() => {
              if (!isSelected) selectStation(station.id);
              else toggleRadioPlayback();
            }}
            size="small"
          />
        </View>
      </View>
    </Pressable>
  );
}

export function StoryCard({ story, featured = false }: { story: Story; featured?: boolean }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/article?id=${story.id}`)}
      style={({ pressed }) => [
        styles.storyPressable,
        featured && styles.storyPressableFeatured,
        { opacity: pressed ? 0.88 : 1 },
      ]}
    >
      {story.imageUrl ? (
        <Image
          source={story.imageUrl}
          contentFit="cover"
          transition={180}
          style={[styles.storyImage, featured && styles.storyImageFeatured]}
        />
      ) : (
        <EditorialPlaceholder
          label={story.category}
          style={[styles.storyImage, featured && styles.storyImageFeatured]}
        />
      )}
      <View style={styles.storyMeta}>
        <Text style={[styles.storyCategory, { color: colors.accent }]}>{story.category}</Text>
        <Text style={[styles.storyTitle, featured && styles.storyTitleFeatured]}>{story.title}</Text>
        {featured && <Text style={styles.storyExcerpt}>{story.excerpt}</Text>}
        <Text style={styles.storyTime}>{[story.dateLabel, story.time].filter(Boolean).join('  •  ')}</Text>
      </View>
    </Pressable>
  );
}

export function MiniPlayer() {
  const {
    activeStation,
    playbackKind,
    currentPodcast,
    podcastQueue,
    isPlaying,
    isBuffering,
    togglePlayback,
    skipPodcast,
    trackArtist,
    trackTitle,
  } = usePlayer();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isPodcast = playbackKind === 'podcast' && !!currentPodcast;
  return (
    <View style={[styles.miniPlayerWrap, { bottom: 76 + Math.max(insets.bottom, 0) }]}>
      <Pressable
        onPress={() => router.push(
          isPodcast
            ? { pathname: '/radio', params: { mode: 'podcasts' } }
            : '/radio',
        )}
        style={styles.miniPlayer}
      >
        {isPodcast ? (
          currentPodcast.artworkUrl ? (
            <Image source={currentPodcast.artworkUrl} contentFit="cover" style={styles.miniPodcastArtwork} />
          ) : (
            <View style={styles.miniPodcastFallback}>
              <Feather name="mic" size={18} color={colors.accent} />
            </View>
          )
        ) : (
          <View style={styles.miniLogoChip}>
            <Image source={activeStation.logo} contentFit="contain" style={styles.miniLogo} />
          </View>
        )}
        <View style={styles.miniCopy}>
          <View style={styles.miniTitleRow}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text numberOfLines={1} style={styles.miniLive}>
              {isPodcast
                ? `PODCAST · ${currentPodcast.showName}`
                : `LIVE ON ${activeStation.shortName}`}
            </Text>
            <PlayingEqualizer playing={isPlaying} compact />
          </View>
          <Text numberOfLines={1} style={styles.miniTrack}>
            {isPodcast ? currentPodcast.title : `${trackArtist} · ${trackTitle}`}
          </Text>
        </View>
        <View style={styles.miniActions}>
          {isPodcast && podcastQueue.length > 0 && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                skipPodcast();
              }}
              accessibilityLabel={`Play next episode. ${podcastQueue.length} queued`}
              hitSlop={8}
              style={styles.miniNext}
            >
              <Feather name="skip-forward" size={15} color={colors.mutedForeground} />
              <Text style={styles.miniQueueCount}>{podcastQueue.length}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              togglePlayback();
            }}
            hitSlop={10}
            style={styles.miniPlay}
          >
            {isBuffering ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name={isPlaying ? 'pause' : 'play'} size={18} color={colors.primary} />
            )}
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

export function ScreenHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenHeader, { paddingTop: insets.top + 12 }]}>
      <EJazzWordmark compact />
      <View>
        {eyebrow && <Text style={styles.headerEyebrow}>{eyebrow}</Text>}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  equalizer: { height: 16, flexDirection: 'row', alignItems: 'center', gap: 3 },
  equalizerCompact: { height: 10, gap: 2, marginLeft: 2 },
  equalizerBar: { width: 2, height: 14, borderRadius: 1, backgroundColor: '#FF6B6B' },
  equalizerBarCompact: { width: 1.5, height: 9 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 22, height: 22, transform: [{ skewX: '-16deg' }], justifyContent: 'center' },
  markCut: { width: 13, height: 3, backgroundColor: '#071B3A', alignSelf: 'center' },
  wordmarkText: { color: '#F7F9FC', fontSize: 18, fontWeight: '700', letterSpacing: 3.4 },
  wordmarkCompact: { fontSize: 14, letterSpacing: 2.4 },
  playButton: { alignItems: 'center', justifyContent: 'center' },
  stationCard: { height: 220, borderWidth: 1, overflow: 'hidden', backgroundColor: '#0D2A57' },
  stationArtwork: { ...StyleSheet.absoluteFill, opacity: 0.75 },
  stationCardContent: { flex: 1, justifyContent: 'space-between', padding: 16 },
  stationTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  livePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(7,8,11,0.7)' },
  stationLogoChip: { width: 54, height: 42, padding: 5, borderRadius: 8, backgroundColor: '#FFFFFF' },
  stationLogo: { width: '100%', height: '100%' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { color: '#F7F9FC', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  stationCardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  stationCopy: { flex: 1, paddingRight: 12 },
  stationName: { color: '#F7F9FC', fontSize: 23, fontWeight: '700', letterSpacing: -0.7 },
  stationDescription: { color: '#FF6B6B', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 6 },
  storyPressable: { flexDirection: 'row', gap: 14 },
  storyPressableFeatured: { flexDirection: 'column' },
  storyImage: { width: 104, height: 104, backgroundColor: '#163761' },
  storyImageFeatured: { width: '100%', height: 222 },
  editorialPlaceholder: { overflow: 'hidden', padding: 14, justifyContent: 'space-between' },
  placeholderMark: { width: 28, height: 28, backgroundColor: '#E43B48', transform: [{ skewX: '-16deg' }], justifyContent: 'center' },
  placeholderCut: { width: 16, height: 3, backgroundColor: '#091B3A', alignSelf: 'center' },
  placeholderLabel: { color: '#FF6B6B', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  placeholderTitle: { color: '#F7F9FC', fontSize: 14, lineHeight: 15, fontWeight: '700', letterSpacing: -0.4 },
  placeholderRule: { width: '42%', height: 2, backgroundColor: '#E43B48' },
  storyMeta: { flex: 1, justifyContent: 'center' },
  storyCategory: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 7 },
  storyTitle: { color: '#F7F9FC', fontSize: 16, lineHeight: 21, fontWeight: '700' },
  storyTitleFeatured: { fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  storyExcerpt: { color: '#A7B7CC', fontSize: 13, lineHeight: 19, marginTop: 9 },
  storyTime: { color: '#7890AE', fontSize: 10, fontWeight: '600', letterSpacing: 1.1, marginTop: 10 },
  miniPlayerWrap: { position: 'absolute', left: 12, right: 12, zIndex: 20 },
  miniPlayer: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 8, paddingRight: 12, backgroundColor: '#102B55', borderWidth: 1, borderColor: '#2C4B75' },
  miniLogoChip: { width: 42, height: 42, padding: 4, borderRadius: 8, backgroundColor: '#FFFFFF' },
  miniLogo: { width: '100%', height: '100%' },
  miniPodcastArtwork: { width: 42, height: 42, borderRadius: 7, backgroundColor: '#123363' },
  miniPodcastFallback: { width: 42, height: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123363' },
  miniCopy: { flex: 1, gap: 3 },
  miniTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniLive: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  miniTrack: { color: '#F7F9FC', fontSize: 12, fontWeight: '600' },
  miniActions: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniNext: { minWidth: 34, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  miniQueueCount: { color: '#A7B7CC', fontSize: 8, fontWeight: '700' },
  miniPlay: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  screenHeader: { paddingHorizontal: 20, paddingBottom: 18, gap: 21 },
  headerEyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 5 },
  headerTitle: { color: '#F7F9FC', fontSize: 32, fontWeight: '700', letterSpacing: -1.2 },
});