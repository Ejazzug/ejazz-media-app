import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditorialPlaceholder, ScreenHeader, StoryCard } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import { NEWS_CATEGORIES, useFeaturedNews, useLatestNews } from '@/lib/news';

export default function NewsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<number>(12);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const featured = useFeaturedNews();
  const latest = useLatestNews(categoryId);
  const featuredStory = featured.data?.[0];
  const stories = useMemo(
    () => latest.data?.pages.flatMap((page) => page.stories) ?? [],
    [latest.data],
  );
  const filteredStories = useMemo(
    () => stories.filter((story) =>
      `${story.title} ${story.excerpt}`.toLowerCase().includes(query.trim().toLowerCase())),
    [query, stories],
  );
  const refresh = () => {
    featured.refetch();
    latest.refetch();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
            refreshing={featured.isRefetching || latest.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader eyebrow="EJAZZ EDITORIAL" title="News" />
        <View style={styles.toolbar}>
          <Text style={styles.intro}>Music, entertainment, business and stories from Africa and the world.</Text>
          <Pressable onPress={() => setSearchOpen((open) => !open)} style={styles.searchButton}>
            <Feather name={searchOpen ? 'x' : 'search'} size={18} color={colors.foreground} />
          </Pressable>
        </View>

        {searchOpen && (
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search loaded stories"
              placeholderTextColor={colors.mutedForeground}
              style={styles.searchInput}
            />
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {NEWS_CATEGORIES.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => {
                setCategoryId(category.id);
                setQuery('');
              }}
              style={[styles.category, categoryId === category.id && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.categoryText, categoryId === category.id && { color: colors.accentForeground }]}>
                {category.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {featuredStory ? (
          <>
            <Text style={styles.featuredLabel}>FEATURED • TOP STORIES</Text>
            <Pressable onPress={() => router.push(`/article?id=${featuredStory.id}`)} style={styles.featured}>
              {featuredStory.imageUrl ? (
                <Image source={featuredStory.imageUrl} contentFit="cover" style={styles.featuredImage} />
              ) : (
                <EditorialPlaceholder label="TOP STORIES" style={styles.featuredImage} />
              )}
              <View style={styles.featuredMeta}>
                <Text style={styles.featuredDate}>{featuredStory.dateLabel}</Text>
                <Text style={styles.featuredTitle}>{featuredStory.title}</Text>
                <Text style={styles.featuredLink}>
                  READ STORY <Feather name="arrow-up-right" size={13} color={colors.primary} />
                </Text>
              </View>
            </Pressable>
          </>
        ) : null}

        <Text style={styles.latestLabel}>
          {NEWS_CATEGORIES.find((category) => category.id === categoryId)?.label.toUpperCase()} • LATEST
        </Text>

        {latest.isLoading ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>Loading EJazz News…</Text>
          </View>
        ) : latest.isError ? (
          <View style={styles.status}>
            <Feather name="wifi-off" size={24} color={colors.accent} />
            <Text style={styles.statusTitle}>Couldn’t load stories right now.</Text>
            <Text style={styles.statusText}>Check your connection and try again.</Text>
            <Pressable onPress={() => latest.refetch()}><Text style={styles.retry}>TRY AGAIN</Text></Pressable>
          </View>
        ) : filteredStories.length === 0 ? (
          <View style={styles.status}>
            <Feather name="search" size={24} color={colors.mutedForeground} />
            <Text style={styles.statusText}>
              {query ? 'No loaded stories match your search.' : 'No stories have been published here yet.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.list}>
              {filteredStories.map((story) => <StoryCard key={story.id} story={story} />)}
            </View>
            {latest.hasNextPage && !query ? (
              <Pressable
                onPress={() => latest.fetchNextPage()}
                disabled={latest.isFetchingNextPage}
                style={styles.loadMore}
              >
                {latest.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Text style={styles.loadMoreText}>LOAD MORE</Text>
                    <Feather name="arrow-down" size={15} color={colors.primary} />
                  </>
                )}
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15 },
  intro: { color: '#A7B7CC', fontSize: 14, lineHeight: 19, flex: 1, paddingRight: 12 },
  searchButton: { width: 40, height: 40, borderWidth: 1, borderColor: '#2C4B75', alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 13, height: 46, borderWidth: 1, borderColor: '#2C4B75' },
  searchInput: { flex: 1, color: '#F7F9FC', fontSize: 14 },
  categoryRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 22 },
  category: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#2C4B75' },
  categoryText: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  featuredLabel: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginHorizontal: 20, marginBottom: 10 },
  featured: { marginHorizontal: 20, backgroundColor: '#0D2A57' },
  featuredImage: { width: '100%', height: 210 },
  featuredMeta: { padding: 16 },
  featuredDate: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  featuredTitle: { color: '#F7F9FC', fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 9 },
  featuredLink: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 17 },
  latestLabel: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginHorizontal: 20, marginTop: 33, marginBottom: 17 },
  list: { gap: 20, marginHorizontal: 20 },
  status: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  statusTitle: { color: '#F7F9FC', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  statusText: { color: '#A7B7CC', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retry: { color: '#E43B48', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, padding: 10 },
  loadMore: { height: 52, marginHorizontal: 20, marginTop: 28, borderWidth: 1, borderColor: '#2C4B75', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadMoreText: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
});