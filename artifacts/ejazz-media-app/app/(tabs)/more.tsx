import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EJazzWordmark, MINI_PLAYER_CLEARANCE, ScreenHeader } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import { getAppVersion, openLink, useAppConfig } from '@/lib/appConfig';
import { useHosts } from '@/lib/hosts';

type MenuItem = {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  action?: string;
  route?: '/notifications';
};

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { links } = useAppConfig();
  // Each station has its own socials; a station with none set shows nothing here.
  const stationGroups = ([
    { title: 'EJAZZ RADIO', links: links.radio },
    { title: 'EJAZZ XTRA', links: links.xtra },
  ] as const)
    .map((group) => ({
      title: group.title,
      items: (
        [
          ['Instagram', 'instagram', group.links.instagramUrl],
          ['Facebook', 'facebook', group.links.facebookUrl],
          ['X', 'twitter', group.links.xUrl],
          ['TikTok', 'music', group.links.tiktokUrl],
          ['YouTube', 'youtube', group.links.youtubeUrl],
          ['WhatsApp', 'message-circle', group.links.whatsappUrl],
          ['Website', 'globe', group.links.websiteUrl],
        ] as const
      )
        .filter(([, , url]) => Boolean(url))
        .map(([label, icon, url]) => ({ label, icon, action: url }) as MenuItem),
    }))
    .filter((group) => group.items.length > 0);
  const anyStationLinks = stationGroups.length > 0;
  const items: MenuItem[] = [
    { label: 'Notifications', icon: 'bell', route: '/notifications' },
    { label: 'About EJazz', icon: 'info' },
    { label: 'Contact EJazz', icon: 'mail', action: `mailto:${links.contactEmail || 'hello@ejazzmedia.com'}` },
    ...(links.instagramUrl || !anyStationLinks
      ? [{ label: 'Instagram', icon: 'instagram', action: links.instagramUrl || 'https://instagram.com' } as MenuItem]
      : []),
    ...(links.whatsappUrl ? [{ label: 'WhatsApp', icon: 'message-circle', action: links.whatsappUrl } as MenuItem] : []),
    ...(links.websiteUrl ? [{ label: 'Website', icon: 'globe', action: links.websiteUrl } as MenuItem] : []),
    { label: 'Privacy Policy', icon: 'shield', action: links.privacyUrl || undefined },
    { label: 'Terms', icon: 'file-text', action: links.termsUrl || undefined },
  ];
  const hostsQuery = useHosts();
  const hosts = hostsQuery.data ?? [];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom }}>
        <ScreenHeader eyebrow="THE HOUSE OF EJAZZ" title="More" />
        <View style={styles.about}>
          <EJazzWordmark />
          <Text style={styles.aboutTitle}>Your Vibe. Your News. Your EJazz.</Text>
          <Text style={styles.aboutCopy}>Radio, culture &amp; the stories that matter - all in one app.</Text>
        </View>
        {hosts.length > 0 ? (
          <View style={styles.hostsSection}>
            <Text style={styles.hostsTitle}>EJazz Hosts</Text>
            <View style={styles.hostsList}>
              {hosts.map((host) => (
                <View key={host.id} style={styles.hostCard}>
                  <Text style={styles.hostName}>{host.name}</Text>
                  {host.bio ? <Text style={styles.hostBio}>{host.bio}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.menu}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => {
                if (item.route) router.push(item.route);
                else if (item.action) openLink(item.action);
              }}
              style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.65 : 1 }]}
            >
              <View style={styles.menuIcon}><Feather name={item.icon} size={18} color={colors.primary} /></View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Feather
                name={item.route ? 'chevron-right' : 'arrow-up-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>
        {stationGroups.map((group) => (
          <View key={group.title} style={styles.menu}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.items.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => item.action && openLink(item.action)}
                style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.65 : 1 }]}
              >
                <View style={styles.menuIcon}><Feather name={item.icon} size={18} color={colors.primary} /></View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        ))}
        <View style={styles.version}>
          <Text style={styles.versionText}>EJAZZ MEDIA APP</Text>
          <Text style={styles.versionSubtext}>VERSION {getAppVersion()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  about: { marginHorizontal: 20, paddingVertical: 22, paddingHorizontal: 18, backgroundColor: '#0D2A57', borderLeftWidth: 3, borderLeftColor: '#E43B48' },
  aboutTitle: { color: '#F7F9FC', fontSize: 24, fontWeight: '700', letterSpacing: -0.7, marginTop: 25 },
  aboutCopy: { color: '#A7B7CC', fontSize: 14, lineHeight: 21, marginTop: 10 },
  hostsSection: { marginHorizontal: 20, marginTop: 22 },
  hostsTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  hostsList: { gap: 10 },
  hostCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  hostName: { color: '#F7F9FC', fontSize: 15, fontWeight: '700' },
  hostBio: { color: '#A7B7CC', fontSize: 13, lineHeight: 18 },
  menu: { marginHorizontal: 20, marginTop: 27, borderTopWidth: 1, borderTopColor: '#204570' },
  groupTitle: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, paddingTop: 16, paddingBottom: 4 },
  menuItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#204570', gap: 13 },
  menuIcon: { width: 32, alignItems: 'center' },
  menuLabel: { color: '#F7F9FC', fontSize: 15, fontWeight: '600', flex: 1 },
  version: { alignItems: 'center', paddingTop: 48, gap: 8 },
  versionText: { color: '#F7F9FC', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  versionSubtext: { color: '#7890AE', fontSize: 9, letterSpacing: 1.2 },
});