/**
 * IS THE APP ACTUALLY ABLE TO REACH ITS SERVICES RIGHT NOW?
 *
 * Written for one scenario the owner named (2026-11-22): somebody installs the APK on a phone
 * that has never had internet, and opens it. Nothing has been cached, because nothing has ever
 * been fetched -- so every screen has to be honest and complete with no network at all, and
 * has to repair itself the moment a network appears.
 *
 * **Why this is not NetInfo.** Two reasons, and the second is the important one:
 *
 *  1. `@react-native-community/netinfo` is a NATIVE module. Adding it means a new store build
 *     for every phone before any of this reaches a listener. Everything here is plain
 *     JavaScript and `fetch`, so it ships in an OTA update like the rest of the app.
 *  2. A phone can hold five bars of Wi-Fi behind a captive portal, a blocked DNS, or an origin
 *     that is simply down -- "connected" says nothing about whether EJazz answers. What a
 *     screen needs to know is whether ITS service answers, which is what this measures: each
 *     API is probed separately and reported separately.
 *
 * What it does NOT do: claim to know why. A probe answers reachable or not reachable; the app
 * says "we cannot reach EJazz right now", never "you are offline", because it cannot tell the
 * difference and guessing wrong reads as a lie to somebody whose Wi-Fi is plainly working.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

/** The services the app depends on, each probed on its own. */
export type ServiceKey = 'pulse' | 'news';

/** `null` = never answered yet (the state a fresh install opens in). */
export type Reachability = Record<ServiceKey, boolean | null>;

type ContextValue = {
  /** Per-service: true reachable, false tried and failed, null not tried yet. */
  services: Reachability;
  /** True when at least one service has answered. "Something works." */
  anyReachable: boolean;
  /** True once every configured service has been tried and none answered. */
  allUnreachable: boolean;
  /** A probe is in flight. */
  checking: boolean;
  /** When the last round finished, as epoch ms; 0 before the first one. */
  lastCheckedAt: number;
  /** Probe now -- what a "Try again" button calls. Resolves when the round ends. */
  recheck: () => Promise<void>;
};

const EMPTY: Reachability = { pulse: null, news: null };

const ReachabilityContext = createContext<ContextValue>({
  services: EMPTY,
  anyReachable: false,
  allUnreachable: false,
  checking: false,
  lastCheckedAt: 0,
  recheck: async () => {},
});

const PULSE_API_URL = process.env.EXPO_PUBLIC_PULSE_API_URL?.trim() ?? '';
const NEWS_API_URL = process.env.EXPO_PUBLIC_EJAZZ_NEWS_API_URL?.trim() ?? '';

/** Short on purpose: this is a yes/no question, not a content fetch. */
const PROBE_TIMEOUT_MS = 6_000;
/** While something is unreachable, look again soon -- a phone that finds signal must recover. */
const RETRY_MS = 20_000;
/** While everything answers, look rarely: the content queries are the real health check. */
const IDLE_MS = 5 * 60_000;

/** The cheapest honest request per service. Both are reads the app already makes. */
function probeUrl(service: ServiceKey): string {
  if (service === 'pulse') return PULSE_API_URL ? `${PULSE_API_URL.replace(/\/$/, '')}/api/app-config` : '';
  return NEWS_API_URL ? `${NEWS_API_URL.replace(/\/$/, '')}/posts?per_page=1&_fields=id` : '';
}

async function probe(service: ServiceKey): Promise<boolean> {
  const url = probeUrl(service);
  // A service with no URL configured is not "unreachable" -- there is nothing to reach. It
  // stays null so a screen can tell "switched off" from "cannot get there".
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    // Any answer at all means the service is THERE. A 404 or a 500 is a reachable service
    // having a bad day, and the screens that fetch real content will say so themselves.
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ReachabilityProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<Reachability>(EMPTY);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(0);
  const queryClient = useQueryClient();
  const previous = useRef<Reachability>(EMPTY);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runRound = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const round = (async () => {
      setChecking(true);
      const keys: ServiceKey[] = ['pulse', 'news'];
      const results = await Promise.all(keys.map((key) => (probeUrl(key) ? probe(key) : null)));
      const next = { pulse: results[0], news: results[1] } as Reachability;
      // A service that has just come back is the whole point of probing: anything that failed
      // while it was away is asked again, which is what makes the app repair itself without
      // the listener pulling to refresh.
      const recovered = (Object.keys(next) as ServiceKey[]).some(
        (key) => next[key] === true && previous.current[key] === false,
      );
      previous.current = next;
      setServices(next);
      setLastCheckedAt(Date.now());
      setChecking(false);
      if (recovered) {
        await queryClient.invalidateQueries();
      }
    })();
    inFlight.current = round;
    try {
      await round;
    } finally {
      inFlight.current = null;
    }
  }, [queryClient]);

  // The loop: soon while something is down, rarely while everything is up.
  useEffect(() => {
    let cancelled = false;
    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        if (cancelled) return;
        await runRound();
        if (cancelled) return;
        const values = Object.values(previous.current);
        const healthy = values.length > 0 && values.every((v) => v !== false);
        schedule(healthy ? IDLE_MS : RETRY_MS);
      }, ms);
    };
    // First round immediately: a fresh install must find out at once whether it is alone.
    void runRound().then(() => {
      if (cancelled) return;
      const values = Object.values(previous.current);
      const healthy = values.length > 0 && values.every((v) => v !== false);
      schedule(healthy ? IDLE_MS : RETRY_MS);
    });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runRound]);

  // Coming back to the app is the most likely moment for the answer to have changed -- the
  // listener may have walked into Wi-Fi or turned off airplane mode while we were away.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void runRound();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [runRound]);

  const value = useMemo<ContextValue>(() => {
    const configured = (Object.keys(services) as ServiceKey[]).filter((key) => probeUrl(key));
    const anyReachable = configured.some((key) => services[key] === true);
    const allUnreachable =
      configured.length > 0 && configured.every((key) => services[key] === false);
    return { services, anyReachable, allUnreachable, checking, lastCheckedAt, recheck: runRound };
  }, [checking, lastCheckedAt, runRound, services]);

  return <ReachabilityContext.Provider value={value}>{children}</ReachabilityContext.Provider>;
}

export function useReachability(): ContextValue {
  return useContext(ReachabilityContext);
}

/**
 * One service's state, for a section that only depends on that service.
 * `unreachable` is deliberately false until a probe has actually failed: a fresh launch shows
 * its loading state for a second, not an offline notice it has not earned.
 */
export function useService(service: ServiceKey) {
  const { services, checking, recheck, lastCheckedAt } = useReachability();
  const state = services[service];
  return {
    reachable: state === true,
    unreachable: state === false,
    unknown: state === null,
    checking,
    lastCheckedAt,
    recheck,
  };
}
