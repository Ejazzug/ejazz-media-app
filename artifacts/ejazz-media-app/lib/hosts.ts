import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { isPulseConfigured } from '@/lib/pulse';

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const HOSTS_REQUEST_TIMEOUT_MS = 10_000;
const HOSTS_CACHE_TTL_MS = 10 * 60 * 1000;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type Host = {
  id: number;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function isHost(value: unknown): value is Host {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Host>;
  return typeof item.id === 'number' && typeof item.name === 'string';
}

async function requestHosts(): Promise<Host[]> {
  const url = `${PULSE_API_URL.replace(/\/$/, '')}/api/hosts`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOSTS_REQUEST_TIMEOUT_MS);
  try {
    console.log('[EJazz Pulse] Fetching hosts.', { url, platform: Platform.OS });
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/0.1.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Hosts API returned HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isHost)) {
      throw new Error('Hosts API response did not contain a valid hosts array.');
    }
    return data;
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Hosts API request timed out after ${HOSTS_REQUEST_TIMEOUT_MS}ms.`
        : describeError(error);
    console.error('[EJazz Pulse] Hosts API request failed.', { url, error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export function useHosts() {
  return useQuery({
    queryKey: ['ejazz-pulse', 'hosts'],
    queryFn: requestHosts,
    enabled: isPulseConfigured(),
    staleTime: HOSTS_CACHE_TTL_MS,
    retry: 1,
  });
}
