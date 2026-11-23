import { Asset } from 'expo-asset';
import { Share } from 'react-native';
import RNShare from 'react-native-share';
import { PLAY_STORE_URL, useAppConfig } from '@/lib/appConfig';

/** Used until the Control Room sets its own wording (links.shareAppText). */
export const DEFAULT_APP_SHARE_TEXT =
  'Listen to EJazz Radio and EJazz Xtra live, plus the latest music news, on the EJazz Media App:';

/**
 * Used until the Control Room sets its own wording (links.nowPlayingShareText).
 * The owner's words, 2026-11-22, kept to the letter.
 */
export const DEFAULT_NOW_PLAYING_TEXT =
  '\u{1F3A7} I am listening to {song} - {artist} on {station}. Catch the vibe, Listen live:';

/**
 * What the same share says when the station has not told us what is playing -- a stream that
 * has just started, or a show with no track metadata. Dropping the placeholders out of the
 * sentence above would leave "I am listening to on EJazz Radio", so there is a second
 * sentence rather than a clever repair of the first.
 */
export const DEFAULT_STATION_SHARE_TEXT =
  '\u{1F3A7} I am listening to {station}. Catch the vibe, Listen live:';

/**
 * Fill a share template. Every placeholder is optional, and one that has nothing behind it
 * leaves no gap: a station with no track metadata yet would otherwise send "I am listening to
 *  -  on EJazz Radio".
 */
