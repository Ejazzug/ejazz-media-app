/**
 * What the lock screen / media notification says. Android shows only the title and the line
 * under it, so everything is packed into those two:
 *   line 1: "Song - Artist" (or the episode title for a podcast)
 *   line 2: "EJazz Media App · EJazz Radio · <show on air>"  (show left out when there is none)
 * albumTitle stays the station / podcast name: the native background refresher
 * (plugins/withEjazzBackgroundMetadata.js) recognises the station from it. Keep the
 * wording in step with that file's Kotlin.
 */
export const APP_NAME = 'EJazz Media App';

export function stationLockScreenMetadata(opts: {
  title?: string;
  artist?: string;
  stationName: string;
  stationDescription?: string;
  show?: string | null;
  artworkUrl?: string;
}) {
  const title = (opts.title ?? '').trim();
  const artist = (opts.artist ?? '').trim();
  const line1 = title && artist ? `${title} - ${artist}` : title || opts.stationDescription || opts.stationName;
  const line2 = [APP_NAME, opts.stationName, (opts.show ?? '').trim()].filter(Boolean).join(' · ');
  return { title: line1, artist: line2, albumTitle: opts.stationName, artworkUrl: opts.artworkUrl };
}

export function podcastLockScreenMetadata(opts: { episodeTitle: string; showName: string; artworkUrl?: string }) {
  return {
    title: opts.episodeTitle,
    artist: [APP_NAME, opts.showName].filter(Boolean).join(' · '),
    albumTitle: opts.showName,
    artworkUrl: opts.artworkUrl,
  };
}
