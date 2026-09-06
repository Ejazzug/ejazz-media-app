import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, StoryCard, stories } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';

const categories = ['ALL', 'MUSIC', 'CULTURE', 'ENTERTAINMENT'];

export default function NewsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState('ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredStories = useMemo(
    () =>
      stories.filter(
        (story) =>
          (category === 'ALL' || story.category === category) &&
          `${story.title} ${story.excerpt}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [category, query],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <ScreenHeader eyebrow="EJAZZ EDITORIAL" title="News" />
        <View style={styles.toolbar}>
          <Text style={styles.intro}>Music, entertainment, celebrity and culture.</Text>
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
              placeholder="Search EJazz News"
              placeholderTextColor={colors.mutedForeground}
              style={styles.searchInput}
            />
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((item) => (
            <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && { backgroundColor: colors.accent }]}>
              <Text style={[styles.categoryText, category === item && { color: colors.accentForeground }]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={() => router.push(`/article?id=${stories[0].id}`)} style={styles.featured}>
          <Image source={stories[0].image} contentFit="cover" style={styles.featuredImage} />
          <View style={styles.featuredMeta}>
            <Text style={styles.featuredCategory}>EDITOR'S PICK</Text>
            <Text style={styles.featuredTitle}>{stories[0].title}</Text>
            <Text style={styles.featuredLink}>READ STORY <Feather name="arrow-up-right" size={13} color={colors.primary} /></Text>
          </View>
        </Pressable>
        <Text style={styles.latestLabel}>LATEST STORIES</Text>
        <View style={styles.list}>
          {filteredStories.slice(1).map((story) => <StoryCard key={story.id} story={story} />)}
        </View>
        {filteredStories.length <= 1 && <Text style={styles.empty}>No stories in this category yet.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15 },
  intro: { color: '#9298A6', fontSize: 14, lineHeight: 19, flex: 1, paddingRight: 12 },
  searchButton: { width: 40, height: 40, borderWidth: 1, borderColor: '#303643', alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 13, height: 46, borderWidth: 1, borderColor: '#303643' },
  searchInput: { flex: 1, color: '#F5F1E9', fontSize: 14 },
  categoryRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 22 },
  category: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#303643' },
  categoryText: { color: '#9298A6', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  featured: { marginHorizontal: 20, backgroundColor: '#13161E' },
  featuredImage: { width: '100%', height: 210 },
  featuredMeta: { padding: 16 },
  featuredCategory: { color: '#F2B86B', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  featuredTitle: { color: '#F5F1E9', fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 9 },
  featuredLink: { color: '#3E79FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 17 },
  latestLabel: { color: '#9298A6', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginHorizontal: 20, marginTop: 33, marginBottom: 17 },
  list: { gap: 20, marginHorizontal: 20 },
  empty: { color: '#9298A6', fontSize: 14, marginHorizontal: 20, paddingVertical: 30 },
});