import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { parseLinkText } from '@/lib/linkText';

function open(url: string) {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => undefined);
}

/** The full message behind a notification: all the text, the image, and tappable links. */
export default function NotificationDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; body?: string; image?: string; url?: string }>();
  const title = typeof params.title === 'string' ? params.title : 'EJazz Media';
  const body = typeof params.body === 'string' ? params.body : '';
  const image = typeof params.image === 'string' && /^https:\/\//i.test(params.image) ? params.image : '';
  const url = typeof params.url === 'string' ? params.url : '';
  const parts = parseLinkText(body);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8} accessibilityLabel="Back">
          <Feather name="arrow-left" size={19} color="#F7F9FC" />
        </Pressable>
        <Text style={styles.topTitle}>MESSAGE</Text>
        <View style={styles.topButton} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {image ? <Image source={image} contentFit="cover" style={styles.image} /> : null}
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {body ? (
            <Text style={styles.body}>
              {parts.map((part, index) =>
                part.url ? (
                  <Text key={index} style={styles.link} onPress={() => open(part.url as string)}>
                    {part.text}
                  </Text>
                ) : (
                  <Text key={index}>{part.text}</Text>
                ),
              )}
            </Text>
          ) : null}
          {url ? (
            <Pressable onPress={() => open(url)} style={styles.button} accessibilityRole="link">
              <Text style={styles.buttonText}>OPEN LINK</Text>
              <Feather name="external-link" size={15} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  topButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2A57' },
  topTitle: { color: '#F7F9FC', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#123363' },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  title: { color: '#F7F9FC', fontSize: 22, fontWeight: '700', letterSpacing: -0.5, lineHeight: 28 },
  body: { color: '#C7D3E5', fontSize: 15, lineHeight: 23 },
  link: { color: '#7AA8FF', textDecorationLine: 'underline', fontWeight: '600' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 6, paddingVertical: 14, backgroundColor: '#E43B48' },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
});
