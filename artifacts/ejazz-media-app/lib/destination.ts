/**
 * WHERE A TAP GOES, on the app's side.
 *
 * The mirror of the server's `lib/destinations.ts`, which is where the grammar is documented
 * and validated. Two copies of a grammar is normally a mistake; here the alternative is
 * worse, because the app must be able to open a destination it was handed while offline, from
 * a cold start, with no chance to ask the server what the string means.
 *
 * So the rule is: THE SERVER VALIDATES, THIS TRANSLATES. Anything this does not recognise
 * returns null and the caller falls back to what it would have done before -- a tap that
 * lands somewhere unexpected is worse than a tap that opens the message it came from.
 *
 * Nothing here navigates. It returns a route, and the screens read their own parameters:
 * `play` is handled by the radio screen rather than by a global side effect, so a cold start
 * from a notification and a tap inside the app take exactly the same path.
 */
import type { useRouter } from 'expo-router';

export type Route = { pathname: string; params?: Record<string, string> };

const STATION = (rest: string) => (rest === 'xtra' || rest === 'extra' ? 'extra' : 'radio');

/**
 * AN EPISODE REFERENCE: a feed guid, made safe to carry. The mirror of `episodeRef` in the
 * server's lib/destinations.ts, and the reason an aimed episode works at all.
 *
 * A guid cannot go into `episode:<slug>:<ref>` as it stands -- EJazz's own feeds write
 * "echoes_of_fame/echoes_of_fame_2026-11-22.mp3", and the slash would break both the colon
 * form and the URL form. So anything that is not a letter or a digit becomes "-", which
 * leaves an anchor.fm uuid untouched and makes everything else safe.
 *
 * Nothing stores the result: the podcast panel derives the same reference from each episode's
 * own guid and compares the two, so a feed that re-issues its guids fixes itself.
 */
export function episodeRef(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
}

/**
 * `article:123` -> the article screen. Returns null for "details", "link", "" and anything
 * unrecognised: those are the caller's existing behaviour, not a destination.
 */
export function destinationRoute(dest: string | undefined | null): Route | null {
  const value = String(dest ?? '').trim().toLowerCase();
  if (!value || value === 'details' || value === 'link') return null;
  const cut = value.indexOf(':');
  const kind = cut > 0 ? value.slice(0, cut) : value;
  const rest = cut > 0 ? value.slice(cut + 1) : '';

  switch (kind) {
    case 'home':
      return { pathname: '/(tabs)' };
    case 'news':
      return { pathname: '/(tabs)/news' };
    case 'article':
      return rest ? { pathname: '/article', params: { id: rest } } : null;
    case 'category':
      return rest ? { pathname: '/(tabs)/news', params: { category: rest } } : null;
    case 'radio':
      return { pathname: '/(tabs)/radio', params: { mode: STATION(rest) } };
    case 'play':
      // The one destination that does something as well as going somewhere. The radio screen
      // reads `play` and starts that station, so this stays a plain navigation.
      return { pathname: '/(tabs)/radio', params: { mode: STATION(rest), play: '1' } };
    case 'requests':
      return { pathname: '/(tabs)/radio', params: { mode: STATION(rest), requests: '1' } };
    case 'chart':
      return { pathname: '/(tabs)/radio', params: { mode: STATION(rest), chart: '1' } };
    case 'podcasts':
      return { pathname: '/(tabs)/radio', params: { mode: 'podcasts' } };
    case 'podcast':
      return rest ? { pathname: '/(tabs)/radio', params: { mode: 'podcasts', show: rest } } : null;
    case 'episode': {
      // "episode:<show>:<ref>" -- both halves, or it is a show pretending to be an episode.
      const split = rest.indexOf(':');
      if (split <= 0) return null;
      const show = episodeRef(rest.slice(0, split));
      const episode = episodeRef(rest.slice(split + 1));
      if (!show || !episode) return null;
      return { pathname: '/(tabs)/radio', params: { mode: 'podcasts', show, episode } };
    }
    case 'tips':
      return { pathname: '/notifications', params: { tips: '1' } };
    default:
      return null;
  }
}

/** True when the app knows how to open this. Used to decide whether to draw a button at all. */
export function canOpenDestination(dest: string | undefined | null): boolean {
  return destinationRoute(dest) !== null;
}

type AppRouter = ReturnType<typeof useRouter>;

/** Navigates, and says whether it did. */
export function goToDestination(router: AppRouter, dest: string | undefined | null): boolean {
  const route = destinationRoute(dest);
  if (!route) return false;
  router.push(route as never);
  return true;
}

/**
 * The link form, for a shared URL: `article:123` <-> `article/123`.
 * The web side redirects anyone without the app to the Play Store; the app claims the path.
 */
export function destinationFromPath(path: string): string {
  const parts = String(path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  const joined = parts.join(':').toLowerCase();
  // Validated by being understood: if it does not translate to a route, it is not one.
  return destinationRoute(joined) ? joined : '';
}