export function fillShareTemplate(
  template: string,
  parts: { song?: string; artist?: string; station?: string; link?: string },
): string {
  // An empty value becomes a marker first, so the separator BESIDE it can be removed before
  // the marker itself is. Cleaning up afterwards cannot do that: by then "{song} - {artist}"
  // with no artist is "B4 B4 - on EJazz Radio", and nothing in the text says the dash belonged
  // to the missing name rather than to the sentence.
  const GAP = '\u0000';
  const put = (value?: string) => (value || '').trim() || GAP;
  const out = (template || DEFAULT_NOW_PLAYING_TEXT)
    .replace(/\{song\}/g, put(parts.song))
    .replace(/\{artist\}/g, put(parts.artist))
    .replace(/\{station\}/g, put(parts.station))
    .replace(/\{link\}/g, put(parts.link));
  return out
    .replace(/\s*[-\u2013]\s*\u0000/g, '')   // "song - <nothing>"
    .replace(/\u0000\s*[-\u2013]\s*/g, '')   // "<nothing> - artist"
    .replace(/\s*(on|by|from)\s+\u0000/gi, '')  // "on <nothing>"
    .replace(/\u0000/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

// Tags the Play Store link so the Play Console can count installs that started from a share.
const SHARE_REFERRER = 'utm_source%3Dapp_share%26utm_medium%3Dshare_button';

/**
 * The link people are sent to. The operator's own store link (update.storeUrl) wins over the
 * built-in one; the install tag is only added to a Play Store link that has none already.
 */
export function appShareLink(storeUrl?: string): string {
  const base = (storeUrl || PLAY_STORE_URL).trim();
  if (!/^https:\/\/play\.google\.com\//i.test(base) || /[?&]referrer=/i.test(base)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}referrer=${SHARE_REFERRER}`;
}

/** Puts the app link on its own line under any message, once. */
export function withAppLink(text: string, storeUrl?: string): string {
  const link = appShareLink(storeUrl);
  return text.includes(link) ? text : `${text.trim()}\n${link}`;
}

/**
 * Every share in the app goes through here, so each one carries the download link. Honours the
 * Control Room "Share buttons" switch via `enabled`.
 */
export function useShareApp() {
  const { features, links, update } = useAppConfig();
  const open = (message: string) => {
    Share.share({ message }).catch(() => {});
  };
  return {
    enabled: features.share,
    /** The "share the app" invitation. */
    shareApp: () => open(withAppLink(links.shareAppText || DEFAULT_APP_SHARE_TEXT, update.storeUrl)),
    /** Any other message (a station, a fun fact) with the app link added underneath. */
    shareWithLink: (text: string) => open(withAppLink(text, update.storeUrl)),
    /**
     * A chart as WORDS: the caption and the rows, with the app link under them. Used for an earlier
     * day, which has no picture and never can -- the dashboard keeps one card file per countdown,
     * overwritten in place.
     */
    shareCard: (caption: string, imageUrl: string) =>
      open(withAppLink([caption.trim(), imageUrl.trim()].filter(Boolean).join('\n\n'), update.storeUrl)),
    /**
     * TODAY's chart as the PICTURE: the card itself attached, with the caption and the app link as
     * the message beside it. No image URL in the text -- the image is there, so a link to it is
     * just clutter.
     *
     * The file rather than the link: WhatsApp and X both attach the picture AND keep the words, so
     * sending a link instead wasted a real picture on both. Instagram takes the image and drops the
     * words -- its own rule, not ours, and it would drop them whatever we sent.
     *
     * Downloaded first because Android wants a local file to attach, not an https URL. The card's
     * URL carries its own version (?v=), so a redrawn card is a new URL and never serves a cached
     * yesterday. Falls back to the words-and-link share if anything here fails: a share button that
     * does nothing is worse than one that sends text.
     */
    /**
     * "Flex this song": what is on air now, with the STATION LOGO attached as the picture.
     *
     * The logo is a bundled asset, not a URL, so it goes through `Asset.fromModule` rather
     * than `fromURI` -- it is already on the phone, which also means this share works with no
     * network at all. The wording is the Control Room's (`links.nowPlayingShareText`) when it
     * has one, and the download link is added the way every other share adds it: appended,
     * unless the operator put `{link}` somewhere in their own sentence.
     *
     * Falls back to the words alone if the picture cannot be attached. A share button that
     * does nothing is worse than one that sends text.
     */
    shareNowPlaying: async (opts: { song?: string; artist?: string; station?: string; logo?: number }) => {
      const link = appShareLink(update.storeUrl);
      const knowsTrack = Boolean((opts.song || '').trim() || (opts.artist || '').trim());
      const template = knowsTrack
        ? (links.nowPlayingShareText || DEFAULT_NOW_PLAYING_TEXT)
        : DEFAULT_STATION_SHARE_TEXT;
      const filled = fillShareTemplate(template, { ...opts, link });
      const message = template.includes('{link}') ? filled : withAppLink(filled, update.storeUrl);
      try {
        if (!opts.logo) throw new Error('no logo');
        const asset = Asset.fromModule(opts.logo);
        await asset.downloadAsync();
        const local = asset.localUri || asset.uri;
        if (!local) throw new Error('no local copy');
        await RNShare.open({ message, url: local, type: 'image/png', failOnCancel: false });
      } catch {
        open(message);
      }
    },
    /**
     * Share a rendered card as a PICTURE, with a name a phone will accept.
     *
     * IT ARRIVED AS A .BIN (owner, 2026-11-23: *"songs facts below the player are shared as
     * .BIN"*). `Asset.fromURI().localUri` is a cache path with NO extension -- the card URL
     * is `/api/designer/render/fact?size=...`, which has no filename in it for expo-asset to
     * copy -- so WhatsApp and Gmail got bytes with nothing to name them, took the declared
     * `image/png` as a lie about a JPEG, and fell back to application/octet-stream.
     *
     * The fix is a data URI plus an explicit `filename`, which react-native-share writes out
     * under that name with that MIME. Done in JS on purpose: the obvious alternative is
     * expo-file-system, and adding a native module changes the runtime fingerprint, which
     * costs a store build for a bug that can otherwise ship as an OTA update.
     *
     * The type comes from the RESPONSE, not from a guess: these cards are JPEG today and the
     * renderer may yet serve PNG for one with transparency.
     */
    shareCardImage: async (caption: string, imageUrl: string) => {
      const message = withAppLink(caption.trim() || 'EJazz chart', update.storeUrl);
      const png = /\.png(\?|$)/i.test(imageUrl);
      const type = png ? 'image/png' : 'image/jpeg';

      // A REAL FILE FIRST (owner, 2026-11-23: *"when i share cards, the images never go with
      // the caption, it's just the caption that goes with the link"*).
      //
      // The data URI below worked for the fun facts under the player and does not work here.
      // Several Android targets simply drop a `data:` url and keep the text, which looks
      // exactly like this share failing -- the caption and the link arrive, the picture does
      // not, and nothing reports an error. A `file://` path is what a share sheet actually
      // wants, and expo-asset can produce one for a REMOTE url without expo-file-system,
      // which matters because adding that package would move the runtime fingerprint and cost
      // a store build for a share button.
      //
      // Both paths are kept, in order, because the failure is per-target rather than absolute:
      // a file if we can get one, the data URI if the download fails, and the words alone if
      // even that fails. A share button that does nothing is worse than one that sends text.
      try {
        const asset = Asset.fromURI(imageUrl);
        await asset.downloadAsync();
        const local = asset.localUri;
        if (!local) throw new Error('no local copy of the card');
        await RNShare.open({
          message,
          url: local,
          type,
          filename: `ejazz-${Date.now()}.${png ? 'png' : 'jpg'}`,
          failOnCancel: false,
        });
        return;
      } catch (error: unknown) {
        // Logged, not swallowed: "the picture did not go" was invisible for a day because
        // every failure here looked like a successful text share.
        console.log('[EJazz Share] card as a file failed, trying a data uri.', error);
      }

      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`card ${response.status}`);
        const served = (response.headers.get('content-type') || type).split(';')[0].trim();
        if (!served.startsWith('image/')) throw new Error(`not a picture: ${served}`);
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('the card could not be read'));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        await RNShare.open({
          message,
          url: dataUri,
          type: served,
          filename: `ejazz-${Date.now()}.${served === 'image/png' ? 'png' : 'jpg'}`,
          // Cancelling is not a failure, and must not reach the catch below as one.
          failOnCancel: false,
        });
      } catch (error: unknown) {
        console.log('[EJazz Share] card picture could not be attached; sending the words.', error);
        open(message);
      }
    },
  };
}
