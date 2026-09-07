import { useMutation, useQuery } from '@tanstack/react-query';

const RADIO_RPC_URL = 'https://eu1.reliastream.com:2199/external/rpc.php';
const EXTRA_STATUS_URL = 'https://c32.radioboss.fm:8320/status-json.xsl';
const RADIO_USERNAME = 'ejazzug';
const REQUEST_TIMEOUT_MS = 10_000;

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
  const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
  const title = typeof track.title === 'string' ? track.title.trim() : '';
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

async function fetchRecentTracks() {
  const payload = await requestJson(rpcUrl('recenttracks.get', { limit: '10' }));
  if (payload.type !== 'result' || !Array.isArray(payload.data) || !Array.isArray(payload.data[0])) {
    throw new Error('Unexpected radio metadata response');
  }

  return payload.data[0]
    .map(normalizeTrack)
    .filter((track): track is RadioTrack => track !== null);
}

function parseExtraTitle(value: unknown): RadioTrack | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const rawTitle = value.trim();
  const separatorIndex = rawTitle.lastIndexOf(' - ');
  if (separatorIndex < 1 || separatorIndex >= rawTitle.length - 3) {
    return { artist: '', title: rawTitle, album: '', imageUrl: '', time: '' };
  }

  const artist = rawTitle
    .slice(0, separatorIndex)
    .trim()
    .replace(/\s*\([^()]+\)\s*$/, '')
    .trim();
  const title = rawTitle.slice(separatorIndex + 3).trim();
  if (!artist || !title) {
    return { artist: '', title: rawTitle, album: '', imageUrl: '', time: '' };
  }
  return { artist, title, album: '', imageUrl: '', time: '' };
}

async function fetchExtraTrack() {
  const payload = await requestJson(EXTRA_STATUS_URL);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected eXTRA metadata response');
  }

  const icecast = payload as Record<string, unknown>;
  const icestats = icecast.icestats;
  if (!icestats || typeof icestats !== 'object') {
    throw new Error('Unexpected eXTRA metadata response');
  }
  const sourceValue = (icestats as Record<string, unknown>).source;
  const source = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;
  if (!source || typeof source !== 'object') {
    throw new Error('Unexpected eXTRA metadata response');
  }
  const track = parseExtraTitle((source as Record<string, unknown>).title);
  if (!track) throw new Error('No eXTRA track metadata available');
  return track;
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

export function useExtraTrack(enabled: boolean) {
  return useQuery({
    queryKey: ['radio', 'extra', 'current-track'],
    queryFn: fetchExtraTrack,
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 75_000 : false,
    retry: 1,
  });
}

export function useSongRequest() {
  return useMutation({ mutationFn: submitSongRequest });
}