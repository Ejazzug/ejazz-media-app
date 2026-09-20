import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { isPulseConfigured } from '@/lib/pulse';

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const SHOWS_REQUEST_TIMEOUT_MS = 10_000;
const SHOWS_CACHE_TTL_MS = 5 * 60 * 1000;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type ShowStation = 'radio' | 'xtra';

export type Show = {
  id: number;
  name: string;
  hostName: string | null;
  station: ShowStation;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

function isShow(value: unknown): value is Show {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Show>;
  return (
    typeof item.id === 'number' &&
    typeof item.name === 'string' &&
    typeof item.dayOfWeek === 'number' &&
    typeof item.startMinute === 'number'
  );
}

async function requestShows(): Promise<Show[]> {
  const url = `${PULSE_API_URL.replace(/\/$/, '')}/api/shows`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHOWS_REQUEST_TIMEOUT_MS);
  try {
    console.log('[EJazz Pulse] Fetching programme lineup.', { url, platform: Platform.OS });
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/0.1.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Shows API returned HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isShow)) {
      throw new Error('Shows API response did not contain a valid shows array.');
    }
    return data;
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Shows API request timed out after ${SHOWS_REQUEST_TIMEOUT_MS}ms.`
        : describeError(error);
    console.error('[EJazz Pulse] Shows API request failed.', { url, error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export function useShows() {
  return useQuery({
    queryKey: ['ejazz-pulse', 'shows'],
    queryFn: requestShows,
    enabled: isPulseConfigured(),
    staleTime: SHOWS_CACHE_TTL_MS,
    retry: 1,
  });
}

export type ProgrammeLineup = {
  now: Show | null;
  next: Show | null;
  later: Show[];
};

function minutesNowLocal(now: Date) {
  return { day: now.getDay(), minute: now.getHours() * 60 + now.getMinutes() };
}

/** Splits shows into now-playing / up-next / later-today, using device local time. */
export function classifyLineup(shows: Show[], now: Date = new Date()): ProgrammeLineup {
  const { day, minute } = minutesNowLocal(now);
  const today = shows
    .filter((show) => show.dayOfWeek === day)
    .sort((a, b) => a.startMinute - b.startMinute);

  const current = today.find((show) => show.startMinute <= minute && minute < show.endMinute) ?? null;
  const upcoming = today.filter((show) => show.startMinute > minute);
  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1, 4);

  return { now: current, next, later };
}

export function formatShowTime(startMinute: number, endMinute: number): string {
  const fmt = (total: number) => {
    const h24 = Math.floor(total / 60) % 24;
    const m = total % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${m.toString().padStart(2, '0')}${period}`;
  };
  return `${fmt(startMinute)} - ${fmt(endMinute)}`;
}
