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
    name: 'EJAZZ RADIO',
    shortName: 'EJAZZ Radio',
    description: 'AT40, Pop & Indie',
    genre: 'AT40 • POP • INDIE',
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL ?? '',
    artwork: require('@/assets/images/editorial-vocalist.jpg'),
    color: '#3E79FF',
  },
  {
    id: 'extra',
    name: 'EJAZZ eXTRA',
    shortName: 'EJAZZ eXTRA',
    description: 'African Pop',
    genre: 'AFRICAN POP',
    streamUrl: process.env.EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL ?? '',
    artwork: require('@/assets/images/editorial-african-pop.jpg'),
    color: '#F2B86B',
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
  selectStation: (stationId: StationId) => void;
  togglePlayback: () => void;
  retryPlayback: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const [selectedStationId, setSelectedStationId] = useState<StationId>('radio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const activeStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? stations[0],
    [selectedStationId],
  );
  const player = useAudioPlayer(activeStation.streamUrl || null, {
    updateInterval: 800,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);

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
        title: 'EJazz live',
        artist: activeStation.description,
        albumTitle: activeStation.name,
      },
      { isLiveStream: true, showSeekForward: false, showSeekBackward: false },
    );
  }, [activeStation.description, activeStation.name, player, status.playing]);

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
      trackTitle: 'Live from EJazz',
      trackArtist: activeStation.description,
      selectStation,
      togglePlayback,
      retryPlayback,
    }),
    [
      activeStation,
      isPlaying,
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