import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { AppState } from 'react-native';
import { useAppConfig } from '@/lib/appConfig';
import { PodcastEpisode, PodcastShow } from '@/lib/podcasts';
import {
  RadioTrack,
  useExtraNowPlaying,
  useRecentTracks,
} from '@/lib/radio';

export type StationId = 'radio' | 'extra';
export type PlaybackKind = 'radio' | 'podcast';

export type Station = {
  id: StationId;
  name: string;
  shortName: string;
  description: string;
  genre: string;
  streamUrl: string;
  /** Optional second stream the app switches to when the main one keeps failing. */
  backupUrl: string;
  artwork: number;
  logo: number;
  color: string;
};

export type PodcastPlaybackItem = {
  id: string;
  title: string;
  audioUrl: string;
  showName: string;
  artworkUrl: string;
};

/**
 * EJazz Xtra's live stream. The station moved to AzuraCast (HTTPS, no cleartext exception
 * needed), so this is a stable public address and is baked in as the fallback rather than
 * left empty: an unset or empty EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL used to mean a station
 * with no stream at all, which the player can only report as an error.
 *
 * Precedence, lowest to highest: this constant -> EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL baked
 * in at build time -> the Control Room's streams.xtra.url (applied in useMemo below), which
 * is the only one that reaches phones already installed.
 */
const EXTRA_STREAM_FALLBACK_URL = 'https://stream.ejazzug.com/listen/ejazzxtra/radio.mp3';

const BASE_STATIONS: Station[] = [
  {
    id: 'radio',
    name: 'EJazz Radio',
    shortName: 'EJazz Radio',
    description: 'AT40, Pop & Indie',
    genre: 'AT40 • POP • INDIE',
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL ?? '',
    backupUrl: '',
    artwork: require('@/assets/images/editorial-vocalist.jpg'),
    logo: require('@/assets/images/ejazz-radio-logo.png'),
    color: '#E43B48',
  },
  {
    id: 'extra',
    name: 'EJazz Xtra',
    shortName: 'EJazz Xtra',
    description: 'African Pop',
    genre: 'AFRICAN POP',
    // `||`, not `??`: EXPO_PUBLIC_* inlining can leave an empty string, which `??` keeps.
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL || EXTRA_STREAM_FALLBACK_URL,
    backupUrl: '',
    artwork: require('@/assets/images/editorial-african-pop.jpg'),
    logo: require('@/assets/images/ejazz-xtra-logo.png'),
    color: '#FF6B6B',
  },
];

function podcastItem(episode: PodcastEpisode, show: PodcastShow): PodcastPlaybackItem {
  return {
    id: episode.id,
    title: episode.title,
    audioUrl: episode.audioUrl,
    showName: show.name,
    artworkUrl: show.artworkUrl,
  };
}

