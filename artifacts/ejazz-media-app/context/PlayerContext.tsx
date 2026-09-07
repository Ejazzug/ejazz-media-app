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
  playbackKind: PlaybackKind;
  isPlaying: boolean;
  isBuffering: boolean;
  streamError: boolean;
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
  refreshMetadata: () => void;
  selectStation: (stationId: StationId) => void;
  togglePlayback: () => void;
  toggleRadioPlayback: () => void;
  retryPlayback: () => void;
  playPodcast: (episode: PodcastEpisode, show: PodcastShow) => void;
  enqueuePodcast: (episode: PodcastEpisode, show: PodcastShow) => void;
  removeQueuedPodcast: (episodeId: string) => void;
  skipPodcast: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const [selectedStationId, setSelectedStationId] = useState<StationId>('radio');
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind>('radio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [currentPodcast, setCurrentPodcast] = useState<PodcastPlaybackItem | null>(null);
  const [podcastQueue, setPodcastQueue] = useState<PodcastPlaybackItem[]>([]);
  const wasFinished = useRef(false);
  const activeStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? stations[0],
    [selectedStationId],
  );
  const player = useAudioPlayer(null, {
    updateInterval: 800,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const recentTracks = useRecentTracks(selectedStationId === 'radio' && isAppActive);
  const extraNowPlaying = useExtraNowPlaying(selectedStationId === 'extra' && isAppActive);
  const extraRecentTracks = useExtraRecentTracks(selectedStationId === 'extra' && isAppActive);
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
    }).catch(() => undefined);
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
      if (playbackKind === 'radio') setStreamError(true);
      setIsPlaying(false);
    }
  }, [isPlaying, playbackKind, status.error, status.playing]);

  useEffect(() => {
    if (!status.playing) return;
    if (playbackKind === 'podcast' && currentPodcast) {
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
    player.setActiveForLockScreen(
      true,
      {
        title: currentTrack?.title ?? 'EJazz live',
        artist: currentTrack?.artist ?? activeStation.description,
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
        }
      })
      .catch(() => undefined);
  }, []);

  const selectStation = useCallback(
    (stationId: StationId) => {
      if (stationId === selectedStationId) return;
      if (playbackKind === 'radio') {
        player.pause();
        setIsPlaying(false);
      }
      setStreamError(false);
      setSelectedStationId(stationId);
      AsyncStorage.setItem('ejazz-selected-station', stationId).catch(() => undefined);
    },
    [playbackKind, player, selectedStationId],
  );

  const toggleRadioPlayback = useCallback(() => {
    setStreamError(false);
    if (!activeStation.streamUrl) {
      setStreamError(true);
      setIsPlaying(false);
      return;
    }
    if (playbackKind === 'radio' && (isPlaying || status.playing)) {
      player.pause();
      setIsPlaying(false);
      return;
    }
    player.pause();
    player.replace(activeStation.streamUrl);
    setPlaybackKind('radio');
    setCurrentPodcast(null);
    player.play();
    setIsPlaying(true);
  }, [activeStation.streamUrl, isPlaying, playbackKind, player, status.playing]);

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
    if (!activeStation.streamUrl) {
      setStreamError(true);
      return;
    }
    player.replace(activeStation.streamUrl);
    setPlaybackKind('radio');
    setCurrentPodcast(null);
    player.play();
    setIsPlaying(true);
  }, [activeStation.streamUrl, player]);

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

  const value = useMemo<PlayerContextValue>(
    () => ({
      stations,
      activeStation,
      selectedStationId,
      playbackKind,
      isPlaying,
      isBuffering: status.isBuffering,
      streamError,
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
      refreshMetadata,
      selectStation,
      togglePlayback,
      toggleRadioPlayback,
      retryPlayback,
      playPodcast,
      enqueuePodcast,
      removeQueuedPodcast,
      skipPodcast,
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
      previousTracks,
      refreshMetadata,
      removeQueuedPodcast,
      retryPlayback,
      selectStation,
      selectedStationId,
      skipPodcast,
      status.isBuffering,
      streamError,
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