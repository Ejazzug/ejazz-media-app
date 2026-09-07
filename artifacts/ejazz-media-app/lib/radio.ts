import { useMutation, useQuery } from '@tanstack/react-query';

const RADIO_RPC_URL = 'https://eu1.reliastream.com:2199/external/rpc.php';
const EXTRA_API_URL = 'https://c32.radioboss.fm/w';
const EXTRA_STATION_ID = '320';
const RADIO_USERNAME = 'ejazzug';
const REQUEST_TIMEOUT_MS = 10_000;
let radioHistoryBackfill: RadioTrack[] = [];
const STYLIZED_WORDS = new Map([
  ['wstrn', 'WSTRN'],
]);

type RpcEnvelope = {
  type?: unknown;
  data?: unknown;
};

export type RadioTrack = {
  artist: string;
  title: string;
  album: string;
  imageUrl: string;
  time: string;
};

export type SongRequestInput = {
  artist: string;
  title: string;
  sender: string;
  email: string;
  dedication?: string;
};

export type SongRequestResult = {
  message: string;
  success: boolean;
};

export type ExtraNowPlaying = {
  currentTrack: RadioTrack | null;
  nextTrack: RadioTrack | null;
};

export type ExtraSearchTrack = {
  id: string;
  title: string;
};

export type ExtraSearchResult = {
  tracks: ExtraSearchTrack[];
  message: string;
};

function rpcUrl(method: string, params: Record<string, string>) {
  const url = new URL(RADIO_RPC_URL);
  url.searchParams.set('m', method);
  url.searchParams.set('username', RADIO_USERNAME);
  url.searchParams.set('charset', 'UTF-8');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function requestJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Radio service request failed');
    return (await response.json()) as RpcEnvelope;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Radio service timed out');
    }
    throw new Error('Radio service is temporarily unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTrack(value: unknown): RadioTrack | null {
  if (!value || typeof value !== 'object') return null;
  const track = value as Record<string, unknown>;
  const artist = typeof track.artist === 'string' ? smartTitleCase(track.artist) : '';
  const title = typeof track.title === 'string' ? smartTitleCase(track.title) : '';
  if (!artist && !title) return null;

  return {
    artist: artist || 'EJazz Radio',
    title: title || 'Live broadcast',
    album: typeof track.album === 'string' ? track.album.trim() : '',
    imageUrl: typeof track.image === 'string' ? track.image.trim() : '',
    time: typeof track.localtime === 'string'
      ? track.localtime.trim()
      : typeof track.time === 'string'
        ? track.time.trim()
        : '',
  };
}

function smartTitleCase(value: string) {
  return value
    .trim()
    .split(/(\s+)/)
    .map((word) => {
      if (!word.trim()) return word;
      const letters = word.replace(/[^A-Za-z]/g, '');
      if (!letters) return word;
      const knownStyle = STYLIZED_WORDS.get(letters.toLocaleLowerCase());
      if (knownStyle) return word.replace(letters, knownStyle);
      const isUniformCase = letters === letters.toLocaleUpperCase()
        || letters === letters.toLocaleLowerCase();
      if (!isUniformCase) return word;
      return word.toLocaleLowerCase().replace(/[a-z]/, (letter) => letter.toLocaleUpperCase());
    })
    .join('');
}

function isStationJingle(track: RadioTrack) {
  const artist = track.artist.trim().toLocaleLowerCase();
  return artist === 'ejazz media'
    || artist === 'ejazz xtra'
    || artist === 'ejazz production';
}

function trackIdentity(track: RadioTrack) {
  return `${track.artist.trim().toLocaleLowerCase()}|${track.title.trim().toLocaleLowerCase()}|${track.time}`;
}

async function fetchRecentTracks() {
  const payload = await requestJson(rpcUrl('recenttracks.get', { limit: '10' }));
  if (payload.type !== 'result' || !Array.isArray(payload.data) || !Array.isArray(payload.data[0])) {
    throw new Error('Unexpected radio metadata response');
  }

  const currentTrack = normalizeTrack(payload.data[0][0]);
  const previousTracks = payload.data[0]
    .slice(1)
    .map(normalizeTrack)
    .filter((track): track is RadioTrack => track !== null && !isStationJingle(track));
  const seen = new Set<string>();
  radioHistoryBackfill = [...previousTracks, ...radioHistoryBackfill]
    .filter((track) => {
      const identity = trackIdentity(track);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, 9);
  return currentTrack ? [currentTrack, ...radioHistoryBackfill] : radioHistoryBackfill;
}

function extraArtworkUrl(kind: 'current' | 'next', timestamp: unknown) {
  const path = kind === 'current' ? 'artwork' : 'artwork_next';
  const cacheKey = typeof timestamp === 'string' || typeof timestamp === 'number'
    ? `?${encodeURIComponent(String(timestamp))}`
    : '';
  return `${EXTRA_API_URL}/${path}/${EXTRA_STATION_ID}.jpg${cacheKey}`;
}

function normalizeExtraTrack(
  artistValue: unknown,
  titleValue: unknown,
  imageUrl: string,
): RadioTrack | null {
  const artist = typeof artistValue === 'string' ? smartTitleCase(artistValue) : '';
  const title = typeof titleValue === 'string' ? smartTitleCase(titleValue) : '';
  if (!artist && !title) return null;
  return { artist, title: title || artist, album: '', imageUrl, time: '' };
}

async function fetchExtraNowPlaying(): Promise<ExtraNowPlaying> {
  const payload = await requestJson(
    `${EXTRA_API_URL}/nowplayinginfo?u=${EXTRA_STATION_ID}`,
  );
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected EJazz Xtra metadata response');
  }

  const data = payload as Record<string, unknown>;
  return {
    currentTrack: normalizeExtraTrack(
      data.currenttrack_artist,
      data.currenttrack_title,
      extraArtworkUrl('current', data.artwork_ts),
    ),
    nextTrack: normalizeExtraTrack(
      data.nexttrack_artist,
      data.nexttrack_title,
      extraArtworkUrl('next', data.artwork_next_ts),
    ),
  };
}

