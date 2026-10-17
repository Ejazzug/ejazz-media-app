import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { getPodcastShows, setRemotePodcasts, type PodcastConfig } from '@/lib/podcasts';
import { isPulseConfigured } from '@/lib/pulse';

/**
 * Remote app controls, edited in the EJazz Control Room (App controls tab) and
 * served by GET /api/app-config. Everything has a safe built-in default, so the
 * app behaves exactly as before when the server is unreachable or not configured.
 */

export type StreamConfig = { url: string; backupUrl: string };

export type AppConfig = {
  features: {
    news: boolean;
    podcasts: boolean;
    songRequests: boolean;
    share: boolean;
    pulse: boolean;
    schedule: boolean;
  };
  songRequests: { radioEnabled: boolean; xtraEnabled: boolean; closedMessage: string };
  update: { minVersion: string; latestVersion: string; message: string; storeUrl: string };
  maintenance: { enabled: boolean; title: string; message: string };
  streams: { radio: StreamConfig; xtra: StreamConfig };
  featured: {
    enabled: boolean;
    kicker: string;
    title: string;
    body: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
  };
  banner: {
    enabled: boolean;
    title: string;
    message: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
    dismissible: boolean;
  };
  sponsor: {
    enabled: boolean;
    label: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
  };
  links: {
    contactEmail: string;
    instagramUrl: string;
    whatsappUrl: string;
    websiteUrl: string;
    privacyUrl: string;
    termsUrl: string;
    shareText: string;
  };
  podcasts: PodcastConfig[];
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  features: { news: true, podcasts: true, songRequests: true, share: true, pulse: true, schedule: true },
  songRequests: {
    radioEnabled: true,
    xtraEnabled: true,
    closedMessage: 'Song requests are closed right now. Try again later.',
  },
  update: { minVersion: '', latestVersion: '', message: 'A new version of EJazz Media is available.', storeUrl: '' },
  maintenance: {
    enabled: false,
    title: "We'll be right back",
    message: 'EJazz Media is being updated. Please check back shortly.',
  },
  streams: { radio: { url: '', backupUrl: '' }, xtra: { url: '', backupUrl: '' } },
  featured: { enabled: false, kicker: 'FEATURED', title: '', body: '', imageUrl: '', linkUrl: '', startAt: '', endAt: '' },
  banner: { enabled: false, title: '', message: '', imageUrl: '', linkUrl: '', startAt: '', endAt: '', dismissible: true },
  sponsor: { enabled: false, label: 'SPONSORED', imageUrl: '', linkUrl: '', startAt: '', endAt: '' },
  links: {
    contactEmail: '',
    instagramUrl: '',
    whatsappUrl: '',
    websiteUrl: '',
    privacyUrl: '',
    termsUrl: '',
    shareText: '',
  },
  podcasts: [],
};

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ejazzug.ejazzmedia';

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const CACHE_KEY = 'ejazz-app-config-v1';
const REQUEST_TIMEOUT_MS = 8_000;

/** Deep-merge `input` over `defaults`, keeping only values of the expected type. */
function mergeDefaults<T>(defaults: T, input: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(input) ? input : defaults) as unknown as T;
  }
  if (defaults && typeof defaults === 'object') {
    const src = input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
      out[key] = mergeDefaults(value, src[key]);
    }
    return out as T;
  }
  return (typeof input === typeof defaults ? input : defaults) as T;
}

export function parseAppConfig(input: unknown): AppConfig {
  const config = mergeDefaults(DEFAULT_APP_CONFIG, input);
  // Podcasts must have both a name and an https feed; drop anything malformed.
  config.podcasts = config.podcasts.filter(
    (show) =>
      show &&
      typeof show.slug === 'string' &&
      typeof show.name === 'string' &&
      typeof show.feedUrl === 'string' &&
      /^https?:\/\//i.test(show.feedUrl),
  );
  return config;
}

/** True when `current` is older than `required` (both like "2.0.5"). Blank `required` never blocks. */
export function isVersionBelow(current: string, required: string): boolean {
  if (!required) return false;
  const a = current.split('.').map((n) => parseInt(n, 10) || 0);
  const b = required.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/** Opens only http(s) and mailto links; ignores anything else or any failure. */
export function openLink(target: string) {
  if (!target || !/^(https?:\/\/|mailto:)/i.test(target)) return;
  Linking.openURL(target).catch(() => undefined);
}

async function fetchAppConfig(): Promise<AppConfig> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${PULSE_API_URL.replace(/\/$/, '')}/api/app-config`, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/2.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`App config returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    const raw = body && typeof body === 'object' && 'config' in body ? (body as { config: unknown }).config : body;
    const config = parseAppConfig(raw);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config)).catch(() => undefined);
    return config;
  } finally {
    clearTimeout(timeout);
  }
}

type AppConfigContextValue = {
  config: AppConfig;
  /** True only when this session got a live answer from the server (not a cached copy). */
  isLive: boolean;
};

const AppConfigContext = createContext<AppConfigContextValue>({ config: DEFAULT_APP_CONFIG, isLive: false });

export function AppConfigProvider({ children }: PropsWithChildren) {
  const [cached, setCached] = useState<AppConfig | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = parseAppConfig(JSON.parse(raw));
        // A cached copy must never lock someone out: only a live answer can block the app.
        parsed.maintenance.enabled = false;
        parsed.update.minVersion = '';
        setCached(parsed);
      })
      .catch(() => undefined);
  }, []);

  const query = useQuery({
    queryKey: ['ejazz-app-config'],
    queryFn: fetchAppConfig,
    enabled: isPulseConfigured(),
    staleTime: 60_000,
    retry: 1,
  });
  const { refetch } = query;

  useEffect(() => {
    if (!isPulseConfigured()) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  const value = useMemo<AppConfigContextValue>(
    () => ({ config: query.data ?? cached ?? DEFAULT_APP_CONFIG, isLive: Boolean(query.data) }),
    [cached, query.data],
  );

  // The podcast screens read the list from a plain module (they call hooks per show).
  setRemotePodcasts(value.config.podcasts);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext).config;
}

export function useAppConfigState(): AppConfigContextValue {
  return useContext(AppConfigContext);
}

/** The podcast list: the Control Room's list if one is set, otherwise the built-in shows. */
export function usePodcastShows(): ReadonlyArray<PodcastConfig> {
  useAppConfig(); // re-render when the remote list changes
  return getPodcastShows();
}
