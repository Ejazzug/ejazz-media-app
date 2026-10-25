import { useQuery } from '@tanstack/react-query';
import { isPulseConfigured, pulseBaseUrl } from '@/lib/pulse';

const TIMEOUT_MS = 10_000;

async function getJson(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${pulseBaseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export type SongFact = { id: number; body: string; source: 'ai' | 'manual' };

/**
 * The "Clock this..." fact for the song on air. Keyed on artist + title, so it refetches
 * when the track changes and is cached per song. A first-time song can take several seconds
 * while the server writes its fact; the card simply stays hidden until it arrives.
 * Resolves to null (not an error) when there is nothing to show.
 */
export function useSongFact(artist: string | undefined, title: string | undefined) {
  const a = (artist ?? '').trim();
  const t = (title ?? '').trim();
  return useQuery({
    queryKey: ['ejazz-song-fact', a.toLowerCase(), t.toLowerCase()],
    queryFn: async (): Promise<SongFact | null> => {
      const data = (await getJson('/api/facts/for-track', { artist: a, title: t })) as { fact?: SongFact | null };
      const fact = data?.fact;
      return fact && typeof fact.body === 'string' && fact.body ? fact : null;
    },
    enabled: isPulseConfigured() && a.length > 0 && t.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
}

export type StationChartEntry = { position: number; title: string; artist: string };

/**
 * A countdown's shareable card: the picture the dashboard draws of this chart, and the caption
 * written to go with it. Only sent for TODAY's chart, and only when the countdown has been given
 * a design -- so `card` being absent is the normal case, not an error.
 */
export type StationChartCard = { url: string; caption: string };

export type StationChart = {
  id: string;
  title: string;
  date: string | null;
  entries: StationChartEntry[];
  /** Set on saved countdowns (today's chart); absent on charts generated on the dashboard. */
  kind?: 'countdown';
  countdownId?: string;
  /** Earlier days the operator allows, newest first (YYYY-MM-DD). Empty/absent = today only. */
  pastDates?: string[];
  card?: StationChartCard | null;
};

/** A countdown's chart on an earlier day. Only requested when a date chip is tapped. */
export function usePastChart(station: 'radio' | 'xtra', countdownId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: ['ejazz-past-chart', station, countdownId, date],
    queryFn: async (): Promise<StationChartEntry[]> => {
      const data = (await getJson('/api/station-charts/past', { station, countdown: countdownId ?? '', date: date ?? '' })) as {
        entries?: StationChartEntry[];
      };
      return Array.isArray(data?.entries) ? data.entries : [];
    },
    enabled: isPulseConfigured() && Boolean(countdownId) && Boolean(date),
    staleTime: 60 * 60 * 1000, // a past day never changes
    retry: 0,
  });
}

/** Charts the operator assigned to this station in the Control Room. */
export function useStationCharts(station: 'radio' | 'xtra') {
  return useQuery({
    queryKey: ['ejazz-station-charts', station],
    queryFn: async (): Promise<StationChart[]> => {
      const data = (await getJson('/api/station-charts', { station })) as { items?: StationChart[] };
      return Array.isArray(data?.items) ? data.items.filter((c) => c && typeof c.title === 'string' && Array.isArray(c.entries)) : [];
    },
    enabled: isPulseConfigured(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * The programme on air right now on a station, from the Control Room line-up. Null when
 * nothing is scheduled (the lock screen then simply leaves the show out). Refetched every
 * minute; the native background service asks the same endpoint for itself.
 */
export function useOnAirShow(station: 'radio' | 'xtra', enabled: boolean) {
  return useQuery({
    queryKey: ['ejazz-on-air-show', station],
    queryFn: async (): Promise<string | null> => {
      const data = (await getJson('/api/shows/on-air', { station })) as { show?: string | null };
      return typeof data?.show === 'string' && data.show.trim() ? data.show.trim() : null;
    },
    enabled: enabled && isPulseConfigured(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: 0,
  });
}
