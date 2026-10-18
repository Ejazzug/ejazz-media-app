import { useMutation, useQuery } from '@tanstack/react-query';

const RADIO_RPC_URL = 'https://eu1.reliastream.com:2199/external/rpc.php';
/**
 * EJazz Xtra moved from RadioBoss to AzuraCast. One public, unauthenticated endpoint
 * (/api/nowplaying/2) now carries what used to take three RadioBoss calls -- current
 * track, next track, and the play history -- plus listener counts and whether a live
 * streamer is on air. EJazz Radio is unaffected and still uses the RPC above.
 */
const EXTRA_API_URL = 'https://stream.ejazzug.com';
const EXTRA_STATION_ID = '2';
/** The station's own listen URLs, for reference and for any player that wants them. */
export const EXTRA_STREAM_URL = 'https://stream.ejazzug.com/listen/ejazzxtra/radio.mp3';
export const EXTRA_HLS_URL = 'https://stream.ejazzug.com/hls/ejazzxtra/live.m3u8';
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
  /** Play history, newest first, jingles filtered out. One payload, no second call. */
  history: RadioTrack[];
  /** Seconds into the current track, and its length, as the station reports them. */
  elapsed: number;
  duration: number;
  listeners: number;
  isLive: boolean;
  streamerName: string;
  isOnline: boolean;
};

export type ExtraSearchTrack = {
  /** AzuraCast's request_id -- what POST /request/<id> takes, not the media id. */
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
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

// ---------------------------------------------------------------------------
// EJazz Xtra (AzuraCast)
//
// Its own request helper rather than requestJson() above: that one is shaped around
// reliastream's RpcEnvelope and carries EJazz Radio's error wording, and AzuraCast
// returns plain objects and arrays. Keeping them separate means nothing here can change
// how the Radio path behaves.
// ---------------------------------------------------------------------------

async function extraRequest(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    // The body is read whatever the status: AzuraCast puts the reason a request was
    // refused in `message`, and a bare "HTTP 500" would throw that away.
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('EJazz Xtra timed out');
    }
    throw new Error('EJazz Xtra is temporarily unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function extraGet(url: string): Promise<unknown> {
  const { status, body } = await extraRequest(url);
  if (status < 200 || status >= 300) throw new Error(`EJazz Xtra returned HTTP ${status}`);
  return body;
}

/**
 * Split "Artist - Title" when AzuraCast gives us no artist of its own.
 *
 * Many files on the station are tagged with the whole string in the title and an empty
 * artist ("Blaqbonez- Like Ice Spice (Official Music Video)"). Splitting here, in the one
 * place every screen reads from, is what keeps an empty artist line or a stray leading
 * dash off the UI. Only a dash with a space on at least one side counts, so a hyphenated
 * word ("Hip-Hop", "Afro-Fusion") is never cut in half.
 */
function splitCombinedTitle(text: string): { artist: string; title: string } {
  const match = text.match(/^(.*?\S)\s*[-–—]\s+(\S.*)$|^(.*?\S)\s+[-–—]\s*(\S.*)$/);
  if (!match) return { artist: '', title: text };
  const artist = (match[1] ?? match[3] ?? '').trim();
  const title = (match[2] ?? match[4] ?? '').trim();
  return artist && title ? { artist, title } : { artist: '', title: text };
}

/**
 * Strip control characters out of an ID3 tag before it is displayed. Real tags on the
 * station carry them (one artist reads "Shakira\u0007Burna Boy"), and they render as a
 * missing glyph or nothing at all, silently gluing two names together. The proper fix is
 * retagging the file; this just stops it looking broken in the app.
 */
function cleanTagText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** One AzuraCast `song` object (now playing, playing next, or a history row). */
function normalizeExtraSong(value: unknown, playedAt?: unknown): RadioTrack | null {
  if (!value || typeof value !== 'object') return null;
  const song = value as Record<string, unknown>;
  const rawArtist = cleanTagText(song.artist);
  const rawTitle = cleanTagText(song.title);
  const rawText = cleanTagText(song.text);

  // An untagged file leaves artist empty and everything in the title (or only in `text`).
  const source = rawTitle || rawText;
  const parts = rawArtist ? { artist: rawArtist, title: source } : splitCombinedTitle(source);
  const artist = smartTitleCase(parts.artist);
  const title = smartTitleCase(parts.title);
  if (!artist && !title) return null;

  return {
    artist,
    title: title || artist,
    album: cleanTagText(song.album),
    imageUrl: typeof song.art === 'string' ? song.art.trim() : '',
    time: typeof playedAt === 'number' && playedAt > 0
      ? new Date(playedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function fetchExtraNowPlaying(): Promise<ExtraNowPlaying> {
  const payload = await extraGet(`${EXTRA_API_URL}/api/nowplaying/${EXTRA_STATION_ID}`);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Unexpected EJazz Xtra metadata response');
  }
  const data = payload as Record<string, unknown>;
  const nowPlaying = (data.now_playing ?? {}) as Record<string, unknown>;
  const playingNext = (data.playing_next ?? {}) as Record<string, unknown>;
  const listeners = (data.listeners ?? {}) as Record<string, unknown>;
  const live = (data.live ?? {}) as Record<string, unknown>;

  const history = (Array.isArray(data.song_history) ? data.song_history : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      return normalizeExtraSong(item.song, item.played_at);
    })
    .filter((track): track is RadioTrack => track !== null && !isStationJingle(track));

  return {
    currentTrack: normalizeExtraSong(nowPlaying.song),
    nextTrack: normalizeExtraSong(playingNext.song),
    history,
    elapsed: numberOr(nowPlaying.elapsed, 0),
    duration: numberOr(nowPlaying.duration, 0),
    listeners: numberOr(listeners.total, 0),
    isLive: live.is_live === true,
    streamerName: typeof live.streamer_name === 'string' ? live.streamer_name : '',
    isOnline: data.is_online !== false,
  };
}

async function searchExtraSongs(query: string): Promise<ExtraSearchResult> {
  const url = `${EXTRA_API_URL}/api/station/${EXTRA_STATION_ID}/requests`
    + `?searchPhrase=${encodeURIComponent(query)}&rowCount=25&current=1`;
  const payload = await extraGet(url);
  // A searched call answers with a paginated object; the unfiltered one answers with a
  // bare array of every requestable track. Accept both so a future caller cannot break.
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).rows)
      ? ((payload as Record<string, unknown>).rows as unknown[])
      : null;
  if (!rows) throw new Error('Unexpected EJazz Xtra search response');

  const tracks = rows
    .map((value): ExtraSearchTrack | null => {
      if (!value || typeof value !== 'object') return null;
      const item = value as Record<string, unknown>;
      const id = typeof item.request_id === 'string' || typeof item.request_id === 'number'
        ? String(item.request_id)
        : '';
      const track = normalizeExtraSong(item.song);
      if (!id || !track) return null;
      return { id, title: track.title, artist: track.artist, imageUrl: track.imageUrl };
    })
    .filter((track): track is ExtraSearchTrack => track !== null);
  return { tracks, message: tracks.length ? '' : 'No matching tracks found.' };
}

