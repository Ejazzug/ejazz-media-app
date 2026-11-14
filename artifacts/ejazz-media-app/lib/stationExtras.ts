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

/** Which way a song moved since the previous chart, in the dashboard's own four words. */
export type ChartMove = 'up' | 'down' | 'same' | 'new';

/**
 * One row of a chart. The last three are what the shared PICTURE draws beside a song, and each is
 * independently optional: absent means the server has nothing to say about it, which is different
 * from zero or "did not move" -- a chart on its first day has no movement at all, and a song whose
 * cover was never cached has no cover here either (it has none on the picture either).
 */
export type StationChartEntry = {
  position: number;
  title: string;
  artist: string;
  move?: ChartMove;
  lastWeek?: number;
  /** Absolute https URL of the cover the dashboard's card renderer cached. */
  artUrl?: string;
};

/**
 * A countdown's shareable card: the picture the dashboard draws of this chart, and the caption
 * written to go with it. Only sent for TODAY's chart, and only when the countdown has been given
 * a design -- so `card` being absent is the normal case, not an error.
 */
export type StationChartCard = { url: string; caption: string };

/**
 * The COLOURS of the card design the operator chose on the dashboard, so this app can draw the
 * chart itself in that design instead of showing the picture of it.
 *
 * Colours, wording, and the four switches that say WHAT to show -- artwork, arrows, last week's
 * number, the NEW badge -- which this app honours exactly as the picture does: turning artwork off
 * on the Card Designs tab turns it off here too. The design's layout switches (list_style,
 * font_style, canvas, track_count) are deliberately not sent, because this draws its own layout.
 * Absent/null = no design chosen, and the app uses its own palette and shows everything it has.
 */
export type StationChartDesign = {
  bgMode: 'solid' | 'gradient';
  bgColor: string;
  bgColor2: string;
  gradientDirection: 'vertical' | 'horizontal' | 'diagonal';
  accentColor: string;
  textColor: string;
  headerText: string;
  footerText: string;
  showArtwork: boolean;
  showArrows: boolean;
  showLastWeek: boolean;
  showNewBadge: boolean;
};

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
  design?: StationChartDesign | null;
};

/**
 * The PICTURE of a countdown's chart on an earlier day, drawn by the dashboard in the same design
 * as today's -- same background, same colours, same logos, with that day's songs and date.
 *
 * Asked of the dashboard directly rather than of this app's own API: the card is the dashboard's
 * to draw, and routing the request through the API server would only mean two things to keep in
 * step. Resolves to null (not an error) when that day has no card, and the screen then falls back
 * to drawing the chart itself.
 */
export type PastChartCard = { url: string; caption: string; date: string };

export function usePastChartCard(countdownId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: ['ejazz-past-chart-card', countdownId, date],
    queryFn: async (): Promise<PastChartCard | null> => {
      const data = (await getJson('/api/countdown-card-day', {
        countdown: countdownId ?? '',
        date: date ?? '',
      })) as { ok?: boolean; url?: string | null; caption?: string; date?: string };
      if (!data?.ok || typeof data.url !== 'string' || !data.url) return null;
      return { url: data.url, caption: data.caption ?? '', date: data.date ?? (date ?? '') };
    },
    enabled: isPulseConfigured() && Boolean(countdownId) && Boolean(date),
    // A day that has been drawn never changes, and the URL carries the image's own version.
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });
}

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
