import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
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
  const { activeStation, isPlaying, selectStation, togglePlayback } = usePlayer();
  const colors = useColors();
  const isSelected = station.id === activeStation.id;
  return (
    <Pressable
      onPress={() => {
        if (!isSelected) selectStation(station.id);
        else togglePlayback();
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
        <View style={styles.livePill}>
          <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.stationCardBottom}>
          <View style={styles.stationCopy}>
            <Text style={styles.stationName}>{station.name}</Text>
            <Text style={styles.stationDescription}>{station.genre}</Text>
          </View>
          <PlayButton
            playing={isSelected && isPlaying}
            onPress={() => {
              if (!isSelected) selectStation(station.id);
              else togglePlayback();
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
      style={({ pressed }) => [styles.storyPressable, { opacity: pressed ? 0.88 : 1 }]}
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
  const { activeStation, isPlaying, isBuffering, togglePlayback } = usePlayer();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View style={[styles.miniPlayerWrap, { bottom: 76 + Math.max(insets.bottom, 0) }]}>
      <Pressable onPress={() => router.push('/radio')} style={styles.miniPlayer}>
        <Image source={activeStation.artwork} contentFit="cover" style={styles.miniArtwork} />
        <View style={styles.miniCopy}>
          <View style={styles.miniTitleRow}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.miniLive}>LIVE ON {activeStation.shortName.toUpperCase()}</Text>
          </View>
          <Text numberOfLines={1} style={styles.miniTrack}>
            {activeStation.description} · EJazz live
          </Text>
        </View>
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
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 22, height: 22, transform: [{ skewX: '-16deg' }], justifyContent: 'center' },
  markCut: { width: 13, height: 3, backgroundColor: '#071B3A', alignSelf: 'center' },
  wordmarkText: { color: '#F7F9FC', fontSize: 18, fontWeight: '700', letterSpacing: 3.4 },
  wordmarkCompact: { fontSize: 14, letterSpacing: 2.4 },
  playButton: { alignItems: 'center', justifyContent: 'center' },
  stationCard: { height: 220, borderWidth: 1, overflow: 'hidden', backgroundColor: '#0D2A57' },
  stationArtwork: { ...StyleSheet.absoluteFill, opacity: 0.75 },
  stationCardContent: { flex: 1, justifyContent: 'space-between', padding: 16 },
  livePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(7,8,11,0.7)' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { color: '#F7F9FC', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  stationCardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  stationCopy: { flex: 1, paddingRight: 12 },
  stationName: { color: '#F7F9FC', fontSize: 23, fontWeight: '700', letterSpacing: -0.7 },
  stationDescription: { color: '#FF6B6B', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 6 },
  storyPressable: { flexDirection: 'row', gap: 14 },
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
  miniArtwork: { width: 42, height: 42 },
  miniCopy: { flex: 1, gap: 3 },
  miniTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniLive: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  miniTrack: { color: '#F7F9FC', fontSize: 12, fontWeight: '600' },
  miniPlay: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  screenHeader: { paddingHorizontal: 20, paddingBottom: 18, gap: 21 },
  headerEyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 5 },
  headerTitle: { color: '#F7F9FC', fontSize: 32, fontWeight: '700', letterSpacing: -1.2 },
});