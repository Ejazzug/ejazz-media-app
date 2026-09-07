import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EJazzWordmark, ScreenHeader } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';

const items = [
  { label: 'About EJazz', icon: 'info' as const, action: undefined },
  { label: 'Contact EJazz', icon: 'mail' as const, action: 'mailto:hello@ejazzmedia.com' },
  { label: 'Instagram', icon: 'instagram' as const, action: 'https://instagram.com' },
  { label: 'Privacy Policy', icon: 'shield' as const, action: undefined },
  { label: 'Terms', icon: 'file-text' as const, action: undefined },
];

export default function MoreScreen() {
  const colors = useColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <ScreenHeader eyebrow="THE HOUSE OF EJAZZ" title="More" />
        <View style={styles.about}>
          <EJazzWordmark />
          <Text style={styles.aboutTitle}>Your Vibe. Your News. Your EJazz.</Text>
          <Text style={styles.aboutCopy}>Radio, culture &amp; the stories that matter - all in one app.</Text>
        </View>
        <View style={styles.menu}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => {
                if (item.action) Linking.openURL(item.action);
              }}
              style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.65 : 1 }]}
            >
              <View style={styles.menuIcon}><Feather name={item.icon} size={18} color={colors.primary} /></View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
        <View style={styles.version}>
          <Text style={styles.versionText}>EJAZZ MEDIA APP</Text>
          <Text style={styles.versionSubtext}>VERSION 1.0.0</Text>
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
  menu: { marginHorizontal: 20, marginTop: 27, borderTopWidth: 1, borderTopColor: '#204570' },
  menuItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#204570', gap: 13 },
  menuIcon: { width: 32, alignItems: 'center' },
  menuLabel: { color: '#F7F9FC', fontSize: 15, fontWeight: '600', flex: 1 },
  version: { alignItems: 'center', paddingTop: 48, gap: 8 },
  versionText: { color: '#F7F9FC', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  versionSubtext: { color: '#7890AE', fontSize: 9, letterSpacing: 1.2 },
});