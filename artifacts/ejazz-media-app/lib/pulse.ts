import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const PULSE_REQUEST_TIMEOUT_MS = 10_000;
const PULSE_CACHE_TTL_MS = 2 * 60 * 1000;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type PulseContentType =
  | 'fact'
  | 'poll'
  | 'announcement'
  | 'quiz'
  | 'song_battle'
  | 'push_alert'
  | 'show_alert';
export type PulseContentStatus = 'draft' | 'live' | 'withdrawn' | 'expired';

export type PulseContentItem = {
  id: number;
  type: PulseContentType;
  title: string;
  body: string | null;
  imageUrl: string | null;
  relatedArtist: string | null;
  relatedSong: string | null;
  relatedShow: string | null;
  relatedStation: string | null;
  placement: 'home';
  pushEnabled: boolean;
  status: PulseContentStatus;
  pollOptions: { label: string; votes: number }[] | null;
  quizCorrectIndex: number | null;
  startAt: string | null;
  endAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const PULSE_KICKERS: Record<PulseContentType, string> = {
  fact: 'DID YOU KNOW',
  poll: 'AURA CHECK',
  announcement: 'ANNOUNCEMENT',
  quiz: 'QUIZ',
  song_battle: 'SONG BATTLE',
  push_alert: 'JAZZ ALERT',
  show_alert: 'SHOW ALERT',
};

export function pulseKickerLabel(type: PulseContentType): string {
  return PULSE_KICKERS[type] ?? 'THE JAZZ';
}

function isContentItem(value: unknown): value is PulseContentItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PulseContentItem>;
  return typeof item.id === 'number' && typeof item.title === 'string' && typeof item.type === 'string';
}

export function isPulseConfigured(): boolean {
  // Hard-disabled for this release: Pulse content, Programme Lineup, and Host
  // profiles all depend on api-server having a public URL, which isn't live
  // yet (pending Contabo). Ship this version clean; flip back to
  // `Boolean(PULSE_API_URL)` once that's ready — targeted for the next version.
  return false;
}

async function requestActiveContent(placement: string): Promise<PulseContentItem[]> {
  const url = new URL(`${PULSE_API_URL.replace(/\/$/, '')}/api/content/active`);
  url.searchParams.set('placement', placement);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PULSE_REQUEST_TIMEOUT_MS);
  try {
    console.log('[EJazz Pulse] Fetching active content.', { url: url.toString(), platform: Platform.OS });
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/0.1.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(
        `Pulse API returned HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 160)}` : ''}`,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error: unknown) {
      throw new Error(`Pulse API returned invalid JSON: ${describeError(error)}`);
    }
    if (!Array.isArray(data) || !data.every(isContentItem)) {
      throw new Error('Pulse API response did not contain a valid content items array.');
    }
    console.log('[EJazz Pulse] Pulse API request succeeded.', { url: url.toString(), count: data.length });
    return data;
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Pulse API request timed out after ${PULSE_REQUEST_TIMEOUT_MS}ms.`
        : describeError(error);
    console.error('[EJazz Pulse] Pulse API request failed.', { url: url.toString(), error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches Pulse content items active for the Home screen placement.
 * Gracefully disabled (no request, no error) when EXPO_PUBLIC_PULSE_API_URL
 * isn't configured yet — the Home screen should render nothing in that case.
 */
export function usePulseContent(placement: 'home' = 'home') {
  return useQuery({
    queryKey: ['ejazz-pulse', 'active', placement],
    queryFn: () => requestActiveContent(placement),
    enabled: isPulseConfigured(),
    staleTime: PULSE_CACHE_TTL_MS,
    retry: 1,
  });
}
