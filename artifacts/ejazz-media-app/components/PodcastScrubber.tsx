import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function PodcastScrubber({
  position,
  duration,
  onSeek,
  compact = false,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  compact?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const visiblePosition = dragPosition ?? Math.min(Math.max(position, 0), safeDuration || position);
  const progress = safeDuration > 0 ? visiblePosition / safeDuration : 0;

  useEffect(() => {
    if (safeDuration === 0) setDragPosition(null);
  }, [safeDuration]);

  const positionFromEvent = (locationX: number) => {
    if (width <= 0 || safeDuration <= 0) return 0;
    return Math.min(Math.max(locationX / width, 0), 1) * safeDuration;
  };

  const updateDrag = (locationX: number) => {
    if (safeDuration <= 0) return;
    setDragPosition(positionFromEvent(locationX));
  };

  const finishDrag = (locationX: number) => {
    if (safeDuration <= 0) return;
    const nextPosition = positionFromEvent(locationX);
    setDragPosition(null);
    onSeek(nextPosition);
  };

  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      accessibilityLabel={`Podcast progress. ${formatTime(visiblePosition)} of ${formatTime(safeDuration)}`}
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: 0,
        max: Math.max(Math.round(safeDuration), 1),
        now: Math.round(visiblePosition),
        text: `${formatTime(visiblePosition)} of ${formatTime(safeDuration)}`,
      }}
      style={[styles.container, compact && styles.containerCompact]}
    >
      <View style={styles.timeRow}>
        <Text style={[styles.time, compact && styles.timeCompact]}>{formatTime(visiblePosition)}</Text>
        <Text style={[styles.time, compact && styles.timeCompact]}>{formatTime(safeDuration)}</Text>
      </View>
      <View
        onLayout={handleLayout}
        onMoveShouldSetResponder={() => safeDuration > 0}
        onResponderGrant={(event) => {
          event.stopPropagation();
          updateDrag(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => updateDrag(event.nativeEvent.locationX)}
        onResponderRelease={(event) => {
          event.stopPropagation();
          finishDrag(event.nativeEvent.locationX);
        }}
        onResponderTerminate={() => setDragPosition(null)}
        onStartShouldSetResponder={() => safeDuration > 0}
        style={[styles.touchTrack, compact && styles.touchTrackCompact]}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  containerCompact: { marginTop: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  time: { color: '#A7B7CC', fontSize: 10, fontVariant: ['tabular-nums'] },
  timeCompact: { fontSize: 8 },
  touchTrack: { height: 26, justifyContent: 'center' },
  touchTrackCompact: { height: 18 },
  track: { height: 3, overflow: 'hidden', backgroundColor: '#365379' },
  fill: { height: '100%', backgroundColor: '#FF5A67' },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#F7F9FC',
    backgroundColor: '#E43B48',
  },
});