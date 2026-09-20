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
import { PodcastEpisode, PodcastShow } from '@/lib/podcasts';
import {
  RadioTrack,
  useExtraNowPlaying,
  useExtraRecentTracks,
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

const stations: Station[] = [
  {
    id: 'radio',
    name: 'EJazz Radio',
    shortName: 'EJazz Radio',
    description: 'AT40, Pop & Indie',
    genre: 'AT40 • POP • INDIE',
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL ?? '',
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
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL ?? '',
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
      retryPlayback();
    }, 6000);
  }, [clearAutoRetry]);
  const activeStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? stations[0],
    [selectedStationId],
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
  const extraRecentTracks = useExtraRecentTracks(
    (viewingStationId === 'extra' && isAppActive) || selectedStationId === 'extra',
    isAppActive,
  );
  const currentTrack = selectedStationId === 'radio'
    ? recentTracks.data?.[0] ?? null
    : extraNowPlaying.data?.currentTrack ?? null;
  const previousTracks = selectedStationId === 'radio'
    ? recentTracks.data?.slice(1, 5) ?? []
    : extraRecentTracks.data ?? [];
  const nextTrack = selectedStationId === 'extra'
    ? extraNowPlaying.data?.nextTrack ?? null
    : null;
  const metadataLoading = selectedStationId === 'radio'
    ? recentTracks.isLoading
    : extraNowPlaying.isLoading || extraRecentTracks.isLoading;
  const metadataError = selectedStationId === 'radio'
    ? recentTracks.isError
    : extraNowPlaying.isError && extraRecentTracks.isError;
  const viewingStation = useMemo(
    () => stations.find((station) => station.id === viewingStationId) ?? stations[0],
    [viewingStationId],
  );
  const viewingCurrentTrack = viewingStationId === 'radio'
    ? recentTracks.data?.[0] ?? null
    : extraNowPlaying.data?.currentTrack ?? null;
  const viewingPreviousTracks = viewingStationId === 'radio'
    ? recentTracks.data?.slice(1, 5) ?? []
    : extraRecentTracks.data ?? [];
  const viewingNextTrack = viewingStationId === 'extra'
    ? extraNowPlaying.data?.nextTrack ?? null
    : null;
  const viewingMetadataLoading = viewingStationId === 'radio'
    ? recentTracks.isLoading
    : extraNowPlaying.isLoading || extraRecentTracks.isLoading;
  const viewingMetadataError = viewingStationId === 'radio'
    ? recentTracks.isError
    : extraNowPlaying.isError && extraRecentTracks.isError;
  const viewingTrackTitle = viewingCurrentTrack?.title ?? 'Live from EJazz';
  const viewingTrackArtist = viewingCurrentTrack?.artist ?? viewingStation.description;

  const playbackError = playbackKind === 'podcast' && !!status.error;

  const refreshMetadata = useCallback(() => {
    if (selectedStationId === 'radio') {
      void recentTracks.refetch();
      return;
    }
    void extraNowPlaying.refetch();
    void extraRecentTracks.refetch();
  }, [extraNowPlaying, extraRecentTracks, recentTracks, selectedStationId]);

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
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (status.playing !== isPlaying) setIsPlaying(status.playing);
    if (status.error) {
      if (playbackKind === 'radio') {
        console.error('[EJazz Radio] Audio player reported a runtime error.', status.error);
        setStreamErrorMessage(`Live stream error: ${String(status.error)}`);
        setStreamError(true);
        scheduleAutoRetry();
      }
      setIsPlaying(false);
    }
  }, [isPlaying, playbackKind, scheduleAutoRetry, status.error, status.playing]);

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
    [player, selectedStationId, clearAutoRetry, scheduleAutoRetry],
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
  }, [activeStation.streamUrl, isPlaying, playbackKind, player, scheduleAutoRetry, status.playing]);

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
      console.log('[EJazz Radio] Retry handler invoked.', {
        station: activeStation.id,
        streamUrl: activeStation.streamUrl,
      });
      player.replace(activeStation.streamUrl);
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
  }, [activeStation.streamUrl, player, scheduleAutoRetry]);

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
      trackTitle: currentTrack?.title ?? 'Live from EJazz',
      trackArtist: currentTrack?.artist ?? activeStation.description,
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