type PlayerContextValue = {
  stations: Station[];
  activeStation: Station;
  selectedStationId: StationId;
  viewingStationId: StationId;
  viewingStation: Station;
  setViewingStation: (stationId: StationId) => void;
  viewingCurrentTrack: RadioTrack | null;
  viewingPreviousTracks: RadioTrack[];
  viewingNextTrack: RadioTrack | null;
  viewingMetadataLoading: boolean;
  viewingMetadataError: boolean;
  viewingTrackTitle: string;
  viewingTrackArtist: string;
  playbackKind: PlaybackKind;
  isPlaying: boolean;
  isBuffering: boolean;
  streamError: boolean;
  streamErrorMessage: string;
  playbackError: boolean;
  trackTitle: string;
  trackArtist: string;
  currentTrack: RadioTrack | null;
  previousTracks: RadioTrack[];
  nextTrack: RadioTrack | null;
  metadataLoading: boolean;
  metadataError: boolean;
  currentPodcast: PodcastPlaybackItem | null;
  podcastQueue: PodcastPlaybackItem[];
  podcastPosition: number;
  podcastDuration: number;
  refreshMetadata: () => void;
  selectStation: (stationId: StationId) => void;
  togglePlayback: () => void;
  toggleRadioPlayback: () => void;
  retryPlayback: () => void;
  stopPlayback: () => void;
  playPodcast: (episode: PodcastEpisode, show: PodcastShow) => void;
  enqueuePodcast: (episode: PodcastEpisode, show: PodcastShow) => void;
  removeQueuedPodcast: (episodeId: string) => void;
  skipPodcast: () => void;
  seekPodcastForward: (seconds?: number) => void;
  seekPodcastTo: (seconds: number) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { streams } = useAppConfig();
  // The Control Room can override either stream address (and add a backup) without a new app release.
  const stations = useMemo<Station[]>(
    () => BASE_STATIONS.map((station) => {
      const remote = station.id === 'radio' ? streams.radio : streams.xtra;
      return {
        ...station,
        streamUrl: remote.url || station.streamUrl,
        backupUrl: remote.backupUrl,
      };
    }),
    [streams.radio, streams.xtra],
  );
  // Which stations are currently on their backup stream (flips on every failed attempt).
  const onBackupRef = useRef<Record<StationId, boolean>>({ radio: false, extra: false });
  const retryRef = useRef<() => void>(() => undefined);
  const [selectedStationId, setSelectedStationId] = useState<StationId>('radio');
  const [viewingStationId, setViewingStation] = useState<StationId>('radio');
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind>('radio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [streamErrorMessage, setStreamErrorMessage] = useState('');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [currentPodcast, setCurrentPodcast] = useState<PodcastPlaybackItem | null>(null);
  const [podcastQueue, setPodcastQueue] = useState<PodcastPlaybackItem[]>([]);
  const wasFinished = useRef(false);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetryingRef = useRef(false);
  const retryStartedAtRef = useRef<number | null>(null);

  const clearAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    autoRetryingRef.current = false;
    retryStartedAtRef.current = null;
  }, []);

  const scheduleAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current) return;
    if (retryStartedAtRef.current === null) retryStartedAtRef.current = Date.now();
    const elapsed = Date.now() - retryStartedAtRef.current;
    if (elapsed >= 3 * 60 * 1000) {
      console.log('[EJazz Radio] Auto-retry window elapsed (3 min). Giving up.');
      clearAutoRetry();
      return;
    }
    autoRetryingRef.current = true;
    autoRetryTimerRef.current = setTimeout(() => {
      autoRetryTimerRef.current = null;
      console.log('[EJazz Radio] Auto-retry attempting reconnect...');
      retryRef.current();
    }, 6000);
  }, [clearAutoRetry]);
  const activeStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? stations[0],
    [selectedStationId, stations],
  );
  const player = useAudioPlayer(null, {
    updateInterval: 800,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const recentTracks = useRecentTracks(
    (viewingStationId === 'radio' && isAppActive) || selectedStationId === 'radio',
    isAppActive,
  );
  const extraNowPlaying = useExtraNowPlaying(
    (viewingStationId === 'extra' && isAppActive) || selectedStationId === 'extra',
    isAppActive,
  );
  const currentTrack = selectedStationId === 'radio'
    ? recentTracks.data?.[0] ?? null
    : extraNowPlaying.data?.currentTrack ?? null;
  const previousTracks = selectedStationId === 'radio'
    ? recentTracks.data?.slice(1, 5) ?? []
    : extraNowPlaying.data?.history.slice(0, 6) ?? [];
  const nextTrack = selectedStationId === 'extra'
    ? extraNowPlaying.data?.nextTrack ?? null
    : null;
  const metadataLoading = selectedStationId === 'radio'
    ? recentTracks.isLoading
    : extraNowPlaying.isLoading;
  const metadataError = selectedStationId === 'radio'
    ? recentTracks.isError
    : extraNowPlaying.isError;
  const viewingStation = useMemo(
    () => stations.find((station) => station.id === viewingStationId) ?? stations[0],
    [viewingStationId, stations],
  );
  const viewingCurrentTrack = viewingStationId === 'radio'
    ? recentTracks.data?.[0] ?? null
    : extraNowPlaying.data?.currentTrack ?? null;
  const viewingPreviousTracks = viewingStationId === 'radio'
    ? recentTracks.data?.slice(1, 5) ?? []
    : extraNowPlaying.data?.history.slice(0, 6) ?? [];
  const viewingNextTrack = viewingStationId === 'extra'
    ? extraNowPlaying.data?.nextTrack ?? null
    : null;
  const viewingMetadataLoading = viewingStationId === 'radio'
    ? recentTracks.isLoading
    : extraNowPlaying.isLoading;
  const viewingMetadataError = viewingStationId === 'radio'
    ? recentTracks.isError
    : extraNowPlaying.isError;
  const viewingTrackTitle = viewingCurrentTrack?.title ?? 'Live from EJazz';
  const viewingTrackArtist = viewingCurrentTrack?.artist || viewingStation.description;

  const playbackError = playbackKind === 'podcast' && !!status.error;

  const refreshMetadata = useCallback(() => {
    if (selectedStationId === 'radio') {
      void recentTracks.refetch();
      return;
    }
    void extraNowPlaying.refetch();
  }, [extraNowPlaying, recentTracks, selectedStationId]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    }).catch((error: unknown) => {
      console.error('[EJazz Radio] Failed to configure the audio session.', error);
      setStreamErrorMessage('Audio could not be configured on this device.');
      setStreamError(true);
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
      if (state === 'active') {
        if (selectedStationId === 'radio' || viewingStationId === 'radio') {
          void recentTracks.refetch();
        }
        if (selectedStationId === 'extra' || viewingStationId === 'extra') {
          void extraNowPlaying.refetch();
        }
      }
    });
    return () => subscription.remove();
  }, [
    extraNowPlaying.refetch,
    recentTracks.refetch,
    selectedStationId,
    viewingStationId,
  ]);

  useEffect(() => {
    if (status.playing !== isPlaying) setIsPlaying(status.playing);
    if (status.error) {
      if (playbackKind === 'radio') {
        console.error('[EJazz Radio] Audio player reported a runtime error.', status.error);
        setStreamErrorMessage(`Live stream error: ${String(status.error)}`);
        setStreamError(true);
        if (activeStation.backupUrl) {
          onBackupRef.current[activeStation.id] = !onBackupRef.current[activeStation.id];
        }
        scheduleAutoRetry();
      }
      setIsPlaying(false);
    }
  }, [activeStation.backupUrl, activeStation.id, isPlaying, playbackKind, scheduleAutoRetry, status.error, status.playing]);

  useEffect(() => {
    return () => {
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    };
  }, []);

  const hasActivatedLockScreenRef = useRef(false);
  useEffect(() => {
    if (playbackKind === 'podcast' && currentPodcast) {
      if (!status.playing && !hasActivatedLockScreenRef.current) return;
      hasActivatedLockScreenRef.current = true;
      player.setActiveForLockScreen(
        true,
        {
          title: currentPodcast.title,
          artist: currentPodcast.showName,
          albumTitle: 'EJazz Podcasts',
          artworkUrl: currentPodcast.artworkUrl || undefined,
        },
        { showSeekForward: true, showSeekBackward: true },
      );
      return;
    }
    if (!status.playing && !hasActivatedLockScreenRef.current) return;
    hasActivatedLockScreenRef.current = true;
    player.setActiveForLockScreen(
      true,
      {
        title: currentTrack?.title || activeStation.description || activeStation.name,
        artist: currentTrack?.artist || activeStation.name,
        albumTitle: activeStation.name,
        artworkUrl: currentTrack?.imageUrl || undefined,
      },
      { isLiveStream: true, showSeekForward: false, showSeekBackward: false },
    );
  }, [
    activeStation.description,
    activeStation.name,
    currentPodcast,
    currentTrack?.artist,
    currentTrack?.imageUrl,
    currentTrack?.title,
    playbackKind,
    player,
    status.playing,
  ]);

  useEffect(() => {
    const justFinished = status.didJustFinish && !wasFinished.current;
    wasFinished.current = status.didJustFinish;
    if (!justFinished || playbackKind !== 'podcast' || !currentPodcast) return;
    const nextEpisode = podcastQueue[0];
    if (!nextEpisode) {
      setIsPlaying(false);
      return;
    }
    setPodcastQueue((queue) => queue.slice(1));
    setCurrentPodcast(nextEpisode);
    player.replace(nextEpisode.audioUrl);
    player.play();
    setIsPlaying(true);
  }, [currentPodcast, playbackKind, player, podcastQueue, status.didJustFinish]);

  useEffect(() => {
    AsyncStorage.getItem('ejazz-selected-station')
      .then((savedStation) => {
        if (savedStation === 'radio' || savedStation === 'extra') {
          setSelectedStationId(savedStation);
          setViewingStation(savedStation);
        }
      })
      .catch(() => undefined);
  }, []);

  const selectStation = useCallback(
    (stationId: StationId) => {
      if (stationId === selectedStationId) return;
      const nextStation = stations.find((station) => station.id === stationId);
      clearAutoRetry();
      onBackupRef.current[stationId] = false;
      setStreamError(false);
      setSelectedStationId(stationId);
      AsyncStorage.setItem('ejazz-selected-station', stationId).catch(() => undefined);
      if (!nextStation?.streamUrl) {
        console.error('[EJazz Radio] Selected station has no stream URL.', stationId);
        setStreamErrorMessage('The live stream URL is empty or undefined in this app build.');
        setStreamError(true);
        setIsPlaying(false);
        return;
      }
      try {
        player.pause();
        player.replace(nextStation.streamUrl);
        setPlaybackKind('radio');
        setCurrentPodcast(null);
        player.play();
        setIsPlaying(true);
        console.log('[EJazz Radio] play() dispatched to the shared audio player after station switch.');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[EJazz Radio] Failed to start the live stream after station switch.', error);
        setStreamErrorMessage(`Could not start the live stream: ${message}`);
        setStreamError(true);
        setIsPlaying(false);
        scheduleAutoRetry();
      }
    },
    [player, selectedStationId, stations, clearAutoRetry, scheduleAutoRetry],
  );

  const toggleRadioPlayback = useCallback(() => {
    setStreamError(false);
    setStreamErrorMessage('');
    console.log('[EJazz Radio] Play handler invoked.', {
      station: activeStation.id,
      streamUrl: activeStation.streamUrl || '(empty)',
    });
    if (!activeStation.streamUrl) {
      const message = 'The live stream URL is empty or undefined in this app build.';
      console.error('[EJazz Radio]', message);
      setStreamErrorMessage(message);
      setStreamError(true);
      setIsPlaying(false);
      return;
    }
    if (playbackKind === 'radio' && (isPlaying || status.playing)) {
      player.pause();
      setIsPlaying(false);
      return;
    }
    try {
      clearAutoRetry();
      onBackupRef.current[activeStation.id] = false;
      player.pause();
      player.replace(activeStation.streamUrl);
      setPlaybackKind('radio');
      setCurrentPodcast(null);
      player.play();
      setIsPlaying(true);
      console.log('[EJazz Radio] play() dispatched to the shared audio player.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[EJazz Radio] Failed to start the live stream.', error);
      setStreamErrorMessage(`Could not start the live stream: ${message}`);
      setStreamError(true);
      setIsPlaying(false);
      scheduleAutoRetry();
    }
  }, [activeStation.id, activeStation.streamUrl, clearAutoRetry, isPlaying, playbackKind, player, scheduleAutoRetry, status.playing]);

  const togglePlayback = useCallback(() => {
    if (playbackKind === 'radio') {
      toggleRadioPlayback();
      return;
    }
    if (isPlaying || status.playing) {
      player.pause();
      setIsPlaying(false);
    } else if (currentPodcast) {
      player.play();
      setIsPlaying(true);
    }
  }, [currentPodcast, isPlaying, playbackKind, player, status.playing, toggleRadioPlayback]);

  const retryPlayback = useCallback(() => {
    setStreamError(false);
    setStreamErrorMessage('');
    if (!activeStation.streamUrl) {
      const message = 'The live stream URL is empty or undefined in this app build.';
      console.error('[EJazz Radio]', message);
      setStreamErrorMessage(message);
      setStreamError(true);
      return;
    }
    try {
      const retryUrl = onBackupRef.current[activeStation.id] && activeStation.backupUrl
        ? activeStation.backupUrl
        : activeStation.streamUrl;
      console.log('[EJazz Radio] Retry handler invoked.', {
        station: activeStation.id,
        streamUrl: retryUrl,
      });
      player.replace(retryUrl);
      setPlaybackKind('radio');
      setCurrentPodcast(null);
      player.play();
      setIsPlaying(true);
      console.log('[EJazz Radio] retry play() dispatched to the shared audio player.');
      clearAutoRetry();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[EJazz Radio] Retry failed.', error);
      setStreamErrorMessage(`Could not start the live stream: ${message}`);
      setStreamError(true);
      setIsPlaying(false);
      scheduleAutoRetry();
    }
  }, [activeStation.backupUrl, activeStation.id, activeStation.streamUrl, clearAutoRetry, player, scheduleAutoRetry]);
  retryRef.current = retryPlayback;

  const stopPlayback = useCallback(() => {
    clearAutoRetry();
    player.pause();
    setIsPlaying(false);
    setStreamError(false);
    setStreamErrorMessage('');
  }, [clearAutoRetry, player]);

  const playPodcast = useCallback((episode: PodcastEpisode, show: PodcastShow) => {
    const item = podcastItem(episode, show);
    player.pause();
    player.replace(item.audioUrl);
    setPlaybackKind('podcast');
    setCurrentPodcast(item);
    setPodcastQueue((queue) => queue.filter((queued) => queued.id !== item.id));
    setStreamError(false);
    player.play();
    setIsPlaying(true);
  }, [player]);

  const enqueuePodcast = useCallback((episode: PodcastEpisode, show: PodcastShow) => {
    const item = podcastItem(episode, show);
    setPodcastQueue((queue) => {
      if (currentPodcast?.id === item.id || queue.some((queued) => queued.id === item.id)) {
        return queue;
      }
      return [...queue, item];
    });
  }, [currentPodcast?.id]);

  const removeQueuedPodcast = useCallback((episodeId: string) => {
    setPodcastQueue((queue) => queue.filter((episode) => episode.id !== episodeId));
  }, []);

  const skipPodcast = useCallback(() => {
    const nextEpisode = podcastQueue[0];
    if (!nextEpisode) return;
    player.pause();
    player.replace(nextEpisode.audioUrl);
    setPodcastQueue((queue) => queue.slice(1));
    setPlaybackKind('podcast');
    setCurrentPodcast(nextEpisode);
    player.play();
    setIsPlaying(true);
  }, [player, podcastQueue]);

  const seekPodcastForward = useCallback((seconds = 30) => {
    if (playbackKind !== 'podcast' || !currentPodcast) return;
    const duration = Number.isFinite(status.duration) ? status.duration : 0;
    const currentTime = player.currentTime;
    const target = duration > 0
      ? Math.min(currentTime + seconds, duration)
      : currentTime + seconds;
    void player.seekTo(Math.max(0, target));
  }, [currentPodcast, playbackKind, player, status.duration]);

  const seekPodcastTo = useCallback((seconds: number) => {
    if (playbackKind !== 'podcast' || !currentPodcast) return;
    const duration = Number.isFinite(status.duration) ? status.duration : 0;
    const target = duration > 0 ? Math.min(seconds, duration) : seconds;
    void player.seekTo(Math.max(0, target));
  }, [currentPodcast, playbackKind, player, status.duration]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      stations,
      activeStation,
      selectedStationId,
      viewingStationId,
      viewingStation,
      setViewingStation,
      viewingCurrentTrack,
      viewingPreviousTracks,
      viewingNextTrack,
      viewingMetadataLoading,
      viewingMetadataError,
      viewingTrackTitle,
      viewingTrackArtist,
      playbackKind,
      isPlaying,
      isBuffering: status.isBuffering,
      streamError,
      streamErrorMessage,
      playbackError,
      trackTitle: currentTrack?.title || 'Live from EJazz',
      // `||`, not `??`: an AzuraCast file with no artist tag gives an empty string, and
      // `??` would keep it and render a blank line where the artist belongs.
      trackArtist: currentTrack?.artist || activeStation.description,
      currentTrack,
      previousTracks,
      nextTrack,
      metadataLoading,
      metadataError,
      currentPodcast,
      podcastQueue,
      podcastPosition: playbackKind === 'podcast' ? status.currentTime : 0,
      podcastDuration: playbackKind === 'podcast' ? status.duration : 0,
      refreshMetadata,
      selectStation,
      togglePlayback,
      toggleRadioPlayback,
      retryPlayback,
      stopPlayback,
      playPodcast,
      enqueuePodcast,
      removeQueuedPodcast,
      skipPodcast,
      seekPodcastForward,
      seekPodcastTo,
    }),
    [
      stations,
      activeStation,
      currentPodcast,
      currentTrack,
      enqueuePodcast,
      isPlaying,
      metadataError,
      metadataLoading,
      nextTrack,
      playbackError,
      playbackKind,
      playPodcast,
      podcastQueue,
      playbackKind,
      previousTracks,
      refreshMetadata,
      removeQueuedPodcast,
      retryPlayback,
      selectStation,
      selectedStationId,
      viewingStationId,
      viewingStation,
      setViewingStation,
      viewingCurrentTrack,
      viewingPreviousTracks,
      viewingNextTrack,
      viewingMetadataLoading,
      viewingMetadataError,
      viewingTrackTitle,
      viewingTrackArtist,
      seekPodcastForward,
      seekPodcastTo,
      skipPodcast,
      status.currentTime,
      status.duration,
      status.isBuffering,
      stopPlayback,
      streamError,
      streamErrorMessage,
      togglePlayback,
      toggleRadioPlayback,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside PlayerProvider');
  return context;
}