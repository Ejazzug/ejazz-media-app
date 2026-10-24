import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINI_PLAYER_CLEARANCE, PlayButton, PlayingEqualizer } from '@/components/MediaComponents';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PodcastsPanel } from '@/components/PodcastsPanel';
import { useAppConfig, type RequestStatus } from '@/lib/appConfig';
import { useColors } from '@/hooks/useColors';
import { usePlayer } from '@/context/PlayerContext';
import {
  formatScheduleLength,
  formatScheduleWhen,
  useExtraSchedule,
  useExtraSongRequest,
  useExtraSongSearch,
  useSongRequest,
} from '@/lib/radio';
import { usePastChart, useSongFact, useStationCharts, type StationChart } from '@/lib/stationExtras';
import { classifyLineup, useShows } from '@/lib/shows';
import { LineupCard, LineupRow, ShowLineupCard } from '@/components/LineupCard';
import { useShareApp } from '@/lib/shareApp';

type RadioView = 'radio' | 'extra' | 'podcasts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 17 Oct" from a YYYY-MM-DD calendar date (UTC arithmetic: it is a date, not an instant). */
function formatChartDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/**
 * One chart on a station's screen -- ONE day of it, never several side by side. A saved countdown
 * shows today's, and, only if the Control Room has allowed past days, a calendar icon beside the
 * title opens the list of days to look back at. The list is the server's own `pastDates`, so it
 * never offers a day that cannot be shown; a free calendar would, because the history only has a
 * row for a day the chart actually changed.
 */
