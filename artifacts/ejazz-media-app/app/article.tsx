import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stories } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';

export default function ArticleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const story = stories.find((item) => item.id === id) ?? stories[0];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => Share.share({ message: `${story.title} — EJazz News` })} style={styles.topButton} hitSlop={8}>
            <Feather name="share-2" size={18} color={colors.foreground} />
          </Pressable>
        </View>
        <Image source={story.image} contentFit="cover" style={styles.heroImage} />
        <View style={styles.article}>
          <Text style={styles.category}>{story.category}</Text>
          <Text style={styles.title}>{story.title}</Text>
          <View style={styles.byline}>
            <Text style={styles.bylineText}>EJAZZ EDITORIAL</Text>
            <Text style={styles.bylineDot}>•</Text>
            <Text style={styles.bylineText}>{story.time}</Text>
          </View>
          <Text style={styles.lede}>{story.excerpt}</Text>
          <Text style={styles.body}>There is a moment when a song stops being just a song. It becomes a place, a memory, a signal passed between people who have never met. Across the continent, a new generation of artists is finding that moment in real time.</Text>
          <Text style={styles.body}>The sound is expansive without losing its centre. It moves from radio to the street, from the studio to the stage, carrying the texture of everyday life with it. This is music made for discovery — and for the long way home.</Text>
          <Text style={styles.pullQuote}>“The best stories make you lean closer.”</Text>
          <Text style={styles.body}>EJazz News follows those stories as they happen: the voices, scenes and ideas shaping culture now. Keep listening, keep reading, and find the next frequency.</Text>
        </View>
        <View style={styles.related}>
          <Text style={styles.relatedLabel}>KEEP READING</Text>
          {stories.filter((item) => item.id !== story.id).slice(0, 2).map((item) => (
            <Pressable key={item.id} onPress={() => router.replace(`/article?id=${item.id}`)} style={styles.relatedItem}>
              <Image source={item.image} contentFit="cover" style={styles.relatedImage} />
              <Text style={styles.relatedTitle}>{item.title}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  topButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2A57' },
  heroImage: { width: '100%', height: 290 },
  article: { paddingHorizontal: 20, paddingTop: 27 },
  category: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#F7F9FC', fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -1.3, marginTop: 11 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  bylineText: { color: '#7890AE', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  bylineDot: { color: '#E43B48' },
  lede: { color: '#F7F9FC', fontSize: 18, lineHeight: 27, fontWeight: '600', marginTop: 28 },
  body: { color: '#CAD5E4', fontSize: 16, lineHeight: 27, marginTop: 22 },
  pullQuote: { color: '#E43B48', fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.7, borderLeftWidth: 3, borderLeftColor: '#FF6B6B', paddingLeft: 16, marginTop: 30 },
  related: { marginTop: 39, paddingHorizontal: 20, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#204570' },
  relatedLabel: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 17 },
  relatedItem: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 15 },
  relatedImage: { width: 80, height: 70 },
  relatedTitle: { color: '#F7F9FC', fontSize: 14, lineHeight: 19, fontWeight: '600', flex: 1 },
});