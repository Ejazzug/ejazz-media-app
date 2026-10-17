import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAppVersion,
  isVersionBelow,
  openLink,
  PLAY_STORE_URL,
  useAppConfig,
  useAppConfigState,
} from '@/lib/appConfig';

/**
 * Pieces of the app that are driven by the Control Room's "App controls" tab.
 * Each one renders nothing when its switch is off, so a blank config changes nothing.
 */

/** Full-screen block for maintenance mode and forced updates. Only a live server answer can trigger it. */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { config, isLive } = useAppConfigState();
  const insets = useSafeAreaInsets();

  if (isLive && config.maintenance.enabled) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Feather name="tool" size={40} color="#FF6B6B" />
        <Text style={styles.gateTitle}>{config.maintenance.title}</Text>
        <Text style={styles.gateText}>{config.maintenance.message}</Text>
      </View>
    );
  }

  if (isLive && isVersionBelow(getAppVersion(), config.update.minVersion)) {
    const target = config.update.storeUrl || PLAY_STORE_URL;
    return (
      <View style={[styles.gate, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Feather name="download-cloud" size={40} color="#FF6B6B" />
        <Text style={styles.gateTitle}>Update required</Text>
        <Text style={styles.gateText}>{config.update.message}</Text>
        <Pressable
          onPress={() => openLink(target)}
          accessibilityRole="button"
          accessibilityLabel="Update the app"
          style={({ pressed }) => [styles.gateButton, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.gateButtonText}>UPDATE NOW</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

/** Dismissible "new version available" strip, shown on Home. */
export function UpdateBanner() {
  const { config, isLive } = useAppConfigState();
  const [dismissed, setDismissed] = React.useState(false);
  if (!isLive || dismissed) return null;
  if (!isVersionBelow(getAppVersion(), config.update.latestVersion)) return null;
  const target = config.update.storeUrl || PLAY_STORE_URL;
  return (
    <View style={styles.strip}>
      <Pressable onPress={() => openLink(target)} style={styles.stripBody} accessibilityRole="link">
        <Feather name="arrow-up-circle" size={18} color="#FF6B6B" />
        <View style={styles.stripCopy}>
          <Text style={styles.stripTitle}>Update available</Text>
          <Text style={styles.stripText}>{config.update.message}</Text>
        </View>
        <Text style={styles.stripAction}>UPDATE</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityLabel="Dismiss update notice">
        <Feather name="x" size={16} color="#7890AE" />
      </Pressable>
    </View>
  );
}

/** Announcement banner (promo, outage notice, event), shown at the top of Home. */
export function PromoBanner() {
  const { banner } = useAppConfig();
  const [dismissedKey, setDismissedKey] = React.useState('');
  const key = `${banner.title}|${banner.message}`;
  if (!banner.enabled || (!banner.title && !banner.message) || dismissedKey === key) return null;
  const content = (
    <>
      {banner.imageUrl ? <Image source={banner.imageUrl} contentFit="cover" style={styles.bannerImage} /> : null}
      <View style={styles.stripCopy}>
        {banner.title ? <Text style={styles.stripTitle}>{banner.title}</Text> : null}
        {banner.message ? <Text style={styles.stripText}>{banner.message}</Text> : null}
      </View>
    </>
  );
  return (
    <View style={styles.strip}>
      {banner.linkUrl ? (
        <Pressable onPress={() => openLink(banner.linkUrl)} style={styles.stripBody} accessibilityRole="link">
          {content}
          <Feather name="arrow-up-right" size={16} color="#FF6B6B" />
        </Pressable>
      ) : (
        <View style={styles.stripBody}>{content}</View>
      )}
      {banner.dismissible ? (
        <Pressable onPress={() => setDismissedKey(key)} hitSlop={10} accessibilityLabel="Dismiss announcement">
          <Feather name="x" size={16} color="#7890AE" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Big featured card under the Home hero. */
export function FeaturedCard() {
  const { featured } = useAppConfig();
  if (!featured.enabled || !featured.title) return null;
  const card = (
    <View style={styles.featured}>
      {featured.imageUrl ? <Image source={featured.imageUrl} contentFit="cover" style={styles.featuredImage} /> : null}
      <View style={styles.featuredCopy}>
        {featured.kicker ? <Text style={styles.featuredKicker}>{featured.kicker}</Text> : null}
        <Text style={styles.featuredTitle}>{featured.title}</Text>
        {featured.body ? <Text style={styles.featuredBody}>{featured.body}</Text> : null}
        {featured.linkUrl ? <Text style={styles.featuredLink}>LEARN MORE</Text> : null}
      </View>
    </View>
  );
  if (!featured.linkUrl) return card;
  return (
    <Pressable onPress={() => openLink(featured.linkUrl)} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {card}
    </Pressable>
  );
}

/** Sponsor placement near the bottom of Home. */
export function SponsorSlot() {
  const { sponsor } = useAppConfig();
  if (!sponsor.enabled || !sponsor.imageUrl) return null;
  const body = (
    <View style={styles.sponsor}>
      {sponsor.label ? <Text style={styles.sponsorLabel}>{sponsor.label}</Text> : null}
      <Image source={sponsor.imageUrl} contentFit="contain" style={styles.sponsorImage} accessibilityLabel={sponsor.label || 'Sponsor'} />
    </View>
  );
  if (!sponsor.linkUrl) return body;
  return (
    <Pressable onPress={() => openLink(sponsor.linkUrl)} accessibilityRole="link">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32, backgroundColor: '#07162F' },
  gateTitle: { color: '#F7F9FC', fontSize: 26, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center' },
  gateText: { color: '#A7B7CC', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  gateButton: { marginTop: 8, minHeight: 50, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E43B48' },
  gateButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2C4B75',
    backgroundColor: '#0D2A57',
  },
  stripBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stripCopy: { flex: 1, gap: 3 },
  stripTitle: { color: '#F7F9FC', fontSize: 14, fontWeight: '700' },
  stripText: { color: '#A7B7CC', fontSize: 12, lineHeight: 17 },
  stripAction: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bannerImage: { width: 44, height: 44, backgroundColor: '#123363' },
  featured: { marginBottom: 28, overflow: 'hidden', borderWidth: 1, borderColor: '#204570', backgroundColor: '#0D2A57' },
  featuredImage: { width: '100%', height: 180, backgroundColor: '#123363' },
  featuredCopy: { padding: 16, gap: 6 },
  featuredKicker: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  featuredTitle: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', letterSpacing: -0.6 },
  featuredBody: { color: '#A7B7CC', fontSize: 13, lineHeight: 19 },
  featuredLink: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 6 },
  sponsor: { alignItems: 'center', marginTop: 30, gap: 8 },
  sponsorLabel: { color: '#7890AE', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  sponsorImage: { width: '100%', height: 90 },
});
