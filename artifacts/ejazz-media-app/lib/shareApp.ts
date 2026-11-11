import { Asset } from 'expo-asset';
import { Share } from 'react-native';
import RNShare from 'react-native-share';
import { PLAY_STORE_URL, useAppConfig } from '@/lib/appConfig';

/** Used until the Control Room sets its own wording (links.shareAppText). */
export const DEFAULT_APP_SHARE_TEXT =
  'Listen to EJazz Radio and EJazz Xtra live, plus the latest music news, on the EJazz Media App:';

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
    shareCardImage: async (caption: string, imageUrl: string) => {
      const message = withAppLink(caption.trim() || 'EJazz chart', update.storeUrl);
      try {
        const asset = Asset.fromURI(imageUrl);
        await asset.downloadAsync();
        const local = asset.localUri;
        if (!local) throw new Error('no local copy');
        await RNShare.open({
          message,
          url: local,
          type: 'image/png',
          // Cancelling is not a failure, and must not reach the catch below as one.
          failOnCancel: false,
        });
      } catch {
        open(message);
      }
    },
  };
}