function ChartSection({ chart, station }: { chart: StationChart; station: 'radio' | 'xtra' }) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const [choosing, setChoosing] = React.useState(false);
  const past = usePastChart(station, chart.countdownId, picked);
  const dates = chart.kind === 'countdown' ? (chart.pastDates ?? []) : [];
  const viewingPast = picked !== null && dates.includes(picked);
  const entries = viewingPast ? (past.data ?? []) : chart.entries;
  const shown = chart.kind === 'countdown' ? entries : entries.slice(0, 10);

  const choose = (date: string | null) => {
    setPicked(date);
    setChoosing(false);
  };

  return (
    <View style={styles.chartSection}>
      <Text style={styles.sectionEyebrow}>{viewingPast && picked ? `CHART · ${formatChartDay(picked).toUpperCase()}` : 'CHART'}</Text>
      <View style={styles.chartTitleRow}>
        <Text style={styles.chartTitle}>{chart.title}</Text>
        {dates.length > 0 ? (
          <Pressable
            onPress={() => setChoosing(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Choose a day"
            style={styles.chartDayButton}
          >
            <Feather name="calendar" size={16} color="#A7B7CC" />
          </Pressable>
        ) : null}
      </View>
      {viewingPast ? (
        <Pressable onPress={() => choose(null)} accessibilityRole="button" style={styles.chartBack}>
          <Text style={styles.chartBackText}>Back to today</Text>
        </Pressable>
      ) : null}
      {dates.length > 0 ? (
        <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
          {/* The backdrop is the way out as well as the Close row, so a tap anywhere sensible
              dismisses it -- Android's own back gesture is handled by onRequestClose. */}
          <Pressable style={styles.chartSheetBackdrop} onPress={() => setChoosing(false)}>
            <Pressable style={styles.chartSheet} onPress={() => {}}>
              <Text style={styles.chartSheetTitle}>Choose a day</Text>
              <ScrollView style={styles.chartSheetScroll}>
                {[null, ...dates].map((date) => {
                  const active = (date ?? null) === (viewingPast ? picked : null);
                  return (
                    <Pressable
                      key={date ?? 'today'}
                      onPress={() => choose(date)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.chartSheetRow, active ? styles.chartSheetRowActive : null]}
                    >
                      <Text style={[styles.chartSheetRowText, active ? styles.chartSheetRowTextActive : null]}>
                        {date ? formatChartDay(date) : 'Today'}
                      </Text>
                      {active ? <Feather name="check" size={16} color="#0B1730" /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable onPress={() => setChoosing(false)} accessibilityRole="button" style={styles.chartSheetClose}>
                <Text style={styles.chartSheetCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      {viewingPast && past.isLoading ? <ActivityIndicator style={styles.chartStatus} /> : null}
      {viewingPast && past.isError ? <Text style={styles.chartStatusText}>That day's chart isn't available.</Text> : null}
      {shown.map((entry) => (
        <View key={`${chart.id}-${entry.position}`} style={styles.chartRow}>
          <Text style={styles.chartPos}>{entry.position}</Text>
          <View style={styles.historyCopy}>
            <Text numberOfLines={1} style={styles.historyTitle}>{entry.title}</Text>
            {!!entry.artist && <Text numberOfLines={1} style={styles.historyArtist}>{entry.artist}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * When requests close or open again, under a request panel. The server computes this from
 * the windows set in the Control Room (lib/requestWindows.ts on the API side); nothing
 * here knows the rules, only the answer.
 */
function RequestHours({ status }: { status: RequestStatus }) {
  if (!status.nextChangeLabel && !status.schedule.length) return null;
  return (
    <View style={styles.requestHours}>
      {status.nextChangeLabel ? <Text style={styles.requestHoursLead}>{status.nextChangeLabel}</Text> : null}
      {status.schedule.length ? (
        <>
          <Text style={styles.requestHoursLead}>When requests are open</Text>
          {status.schedule.map((line) => (
            <Text key={line} style={styles.requestHoursLine}>{line}</Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

export default function RadioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [artist, setArtist] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [sender, setSender] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [dedication, setDedication] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [extraSearch, setExtraSearch] = React.useState('');
  const [debouncedExtraSearch, setDebouncedExtraSearch] = React.useState('');
  const { features, songRequests, links } = useAppConfig();
  const [rawViewMode, setViewMode] = React.useState<RadioView>(
    mode === 'podcasts' ? 'podcasts' : 'radio',
  );
  // If the Control Room switches podcasts off while someone is on that tab, fall back to the radio.
  const viewMode: RadioView = rawViewMode === 'podcasts' && !features.podcasts ? 'radio' : rawViewMode;
  const shareMessage = (fallback: string) => (links.shareText ? `${links.shareText}` : fallback);
  // Station shares carry the app download link too (it used to be text only).
  const { shareWithLink, shareApp } = useShareApp();
  // Already includes the request window: the server applies the schedule before it
  // answers, so these two booleans are the whole gate.
  const radioRequestsOpen = features.songRequests && songRequests.radioEnabled;
  const xtraRequestsOpen = features.songRequests && songRequests.xtraEnabled;
  const request = useSongRequest();
  const {
    playbackKind,
    isPlaying,
    isBuffering,
    streamError,
    streamErrorMessage,
    stations,
    selectStation,
    toggleRadioPlayback,
    retryPlayback,
    stopPlayback,
    viewingPreviousTracks,
    refreshMetadata,
    selectedStationId,
    viewingStationId,
    setViewingStation,
    viewingStation,
    viewingCurrentTrack,
    viewingNextTrack,
    viewingMetadataLoading,
    viewingMetadataError,
    viewingTrackTitle,
    viewingTrackArtist,
  } = usePlayer();

  React.useEffect(() => {
    if (viewMode === 'radio' || viewMode === 'extra') setViewingStation(viewMode);
  }, [viewMode, setViewingStation]);
  const isRadio = viewMode === 'radio';
  const isPodcasts = viewMode === 'podcasts';
  const radioPlaying = playbackKind === 'radio' && isPlaying && selectedStationId === viewMode;
  const extraSearchResults = useExtraSongSearch(debouncedExtraSearch, viewMode === 'extra');
  // "Coming Up" is one sideways row, switched on its own in the Control Room (separately from
  // Home). EJazz Xtra shows what AzuraCast has scheduled; EJazz Radio has no such schedule, so
  // it shows its Control Room programme line-up, the same source Home uses.
  const xtraSchedule = useExtraSchedule(viewMode === 'extra' && features.scheduleRadio);
  const upcoming = (xtraSchedule.data ?? []).slice(0, 8);
  const showsQuery = useShows();
  const radioLineup = classifyLineup(showsQuery.data ?? [], new Date(), 'radio');
  const radioLineupCount = (radioLineup.now ? 1 : 0) + (radioLineup.next ? 1 : 0) + radioLineup.later.length;
  const extraRequest = useExtraSongRequest();
  // "Clock this..." fact for the song on air, and the charts assigned to this station.
  const songFact = useSongFact(viewingCurrentTrack?.artist, viewingCurrentTrack?.title);
  const stationCharts = useStationCharts(viewMode === 'extra' ? 'xtra' : 'radio');
  const charts = viewMode === 'podcasts' ? [] : (stationCharts.data ?? []);

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
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom }}
        bottomOffset={24}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>EJAZZ LIVE</Text>
          <Text style={styles.title}>Radio</Text>
          {features.share && (
            <Pressable
              onPress={() =>
                isPodcasts
                  ? shareApp()
                  : shareWithLink(shareMessage(`Listen live on ${viewingStation.name} — EJazz Media App`))
              }
              accessibilityRole="button"
              accessibilityLabel={isPodcasts ? 'Share the EJazz Media app' : 'Share station'}
              style={styles.shareButton}
            >
              <Feather name="share-2" size={18} color={colors.foreground} />
            </Pressable>
          )}
        </View>

        <View style={styles.switcher}>
          {stations.map((station) => {
            const selected = station.id === viewMode;
            return (
              <Pressable
                key={station.id}
                onPress={() => {
                  setViewMode(station.id);
                }}
                style={[styles.switcherItem, selected && { backgroundColor: colors.primary }]}
              >
                <View style={styles.switcherLogoChip}>
                  <Image source={station.logo} contentFit="contain" style={styles.switcherLogo} />
                </View>
                <Text style={[styles.switcherText, selected && { color: colors.primaryForeground }]}>
                  {station.shortName}
                </Text>
              </Pressable>
            );
          })}
          {features.podcasts && (
          <Pressable
            onPress={() => setViewMode('podcasts')}
            style={[styles.switcherItem, isPodcasts && { backgroundColor: colors.primary }]}
          >
            <View style={styles.podcastTabIcon}>
              <Feather name="mic" size={15} color={isPodcasts ? colors.primary : colors.accent} />
            </View>
            <Text style={[styles.switcherText, isPodcasts && { color: colors.primaryForeground }]}>
              Podcasts
            </Text>
          </Pressable>
          )}
        </View>

        {isPodcasts ? (
          <PodcastsPanel />
        ) : (
          <>
        <View style={styles.playerArtworkWrap}>
          <View style={styles.playerLogoFallback}>
            <Image source={viewingStation.logo} contentFit="cover" style={styles.playerLogo} />
          </View>
          <LinearGradient colors={['transparent', 'rgba(7,8,11,0.72)']} style={StyleSheet.absoluteFill} />
          <View style={styles.artworkLive}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.liveText}>LIVE NOW</Text>
          </View>
          <View style={styles.artworkStation}>
            <View>
              <Text style={styles.artworkStationName}>{viewingStation.name}</Text>
              <Text style={styles.artworkStationDescription}>{viewingStation.genre}</Text>
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          {features.share ? (
            <Pressable style={styles.secondaryControl} onPress={() => shareWithLink(shareMessage(`Listen to ${viewingStation.name}`))}>
              <Feather name="share-2" size={19} color={colors.mutedForeground} />
              <Text style={styles.controlText}>Share</Text>
            </Pressable>
          ) : (
            <View style={styles.secondaryControl} />
          )}
          <PlayButton
            playing={radioPlaying}
            onPress={() => {
              if (viewingStationId !== selectedStationId) selectStation(viewingStationId);
              else toggleRadioPlayback();
            }}
            loading={playbackKind === 'radio' && isBuffering && selectedStationId === viewingStationId}
          />
          <Pressable style={styles.secondaryControl} onPress={stopPlayback}>
            <Feather name="square" size={19} color={colors.mutedForeground} />
            <Text style={styles.controlText}>Stop</Text>
          </Pressable>
        </View>

        <View style={styles.trackBlock}>
          <View style={styles.onAirHeading}>
            <Text style={styles.trackEyebrow}>ON AIR</Text>
            <PlayingEqualizer playing={radioPlaying} />
          </View>
          {viewingMetadataLoading && isRadio && !viewingCurrentTrack ? (
            <View style={styles.metadataLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.trackArtist}>Finding the current track…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.trackTitle}>{viewingTrackTitle}</Text>
              <Text style={styles.trackArtist}>{viewingTrackArtist}</Text>
            </>
          )}
          {viewingMetadataError && isRadio && !viewingCurrentTrack && (
            <Pressable onPress={() => refreshMetadata()} style={styles.metadataRetry}>
              <Text style={styles.metadataRetryText}>TRACK INFO UNAVAILABLE · RETRY</Text>
            </Pressable>
          )}
        </View>

        {!isPodcasts && songFact.data ? (
          <View style={styles.factCard}>
            <Text style={styles.factKicker}>CLOCK THIS...</Text>
            <Text style={styles.factText}>{songFact.data.body}</Text>
          </View>
        ) : null}

        {!isRadio && viewingNextTrack && (
          <View style={styles.nextTrackSection}>
            <Text style={styles.sectionEyebrow}>NEXT UP</Text>
            <View style={styles.nextTrackRow}>
              {viewingNextTrack.imageUrl ? (
                <Image source={viewingNextTrack.imageUrl} contentFit="cover" style={styles.nextTrackArtwork} />
              ) : (
                <View style={styles.nextTrackArtworkFallback}>
                  <Feather name="music" size={20} color={colors.accent} />
                </View>
              )}
              <View style={styles.historyCopy}>
                <Text numberOfLines={1} style={styles.nextTrackTitle}>{viewingNextTrack.title}</Text>
                {!!viewingNextTrack.artist && (
                  <Text numberOfLines={1} style={styles.historyArtist}>{viewingNextTrack.artist}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {!isPodcasts && features.scheduleRadio && (!isRadio ? upcoming.length > 0 : radioLineupCount > 0) && (
          <View style={styles.scheduleSection}>
            <Text style={styles.sectionEyebrow}>COMING UP</Text>
            <LineupRow>
              {isRadio ? (
                <>
                  {radioLineup.now ? <ShowLineupCard show={radioLineup.now} badge="LIVE NOW" live /> : null}
                  {radioLineup.next ? <ShowLineupCard show={radioLineup.next} badge="NEXT" /> : null}
                  {radioLineup.later.map((show) => (
                    <ShowLineupCard key={show.id} show={show} badge="LATER" />
                  ))}
                </>
              ) : (
                upcoming.map((entry) => (
                  <LineupCard
                    key={`${entry.id}-${entry.startTimestamp}`}
                    badge={entry.isNow ? 'ON AIR' : formatScheduleWhen(entry.startTimestamp)}
                    live={entry.isNow}
                    name={entry.name}
                    time={formatScheduleLength(entry) ?? undefined}
                  />
                ))
              )}
            </LineupRow>
          </View>
        )}

        {charts.map((chart) => (
          <ChartSection key={chart.id} chart={chart} station={viewMode === 'extra' ? 'xtra' : 'radio'} />
        ))}

        {viewingPreviousTracks.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionEyebrow}>PREVIOUS TRACKS</Text>
            {viewingPreviousTracks.map((track, index) => (
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
                  {/* Guarded: an AzuraCast file with no artist tag would otherwise
                      render an empty line under the title. */}
                  {!!track.artist && (
                    <Text numberOfLines={1} style={styles.historyArtist}>{track.artist}</Text>
                  )}
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
              <Text style={styles.errorSubtext}>
                {streamErrorMessage || 'Trying again when you are ready.'}
              </Text>
            </View>
            <Pressable onPress={retryPlayback} hitSlop={10}>
              <Text style={styles.retry}>RETRY</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.backgroundNote}>
          <Feather name="headphones" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>Keep listening</Text>
            <Text style={styles.noteText}>Audio continues while you explore EJazz News.</Text>
          </View>
        </View>

        {isRadio && !radioRequestsOpen && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>YOUR SONG, ON AIR</Text>
            <Text style={styles.requestTitle}>Requests are closed</Text>
            <Text style={styles.requestIntro}>{songRequests.closedMessage}</Text>
            <RequestHours status={songRequests.radioStatus} />
          </View>
        )}

        {isRadio && radioRequestsOpen && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>YOUR SONG, ON AIR</Text>
            <Text style={styles.requestTitle}>Request a track</Text>
            <Text style={styles.requestIntro}>Tell the EJazz team what you want to hear next.</Text>
            <RequestHours status={songRequests.radioStatus} />

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

        {!isRadio && !xtraRequestsOpen && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>FIND IT. REQUEST IT.</Text>
            <Text style={styles.requestTitle}>Requests are closed</Text>
            <Text style={styles.requestIntro}>{songRequests.closedMessage}</Text>
            <RequestHours status={songRequests.xtraStatus} />
          </View>
        )}

        {!isRadio && xtraRequestsOpen && (
          <View style={styles.requestSection}>
            <Text style={styles.sectionEyebrow}>FIND IT. REQUEST IT.</Text>
            <Text style={styles.requestTitle}>Request on EJazz Xtra</Text>
            <Text style={styles.requestIntro}>Search the station library, then request the track you want.</Text>
            <RequestHours status={songRequests.xtraStatus} />
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
          </>
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
  switcherItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, paddingVertical: 7, borderWidth: 1, borderColor: '#2C4B75' },
  switcherLogoChip: { width: 24, height: 24, padding: 3, borderRadius: 6, backgroundColor: '#FFFFFF' },
  switcherLogo: { width: '100%', height: '100%' },
  podcastTabIcon: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  switcherText: { flexShrink: 1, color: '#A7B7CC', fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
  playerArtworkWrap: { height: 370, marginHorizontal: 20, overflow: 'hidden', backgroundColor: '#13161E' },
  playerArtwork: { ...StyleSheet.absoluteFill },
  playerLogoFallback: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
  playerLogo: { ...StyleSheet.absoluteFill },
  artworkLive: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(7,8,11,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: '#F5F1E9', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  artworkStation: { position: 'absolute', bottom: 18, left: 18, right: 18 },
  artworkStationName: { color: '#F7F9FC', fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  artworkStationDescription: { color: '#FF6B6B', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, marginTop: 5 },
  trackBlock: { paddingHorizontal: 20, paddingTop: 25 },
  onAirHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackEyebrow: { color: '#3E79FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  trackTitle: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', marginTop: 8 },
  trackArtist: { color: '#A7B7CC', fontSize: 14, marginTop: 5 },
  metadataLoading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  metadataRetry: { alignSelf: 'flex-start', marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#E43B48' },
  metadataRetryText: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  factCard: { marginHorizontal: 20, marginTop: 16, padding: 14, borderLeftWidth: 2, borderLeftColor: '#FF6B6B', backgroundColor: '#0D2A57' },
  factKicker: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  factText: { color: '#F7F9FC', fontSize: 13, lineHeight: 19 },
  chartSection: { marginHorizontal: 20, marginTop: 26, borderTopWidth: 1, borderTopColor: '#204570', paddingTop: 18 },
  chartTitle: { color: '#F7F9FC', fontSize: 18, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 },
  chartRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#17365E', paddingVertical: 6 },
  chartPos: { color: '#FF6B6B', fontSize: 16, fontWeight: '700', width: 30 },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  chartDayButton: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#204570' },
  chartBack: { paddingBottom: 10 },
  chartBackText: { color: '#FF6B6B', fontSize: 12, fontWeight: '700' },
  chartSheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,26,0.72)', justifyContent: 'flex-end' },
  chartSheet: { backgroundColor: '#0E1E3A', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 28 },
  chartSheetTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  chartSheetScroll: { maxHeight: 320 },
  chartSheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#204570' },
  chartSheetRowActive: { backgroundColor: '#FF6B6B', borderColor: '#FF6B6B' },
  chartSheetRowText: { color: '#F7F9FC', fontSize: 14, fontWeight: '600' },
  chartSheetRowTextActive: { color: '#0B1730' },
  chartSheetClose: { paddingVertical: 12, alignItems: 'center' },
  chartSheetCloseText: { color: '#A7B7CC', fontSize: 13, fontWeight: '700' },
  chartStatus: { marginVertical: 14 },
  chartStatusText: { color: '#A7B7CC', fontSize: 13, paddingVertical: 12 },
  scheduleSection: { marginHorizontal: 20, marginTop: 22 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  scheduleWhen: { color: '#7890AE', fontSize: 12, fontWeight: '700', width: 104 },
  scheduleCopy: { flex: 1 },
  scheduleOnAir: { color: '#4ADE80', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
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
  requestHours: { marginTop: -8, marginBottom: 18 },
  requestHoursLead: { color: '#F7F9FC', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  requestHoursLine: { color: '#A7B7CC', fontSize: 12, lineHeight: 18 },
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