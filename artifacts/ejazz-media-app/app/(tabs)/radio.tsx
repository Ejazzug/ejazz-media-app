import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayButton } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import { usePlayer } from '@/context/PlayerContext';

export default function RadioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    activeStation,
    isPlaying,
    isBuffering,
    streamError,
    stations,
    selectedStationId,
    selectStation,
    togglePlayback,
    retryPlayback,
  } = usePlayer();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 150 }}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>EJAZZ LIVE</Text>
          <Text style={styles.title}>Radio</Text>
          <Pressable
            onPress={() => Share.share({ message: `Listen live on ${activeStation.name} — EJazz Media App` })}
            accessibilityRole="button"
            accessibilityLabel="Share station"
            style={styles.shareButton}
          >
            <Feather name="share-2" size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.switcher}>
          {stations.map((station) => {
            const selected = station.id === selectedStationId;
            return (
              <Pressable
                key={station.id}
                onPress={() => selectStation(station.id)}
                style={[styles.switcherItem, selected && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.switcherText, selected && { color: colors.primaryForeground }]}>
                  {station.shortName}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.playerArtworkWrap}>
          <Image source={activeStation.artwork} contentFit="cover" style={styles.playerArtwork} />
          <LinearGradient colors={['transparent', 'rgba(7,8,11,0.72)']} style={StyleSheet.absoluteFill} />
          <View style={styles.artworkLive}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.liveText}>LIVE NOW</Text>
          </View>
          <View style={styles.artworkStation}>
            <Text style={styles.artworkStationName}>{activeStation.name}</Text>
            <Text style={styles.artworkStationDescription}>{activeStation.genre}</Text>
          </View>
        </View>

        <View style={styles.trackBlock}>
          <Text style={styles.trackEyebrow}>ON AIR</Text>
          <Text style={styles.trackTitle}>EJazz live session</Text>
          <Text style={styles.trackArtist}>{activeStation.description}</Text>
        </View>

        {streamError && (
          <View style={styles.errorBox}>
            <Feather name="wifi-off" size={17} color={colors.accent} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Unable to connect to the live stream.</Text>
              <Text style={styles.errorSubtext}>Trying again when you are ready.</Text>
            </View>
            <Pressable onPress={retryPlayback} hitSlop={10}>
              <Text style={styles.retry}>RETRY</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.controls}>
          <Pressable style={styles.secondaryControl} onPress={() => Share.share({ message: `Listen to ${activeStation.name}` })}>
            <Feather name="share-2" size={19} color={colors.mutedForeground} />
            <Text style={styles.controlText}>Share</Text>
          </Pressable>
          <PlayButton playing={isPlaying} onPress={togglePlayback} loading={isBuffering} />
          <View style={styles.secondaryControl}>
            <Feather name="volume-2" size={19} color={colors.mutedForeground} />
            <Text style={styles.controlText}>Volume</Text>
          </View>
        </View>

        <View style={styles.backgroundNote}>
          <Feather name="headphones" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>Keep listening</Text>
            <Text style={styles.noteText}>Audio continues while you explore EJazz News.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 22 },
  eyebrow: { color: '#F2B86B', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 7 },
  title: { color: '#F5F1E9', fontSize: 34, fontWeight: '700', letterSpacing: -1.2 },
  shareButton: { position: 'absolute', right: 20, bottom: 5, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#303643' },
  switcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 20 },
  switcherItem: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#303643' },
  switcherText: { color: '#9298A6', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  playerArtworkWrap: { height: 370, marginHorizontal: 20, overflow: 'hidden', backgroundColor: '#13161E' },
  playerArtwork: { ...StyleSheet.absoluteFill },
  artworkLive: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(7,8,11,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: '#F5F1E9', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  artworkStation: { position: 'absolute', bottom: 18, left: 18 },
  artworkStationName: { color: '#F5F1E9', fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  artworkStationDescription: { color: '#F2B86B', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, marginTop: 5 },
  trackBlock: { paddingHorizontal: 20, paddingTop: 25 },
  trackEyebrow: { color: '#3E79FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  trackTitle: { color: '#F5F1E9', fontSize: 22, fontWeight: '700', marginTop: 8 },
  trackArtist: { color: '#9298A6', fontSize: 14, marginTop: 5 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: 20, marginTop: 20, padding: 14, borderWidth: 1, borderColor: '#4B3B2A', backgroundColor: '#211B16' },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: '#F5F1E9', fontSize: 12, fontWeight: '600' },
  errorSubtext: { color: '#9298A6', fontSize: 11 },
  retry: { color: '#F2B86B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 52, paddingVertical: 30 },
  secondaryControl: { alignItems: 'center', gap: 6, minWidth: 50 },
  controlText: { color: '#9298A6', fontSize: 10 },
  backgroundNote: { flexDirection: 'row', alignItems: 'center', gap: 13, marginHorizontal: 20, padding: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#282D38' },
  noteTitle: { color: '#F5F1E9', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  noteText: { color: '#9298A6', fontSize: 12, lineHeight: 18 },
});