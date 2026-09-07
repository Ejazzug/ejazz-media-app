import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useArticle, useNews } from '@/lib/news';

export default function ArticleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: story, isLoading, isError, refetch } = useArticle(id);
  const { data: stories = [] } = useNews();

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.statusText}>Loading story…</Text>
      </View>
    );
  }

  if (isError || !story) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Feather name="file-text" size={28} color={colors.mutedForeground} />
          <Text style={styles.statusTitle}>This story is unavailable.</Text>
          <Pressable onPress={() => refetch()}><Text style={styles.retry}>TRY AGAIN</Text></Pressable>
        </View>
      </View>
    );
  }

  const publishedDate = story.publishedAt
    ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(story.publishedAt))
    : '';
  const shareMessage = story.link ? `${story.title}\n${story.link}` : `${story.title} — EJazz News`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.topButton} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => Share.share({ message: shareMessage, url: story.link || undefined })} style={styles.topButton} hitSlop={8}>
            <Feather name="share-2" size={18} color={colors.foreground} />
          </Pressable>
        </View>
        {story.imageUrl ? (
          <Image source={story.imageUrl} contentFit="cover" style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]}>
            <Feather name="file-text" size={42} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.article}>
          <Text style={styles.category}>{story.category}</Text>
          <Text style={styles.title}>{story.title}</Text>
          <View style={styles.byline}>
            <Text style={styles.bylineText}>{story.author.toUpperCase()}</Text>
            <Text style={styles.bylineDot}>•</Text>
            <Text style={styles.bylineText}>{story.time}</Text>
            {publishedDate ? <Text style={styles.bylineText}>• {publishedDate.toUpperCase()}</Text> : null}
          </View>
          {story.excerpt ? <Text style={styles.lede}>{story.excerpt}</Text> : null}
          {story.content.map((paragraph, index) => (
            <Text key={`${story.id}-${index}`} style={styles.body}>{paragraph}</Text>
          ))}
        </View>
        <View style={styles.related}>
          <Text style={styles.relatedLabel}>KEEP READING</Text>
          {stories.filter((item) => item.id !== story.id).slice(0, 2).map((item) => (
            <Pressable key={item.id} onPress={() => router.replace(`/article?id=${item.id}`)} style={styles.relatedItem}>
              {item.imageUrl ? (
                <Image source={item.imageUrl} contentFit="cover" style={styles.relatedImage} />
              ) : (
                <View style={[styles.relatedImage, styles.heroFallback]}>
                  <Feather name="file-text" size={18} color={colors.mutedForeground} />
                </View>
              )}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13, paddingHorizontal: 30 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  topButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2A57' },
  heroImage: { width: '100%', height: 290 },
  heroFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#163761' },
  article: { paddingHorizontal: 20, paddingTop: 27 },
  category: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#F7F9FC', fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -1.3, marginTop: 11 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  bylineText: { color: '#7890AE', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  bylineDot: { color: '#E43B48' },
  lede: { color: '#F7F9FC', fontSize: 18, lineHeight: 27, fontWeight: '600', marginTop: 28 },
  body: { color: '#CAD5E4', fontSize: 16, lineHeight: 27, marginTop: 22 },
  related: { marginTop: 39, paddingHorizontal: 20, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#204570' },
  relatedLabel: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 17 },
  relatedItem: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 15 },
  relatedImage: { width: 80, height: 70 },
  relatedTitle: { color: '#F7F9FC', fontSize: 14, lineHeight: 19, fontWeight: '600', flex: 1 },
  statusTitle: { color: '#F7F9FC', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  statusText: { color: '#A7B7CC', fontSize: 14 },
  retry: { color: '#E43B48', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, padding: 10 },
});