async function requestExtraSong(requestId: string): Promise<SongRequestResult> {
  const { status, body } = await extraRequest(
    `${EXTRA_API_URL}/api/station/${EXTRA_STATION_ID}/request/${encodeURIComponent(requestId)}`,
    { method: 'POST' },
  );
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const serverMessage = [data.message, data.formatted_message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  // AzuraCast refuses a request for real reasons -- the song was played too recently, the
  // request window is closed, requests are off -- and says which in `message`. Surface it
  // rather than a generic failure, which would read as an app bug to the listener.
  const ok = status >= 200 && status < 300 && data.success !== false;
  return {
    success: ok,
    message: serverMessage ?? (ok
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

export function useRecentTracks(enabled: boolean, isAppActive: boolean = true) {
  return useQuery({
    queryKey: ['radio', 'recent-tracks'],
    queryFn: fetchRecentTracks,
    enabled,
    staleTime: 60_000,
    // Keep the in-app history current when Android allows the JS runtime to run;
    // the native audio service separately refreshes lock-screen metadata.
    refetchInterval: enabled ? (isAppActive ? 75_000 : 60_000) : false,
    refetchIntervalInBackground: true,
    retry: 1,
  });
}

/**
 * The only EJazz Xtra metadata call. It carries the current track, the next one and the
 * play history together, so the separate history poll this file used to run is gone --
 * which also means the three can never disagree with each other.
 */
export function useExtraNowPlaying(enabled: boolean, isAppActive: boolean = true) {
  return useQuery({
    queryKey: ['radio', 'extra', 'now-playing'],
    queryFn: fetchExtraNowPlaying,
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? (isAppActive ? 15_000 : 30_000) : false,
    refetchIntervalInBackground: true,
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