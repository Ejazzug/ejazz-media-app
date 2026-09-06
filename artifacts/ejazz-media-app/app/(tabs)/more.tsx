import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <ScreenHeader eyebrow="THE HOUSE OF EJAZZ" title="More" />
        <View style={styles.about}>
          <EJazzWordmark />
          <Text style={styles.aboutTitle}>Listen. Read. Discover.</Text>
          <Text style={styles.aboutCopy}>EJazz Media brings live radio and the stories behind the sound into one place.</Text>
        </View>
        <View style={styles.menu}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => item.action && Linking.openURL(item.action)}
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
  about: { marginHorizontal: 20, paddingVertical: 22, paddingHorizontal: 18, backgroundColor: '#13161E', borderLeftWidth: 3, borderLeftColor: '#3E79FF' },
  aboutTitle: { color: '#F5F1E9', fontSize: 24, fontWeight: '700', letterSpacing: -0.7, marginTop: 25 },
  aboutCopy: { color: '#9298A6', fontSize: 14, lineHeight: 21, marginTop: 10 },
  menu: { marginHorizontal: 20, marginTop: 27, borderTopWidth: 1, borderTopColor: '#282D38' },
  menuItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#282D38', gap: 13 },
  menuIcon: { width: 32, alignItems: 'center' },
  menuLabel: { color: '#F5F1E9', fontSize: 15, fontWeight: '600', flex: 1 },
  version: { alignItems: 'center', paddingTop: 48, gap: 8 },
  versionText: { color: '#F5F1E9', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  versionSubtext: { color: '#6F7685', fontSize: 9, letterSpacing: 1.2 },
});