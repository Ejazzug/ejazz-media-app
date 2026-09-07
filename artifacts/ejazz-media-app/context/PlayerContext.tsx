import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { AppState } from 'react-native';
import { RadioTrack, useExtraTrack, useRecentTracks } from '@/lib/radio';

export type StationId = 'radio' | 'extra';

export type Station = {
  id: StationId;
  name: string;
  shortName: string;
  description: string;
  genre: string;
  streamUrl: string;
  artwork: number;
  color: string;
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
    color: '#FF6B6B',
  },
];

type PlayerContextValue = {
  stations: Station[];
  activeStation: Station;
  selectedStationId: StationId;
  isPlaying: boolean;
  isBuffering: boolean;
  streamError: boolean;
  trackTitle: string;
  trackArtist: string;
  currentTrack: RadioTrack | null;
  previousTracks: RadioTrack[];
  metadataLoading: boolean;
  metadataError: boolean;
  refreshMetadata: () => void;
  selectStation: (stationId: StationId) => void;
  togglePlayback: () => void;
  retryPlayback: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const [selectedStationId, setSelectedStationId] = useState<StationId>('radio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const activeStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? stations[0],
    [selectedStationId],
  );
  const player = useAudioPlayer(activeStation.streamUrl || null, {
    updateInterval: 800,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const recentTracks = useRecentTracks(selectedStationId === 'radio' && isAppActive);
  const extraTrack = useExtraTrack(selectedStationId === 'extra' && isAppActive);
  const currentTrack = selectedStationId === 'radio'
    ? recentTracks.data?.[0] ?? null
    : extraTrack.data ?? null;
  const previousTracks = selectedStationId === 'radio' ? recentTracks.data?.slice(1, 5) ?? [] : [];
  const activeMetadataQuery = selectedStationId === 'radio' ? recentTracks : extraTrack;

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
    if (status.playing !== isPlaying) {
      setIsPlaying(status.playing);
    }
    if (status.error) {
      setStreamError(true);
      setIsPlaying(false);
    }
  }, [isPlaying, status.error, status.playing]);

  useEffect(() => {
    if (!status.playing) return;
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
    currentTrack?.artist,
    currentTrack?.imageUrl,
    currentTrack?.title,
    player,
    status.playing,
  ]);

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
      player.pause();
      setIsPlaying(false);
      setStreamError(false);
      setSelectedStationId(stationId);
      AsyncStorage.setItem('ejazz-selected-station', stationId).catch(() => undefined);
    },
    [player, selectedStationId],
  );

  const togglePlayback = useCallback(() => {
    setStreamError(false);
    if (!activeStation.streamUrl) {
      setStreamError(true);
      setIsPlaying(false);
      return;
    }
    if (isPlaying || status.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  }, [activeStation.streamUrl, isPlaying, player, status.playing]);

  const retryPlayback = useCallback(() => {
    setStreamError(false);
    if (!activeStation.streamUrl) {
      setStreamError(true);
      return;
    }
    player.replace(activeStation.streamUrl);
    player.play();
    setIsPlaying(true);
  }, [activeStation.streamUrl, player]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      stations,
      activeStation,
      selectedStationId,
      isPlaying,
      isBuffering: status.isBuffering,
      streamError,
      trackTitle: currentTrack?.title ?? 'Live from EJazz',
      trackArtist: currentTrack?.artist ?? activeStation.description,
      currentTrack,
      previousTracks,
      metadataLoading: activeMetadataQuery.isLoading,
      metadataError: activeMetadataQuery.isError,
      refreshMetadata: activeMetadataQuery.refetch,
      selectStation,
      togglePlayback,
      retryPlayback,
    }),
    [
      activeStation,
      activeMetadataQuery.isError,
      activeMetadataQuery.isLoading,
      activeMetadataQuery.refetch,
      currentTrack,
      isPlaying,
      previousTracks,
      retryPlayback,
      selectStation,
      selectedStationId,
      status.isBuffering,
      streamError,
      togglePlayback,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used inside PlayerProvider');
  }
  return context;
}