async function fetchExtraRecentTracks(): Promise<RadioTrack[]> {
  const payload = await requestJson(
    `${EXTRA_API_URL}/recenttrackslist?u=${EXTRA_STATION_ID}`,
  );
  if (!Array.isArray(payload)) throw new Error('Unexpected EJazz Xtra history response');

  return payload
    .slice(1)
    .map((value): RadioTrack | null => {
      if (!value || typeof value !== 'object') return null;
      const item = value as Record<string, unknown>;
      const artist = typeof item.trackartist === 'string' ? smartTitleCase(item.trackartist) : '';
      const title = typeof item.tracktitle === 'string' ? smartTitleCase(item.tracktitle) : '';
      if (!artist && !title) return null;
      const artworkId = typeof item.artworkid === 'string' || typeof item.artworkid === 'number'
        ? String(item.artworkid)
        : '';
      return {
        artist,
        title: title || artist,
        album: '',
        imageUrl: artworkId
          ? `${EXTRA_API_URL}/artwork_recent_${encodeURIComponent(artworkId)}/${EXTRA_STATION_ID}.jpg`
          : '',
        time: typeof item.started === 'string' ? item.started : '',
      };
    })
    .filter((track): track is RadioTrack => track !== null && !isStationJingle(track))
    .slice(0, 6);
}

async function searchExtraSongs(query: string): Promise<ExtraSearchResult> {
  const payload = await requestJson(
    `${EXTRA_API_URL}/songrequestsearch?u=${EXTRA_STATION_ID}&q=${encodeURIComponent(query)}`,
  );
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected EJazz Xtra search response');
  }
  const data = payload as Record<string, unknown>;
  const message = [data.message, data.errdetail]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
  if (data.error === true) return { tracks: [], message: message || 'No matching tracks found.' };
  if (!Array.isArray(data.tracks)) throw new Error('Unexpected EJazz Xtra search response');

  const tracks = data.tracks
    .map((value): ExtraSearchTrack | null => {
      if (!value || typeof value !== 'object') return null;
      const item = value as Record<string, unknown>;
      const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '';
      const title = typeof item.title === 'string' ? smartTitleCase(item.title) : '';
      return id && title ? { id, title } : null;
    })
    .filter((track): track is ExtraSearchTrack => track !== null);
  return { tracks, message: tracks.length ? '' : 'No matching tracks found.' };
}

async function requestExtraSong(trackId: string): Promise<SongRequestResult> {
  const payload = await requestJson(
    `${EXTRA_API_URL}/songrequestmake?u=${EXTRA_STATION_ID}&id=${encodeURIComponent(trackId)}`,
  );
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected EJazz Xtra request response');
  }
  const data = payload as Record<string, unknown>;
  const serverMessage = [data.message, data.errdetail]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  return {
    success: data.error === false,
    message: serverMessage ?? (data.error === false
      ? 'Your request was sent to EJazz Xtra.'
      : 'This track could not be requested right now.'),
  };
}

async function submitSongRequest(input: SongRequestInput): Promise<SongRequestResult> {
  const params: Record<string, string> = {
    artist: input.artist.trim(),
    title: input.title.trim(),
    sender: input.sender.trim(),
    email: input.email.trim(),
  };
  if (input.dedication?.trim()) params.dedi = input.dedication.trim();

  const payload = await requestJson(rpcUrl('request.submit', params));
  if (!Array.isArray(payload.data)) {
    throw new Error('Unexpected song request response');
  }

  const message = typeof payload.data[0] === 'string'
    ? payload.data[0]
    : 'The station could not process your request.';
  return {
    message,
    success: payload.type !== 'error' && payload.data[1] === true,
  };
}

export function useRecentTracks(enabled: boolean) {
  return useQuery({
    queryKey: ['radio', 'recent-tracks'],
    queryFn: fetchRecentTracks,
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 75_000 : false,
    retry: 1,
  });
}

export function useExtraNowPlaying(enabled: boolean) {
  return useQuery({
    queryKey: ['radio', 'extra', 'now-playing'],
    queryFn: fetchExtraNowPlaying,
    enabled,
    staleTime: 4_000,
    refetchInterval: enabled ? 5_000 : false,
    retry: 1,
  });
}

export function useExtraRecentTracks(enabled: boolean) {
  return useQuery({
    queryKey: ['radio', 'extra', 'recent-tracks'],
    queryFn: fetchExtraRecentTracks,
    enabled,
    staleTime: 8_000,
    refetchInterval: enabled ? 10_000 : false,
    retry: 1,
  });
}

export function useSongRequest() {
  return useMutation({ mutationFn: submitSongRequest });
}

export function useExtraSongSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['radio', 'extra', 'song-search', query],
    queryFn: () => searchExtraSongs(query),
    enabled: enabled && query.length >= 3,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useExtraSongRequest() {
  return useMutation({ mutationFn: requestExtraSong });
}