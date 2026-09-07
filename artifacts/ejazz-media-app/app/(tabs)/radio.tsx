import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayButton } from '@/components/MediaComponents';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { usePlayer } from '@/context/PlayerContext';
import { useExtraSongRequest, useExtraSongSearch, useSongRequest } from '@/lib/radio';

function PlayingEqualizer({ playing }: { playing: boolean }) {
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
          useNativeDriver: true,
        }),
        Animated.timing(bar, {
          toValue: index % 2 === 0 ? 0.4 : 0.25,
          duration: 320 + index * 55,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [bars, playing]);

  if (!playing) return null;
  return (
    <View accessibilityLabel="Live audio playing" style={styles.equalizer}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[styles.equalizerBar, { transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

export default function RadioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [artist, setArtist] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [sender, setSender] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [dedication, setDedication] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [extraSearch, setExtraSearch] = React.useState('');
  const [debouncedExtraSearch, setDebouncedExtraSearch] = React.useState('');
  const request = useSongRequest();
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
    currentTrack,
    previousTracks,
    nextTrack,
    metadataLoading,
    metadataError,
    refreshMetadata,
    trackArtist,
    trackTitle,
  } = usePlayer();
  const isRadio = selectedStationId === 'radio';
  const extraSearchResults = useExtraSongSearch(debouncedExtraSearch, !isRadio);
  const extraRequest = useExtraSongRequest();

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedExtraSearch(extraSearch.trim()), 500);
    return () => clearTimeout(timeout);
  }, [extraSearch]);

  const submitRequest = () => {
    const cleanArtist = artist.trim();
    const cleanTitle = title.trim();
    const cleanSender = sender.trim();
    const cleanEmail = email.trim();
    if (!cleanArtist || !cleanTitle || !cleanSender || !cleanEmail) {
      setFormError('Song title, artist, your name, and email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Enter a valid email address.');
      return;
    }
    setFormError('');
    request.reset();
    request.mutate(
      { artist: cleanArtist, title: cleanTitle, sender: cleanSender, email: cleanEmail, dedication },
      {
        onSuccess: (result) => {
          if (result.success) {
            setArtist('');
            setTitle('');
            setSender('');
            setEmail('');
            setDedication('');
          }
        },
      },
    );
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.background, colors.gradientEnd]} style={styles.screen}>
      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 150 }}
        bottomOffset={24}
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
          <Image
            source={currentTrack?.imageUrl || activeStation.artwork}
            contentFit="cover"
            style={styles.playerArtwork}
          />
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
          <View style={styles.onAirHeading}>
            <Text style={styles.trackEyebrow}>ON AIR</Text>
            <PlayingEqualizer playing={isPlaying} />
          </View>
          {metadataLoading && isRadio && !currentTrack ? (
            <View style={styles.metadataLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.trackArtist}>Finding the current track…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.trackTitle}>{trackTitle}</Text>
              <Text style={styles.trackArtist}>{trackArtist}</Text>
            </>
          )}
          {metadataError && isRadio && !currentTrack && (
            <Pressable onPress={() => refreshMetadata()} style={styles.metadataRetry}>
              <Text style={styles.metadataRetryText}>TRACK INFO UNAVAILABLE · RETRY</Text>
            </Pressable>
          )}
        </View>

        {!isRadio && nextTrack && (
          <View style={styles.nextTrackSection}>
            <Text style={styles.sectionEyebrow}>NEXT UP</Text>
            <View style={styles.nextTrackRow}>
              {nextTrack.imageUrl ? (
                <Image source={nextTrack.imageUrl} contentFit="cover" style={styles.nextTrackArtwork} />
              ) : (
                <View style={styles.nextTrackArtworkFallback}>
                  <Feather name="music" size={20} color={colors.accent} />
                </View>
              )}
              <View style={styles.historyCopy}>
                <Text numberOfLines={1} style={styles.nextTrackTitle}>{nextTrack.title}</Text>
                {!!nextTrack.artist && (
                  <Text numberOfLines={1} style={styles.historyArtist}>{nextTrack.artist}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {previousTracks.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionEyebrow}>PREVIOUS TRACKS</Text>
            {previousTracks.map((track, index) => (
              <View key={`${track.artist}-${track.title}-${index}`} style={styles.historyRow}>
                {track.imageUrl ? (
                  <Image source={track.imageUrl} contentFit="cover" style={styles.historyArtwork} />
                ) : (
                  <View style={styles.historyArtworkFallback}>
                    <Feather name="music" size={16} color={colors.accent} />
                  </View>
                )}
                <View style={styles.historyCopy}>
                  <Text numberOfLines={1} style={styles.historyTitle}>{track.title}</Text>
                  <Text numberOfLines={1} style={styles.historyArtist}>{track.artist}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

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

        {isRadio && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>YOUR SONG, ON AIR</Text>
            <Text style={styles.requestTitle}>Request a track</Text>
            <Text style={styles.requestIntro}>Tell the EJazz team what you want to hear next.</Text>

            <View style={styles.fieldRow}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Song title *"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.halfInput]}
                autoCapitalize="words"
              />
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder="Artist *"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.halfInput]}
                autoCapitalize="words"
              />
            </View>
            <TextInput
              value={sender}
              onChangeText={setSender}
              placeholder="Your name *"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoCapitalize="words"
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email *"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={dedication}
              onChangeText={setDedication}
              placeholder="Dedication (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.dedicationInput]}
              multiline
              textAlignVertical="top"
            />

            {!!formError && <Text style={styles.formError}>{formError}</Text>}
            {request.isError && (
              <View style={styles.requestMessageError}>
                <Feather name="wifi-off" size={16} color={colors.destructive} />
                <Text style={styles.requestMessageText}>The request service is unavailable. Please try again.</Text>
              </View>
            )}
            {request.data && (
              <View style={request.data.success ? styles.requestMessageSuccess : styles.requestMessageError}>
                <Feather
                  name={request.data.success ? 'check-circle' : 'info'}
                  size={16}
                  color={request.data.success ? colors.success : colors.destructive}
                />
                <Text style={styles.requestMessageText}>{request.data.message}</Text>
              </View>
            )}

            <Pressable
              onPress={submitRequest}
              disabled={request.isPending}
              style={({ pressed }) => [
                styles.requestButton,
                { backgroundColor: colors.primary, opacity: pressed || request.isPending ? 0.72 : 1 },
              ]}
            >
              {request.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="send" size={16} color={colors.primaryForeground} />
                  <Text style={styles.requestButtonText}>SEND REQUEST</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {!isRadio && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>FIND IT. REQUEST IT.</Text>
            <Text style={styles.requestTitle}>Request on EJazz Xtra</Text>
            <Text style={styles.requestIntro}>Search the station library, then request the track you want.</Text>
            <View style={styles.searchInputWrap}>
              <Feather name="search" size={17} color={colors.mutedForeground} />
              <TextInput
                value={extraSearch}
                onChangeText={(value) => {
                  setExtraSearch(value);
                  extraRequest.reset();
                }}
                placeholder="Search artist or song"
                placeholderTextColor={colors.mutedForeground}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {extraSearchResults.isFetching && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>

            {extraSearch.length > 0 && extraSearch.trim().length < 3 && (
              <Text style={styles.searchHint}>Type at least 3 characters to search.</Text>
            )}
            {extraSearchResults.isError && (
              <View style={styles.requestMessageError}>
                <Feather name="wifi-off" size={16} color={colors.destructive} />
                <Text style={styles.requestMessageText}>Search is unavailable right now. Please try again.</Text>
              </View>
            )}
            {!!extraSearchResults.data?.message && (
              <Text style={styles.searchHint}>{extraSearchResults.data.message}</Text>
            )}
            {extraSearchResults.data?.tracks.map((track) => (
              <View key={track.id} style={styles.searchResultRow}>
                <Text numberOfLines={2} style={styles.searchResultTitle}>{track.title}</Text>
                <Pressable
                  onPress={() => extraRequest.mutate(track.id)}
                  disabled={extraRequest.isPending}
                  style={({ pressed }) => [
                    styles.resultRequestButton,
                    { opacity: pressed || extraRequest.isPending ? 0.6 : 1 },
                  ]}
                >
                  {extraRequest.isPending && extraRequest.variables === track.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.resultRequestText}>REQUEST</Text>
                  )}
                </Pressable>
              </View>
            ))}

            {extraRequest.isError && (
              <View style={styles.requestMessageError}>
                <Feather name="wifi-off" size={16} color={colors.destructive} />
                <Text style={styles.requestMessageText}>The request could not be sent. Please try again.</Text>
              </View>
            )}
            {extraRequest.data && (
              <View style={extraRequest.data.success ? styles.requestMessageSuccess : styles.requestMessageError}>
                <Feather
                  name={extraRequest.data.success ? 'check-circle' : 'info'}
                  size={16}
                  color={extraRequest.data.success ? colors.success : colors.destructive}
                />
                <Text style={styles.requestMessageText}>{extraRequest.data.message}</Text>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 22 },
  eyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 7 },
  title: { color: '#F7F9FC', fontSize: 34, fontWeight: '700', letterSpacing: -1.2 },
  shareButton: { position: 'absolute', right: 20, bottom: 5, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C4B75' },
  switcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 20 },
  switcherItem: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#2C4B75' },
  switcherText: { color: '#A7B7CC', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  playerArtworkWrap: { height: 370, marginHorizontal: 20, overflow: 'hidden', backgroundColor: '#13161E' },
  playerArtwork: { ...StyleSheet.absoluteFill },
  artworkLive: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(7,8,11,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: '#F5F1E9', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  artworkStation: { position: 'absolute', bottom: 18, left: 18 },
  artworkStationName: { color: '#F7F9FC', fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  artworkStationDescription: { color: '#FF6B6B', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, marginTop: 5 },
  trackBlock: { paddingHorizontal: 20, paddingTop: 25 },
  onAirHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackEyebrow: { color: '#3E79FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  equalizer: { height: 16, flexDirection: 'row', alignItems: 'center', gap: 3 },
  equalizerBar: { width: 2, height: 14, borderRadius: 1, backgroundColor: '#FF6B6B' },
  trackTitle: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', marginTop: 8 },
  trackArtist: { color: '#A7B7CC', fontSize: 14, marginTop: 5 },
  metadataLoading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  metadataRetry: { alignSelf: 'flex-start', marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#E43B48' },
  metadataRetryText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  historySection: { marginHorizontal: 20, marginTop: 26, borderTopWidth: 1, borderTopColor: '#204570', paddingTop: 18 },
  nextTrackSection: { marginHorizontal: 20, marginTop: 22, padding: 14, borderLeftWidth: 2, borderLeftColor: '#E43B48', backgroundColor: '#0D2A57' },
  nextTrackRow: { flexDirection: 'row', alignItems: 'center' },
  nextTrackArtwork: { width: 54, height: 54, backgroundColor: '#123363' },
  nextTrackArtworkFallback: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123363' },
  nextTrackTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '700' },
  sectionEyebrow: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderBottomColor: '#17365E', paddingVertical: 8 },
  historyArtwork: { width: 42, height: 42, backgroundColor: '#123363' },
  historyArtworkFallback: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123363' },
  historyCopy: { flex: 1, marginLeft: 12 },
  historyTitle: { color: '#F7F9FC', fontSize: 13, fontWeight: '700' },
  historyArtist: { color: '#A7B7CC', fontSize: 11, marginTop: 4 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: 20, marginTop: 20, padding: 14, borderWidth: 1, borderColor: '#682B38', backgroundColor: '#2A1A2E' },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: '#F7F9FC', fontSize: 12, fontWeight: '600' },
  errorSubtext: { color: '#A7B7CC', fontSize: 11 },
  retry: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 52, paddingVertical: 30 },
  secondaryControl: { alignItems: 'center', gap: 6, minWidth: 50 },
  controlText: { color: '#A7B7CC', fontSize: 10 },
  backgroundNote: { flexDirection: 'row', alignItems: 'center', gap: 13, marginHorizontal: 20, padding: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#204570' },
  noteTitle: { color: '#F7F9FC', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  noteText: { color: '#A7B7CC', fontSize: 12, lineHeight: 18 },
  requestSection: { marginHorizontal: 20, marginTop: 30, padding: 18, borderWidth: 1, borderColor: '#2C4B75', backgroundColor: 'rgba(13,42,87,0.75)' },
  requestTitle: { color: '#F7F9FC', fontSize: 24, fontWeight: '700', letterSpacing: -0.7 },
  requestIntro: { color: '#A7B7CC', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 18 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  input: { minHeight: 48, marginBottom: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: '#2C4B75', backgroundColor: '#071B3A', color: '#F7F9FC', fontSize: 13 },
  halfInput: { flex: 1, minWidth: 0 },
  dedicationInput: { minHeight: 82, paddingTop: 13 },
  formError: { color: '#FF7A82', fontSize: 12, marginBottom: 10 },
  requestMessageSuccess: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#397A57', backgroundColor: '#102F38' },
  requestMessageError: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#682B38', backgroundColor: '#2A1A2E' },
  requestMessageText: { flex: 1, color: '#F7F9FC', fontSize: 12, lineHeight: 18 },
  requestButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  requestButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  searchInputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, marginBottom: 12, borderWidth: 1, borderColor: '#2C4B75', backgroundColor: '#071B3A' },
  searchInput: { flex: 1, minWidth: 0, color: '#F7F9FC', fontSize: 13 },
  searchHint: { color: '#A7B7CC', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  searchResultRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#204570', paddingVertical: 10 },
  searchResultTitle: { flex: 1, color: '#F7F9FC', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  resultRequestButton: { minWidth: 76, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E43B48' },
  resultRequestText: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
});