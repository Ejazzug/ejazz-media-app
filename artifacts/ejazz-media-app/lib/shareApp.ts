import { Share } from 'react-native';
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
     * A chart card: the caption written for it in the dashboard, then the picture's own link.
     *
     * The link rather than the file: this app bundles no sharing module that can hand over an
     * image, and the card is a public https PNG, so a link is what every chat app can open (most
     * show it as a picture). Adding a native image-share would mean a new dependency and a new
     * build for something the link already does.
     */
    shareCard: (caption: string, imageUrl: string) =>
      open(withAppLink([caption.trim(), imageUrl.trim()].filter(Boolean).join('\n\n'), update.storeUrl)),
  };
}
