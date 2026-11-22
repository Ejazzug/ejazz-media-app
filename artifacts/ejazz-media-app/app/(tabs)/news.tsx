import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditorialPlaceholder, MINI_PLAYER_CLEARANCE, ScreenHeader, StoryCard } from '@/components/MediaComponents';
import { useColors } from '@/hooks/useColors';
import { MIN_SEARCH_LENGTH, NEWS_CATEGORIES, NEWS_CHIP_CATEGORIES, useFeaturedNews, useLatestNews, useNewsForShow, useNewsSearch, usePodcastCategories } from '@/lib/news';
import { OfflineState } from '@/components/OfflineState';
import { useService } from '@/lib/reachability';
import { usePodcastShows } from '@/lib/appConfig';

/** The carousel's cards are one screen wide, less the 20pt gutter each side. */
const CARD_WIDTH = Dimensions.get('window').width - 40;
/** How many top stories the carousel holds (owner: "top-stories carousel (3, swipeable)"). */
const CAROUSEL_SIZE = 3;

export default function NewsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // AN AIMED TAP can open News on one category (lib/destination.ts): "go to the Chart Buzz
  // stories". Only a category the app actually has is honoured -- an id from an older or a
  // mistyped push must not leave the screen empty with no chip looking selected.
  const { category } = useLocalSearchParams<{ category?: string }>();
  const asked = Number(category);
  const askedCategory =
    Number.isFinite(asked) && NEWS_CATEGORIES.some((c) => c.id === asked) ? asked : null;
  /* `null` is ALL -- the mixed latest across every category that has a chip. It is the
     default now that Top Stories is the carousel and not a tab, and the ALL chip is the way
     back to it after picking one. */
  const [categoryId, setCategoryId] = useState<number | null>(askedCategory ?? null);
  /**
   * THE PODCAST CHIP FILTERS THIS SCREEN, it no longer leaves it (owner, 2026-11-23: *"in
   * news categories i need articles with tags of the podcasts the podcasts themselves"*).
   * Picking a show puts its own episodes at the top and the stories TAGGED with it below;
   * picking a category chip clears it again.
   */
  const [podcast, setPodcast] = useState<{ slug: string; name: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  /**
   * Search runs on the server now, so it is debounced: a request per keystroke would both
   * hammer WordPress and make the list flicker between half-typed answers.
   */
  const [searchTerm, setSearchTerm] = useState('');
  /** `false` searches the whole archive -- the one way to reach an article with no chip. */
  const [searchInCategory, setSearchInCategory] = useState(true);
  React.useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);
  // Follows a LATER instruction too: a listener already on this screen who taps a second
  // category push should move, and `useState` alone only reads its argument once.
  const appliedCategory = React.useRef<number | null>(askedCategory);
  React.useEffect(() => {
    if (askedCategory == null || appliedCategory.current === askedCategory) return;
    appliedCategory.current = askedCategory;
    setCategoryId(askedCategory);
  }, [askedCategory]);
  const featured = useFeaturedNews();
  const latest = useLatestNews(categoryId ?? undefined);
  const search = useNewsSearch(searchTerm, searchInCategory ? categoryId : null);
  const newsService = useService('news');
  const shows = usePodcastShows();
  /* Every show that has a category of its own; the ones that have none get no chip. */
  const podcastCategories = usePodcastCategories(shows);
  const podcastChips = useMemo(
    () => shows.filter((show) => (podcastCategories.data?.[show.slug] ?? []).length > 0),
    [shows, podcastCategories.data],
  );
  const showStories = useNewsForShow(podcast ? podcastCategories.data?.[podcast.slug] : undefined);
  /** The carousel: the newest top stories, up to three. */
  const carousel = useMemo(() => (featured.data ?? []).slice(0, CAROUSEL_SIZE), [featured.data]);
  const stories = useMemo(
    () => latest.data?.pages.flatMap((page) => page.stories) ?? [],
    [latest.data],
  );
  const searching = searchTerm.length >= MIN_SEARCH_LENGTH;
  const searchStories = useMemo(
    () => search.data?.pages.flatMap((page) => page.stories) ?? [],
    [search.data],
  );
  const showStoryList = useMemo(
    () => showStories.data?.pages.flatMap((page) => page.stories) ?? [],
    [showStories.data],
  );
  /** One list, whichever mode the screen is in, so the markup below has one code path. */
  const list = searching ? searchStories : podcast ? showStoryList : stories;
  const listQuery = searching ? search : podcast ? showStories : latest;
  /**
   * A show with no tag on the site is not an error: it means nobody has filed a story under
   * it yet. The episodes still show, and the list below says so plainly.
   */
  const noShowCategory = podcast !== null && podcastCategories.isFetched
    && (podcastCategories.data?.[podcast.slug] ?? []).length === 0;
  const refresh = () => {
    featured.refetch();
    latest.refetch();
    if (searching) search.refetch();
    if (podcast) showStories.refetch();
  };
  const newsError = latest.error instanceof Error
    ? latest.error.message
    : featured.error instanceof Error
      ? featured.error.message
      : 'Unknown News API error.';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_CLEARANCE + insets.bottom }}
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
          <>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search EJazz News"
                placeholderTextColor={colors.mutedForeground}
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => setSearchTerm(query.trim())}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear the search">
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.scopeRow}>
              {[true, false].map((inCategory) => (
                <Pressable
                  key={String(inCategory)}
                  onPress={() => setSearchInCategory(inCategory)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: searchInCategory === inCategory }}
                  style={[styles.scope, searchInCategory === inCategory && styles.scopeOn]}
                >
                  <Text style={[styles.scopeText, searchInCategory === inCategory && styles.scopeTextOn]}>
                    {inCategory
                      ? (NEWS_CATEGORIES.find((c) => c.id === categoryId)?.label ?? 'EJazz News').toUpperCase()
                      : 'EVERYTHING'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* The chip row carries news categories AND the podcast shows (owner, task #2:
            "podcast categories on the chip row"). A podcast chip does not filter this list --
            it leaves for that show, which is why the two groups are divided and the podcast
            ones wear a microphone. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <Pressable
            onPress={() => { setCategoryId(null); setPodcast(null); setQuery(''); }}
            accessibilityRole="button"
            accessibilityState={{ selected: !podcast && categoryId === null }}
            style={[styles.category,
                    !podcast && categoryId === null && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.categoryText,
                          !podcast && categoryId === null && { color: colors.accentForeground }]}>
              ALL
            </Text>
          </Pressable>
          {NEWS_CHIP_CATEGORIES.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => {
                setCategoryId(category.id);
                setPodcast(null);
                setQuery('');
              }}
              style={[styles.category,
                      !podcast && categoryId === category.id && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.categoryText,
                            !podcast && categoryId === category.id && { color: colors.accentForeground }]}>
                {category.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
          {podcastChips.length > 0 ? <View style={styles.chipDivider} /> : null}
          {podcastChips.map((show) => {
            const on = podcast?.slug === show.slug;
            return (
              <Pressable
                key={show.slug}
                onPress={() => {
                  setPodcast(on ? null : { slug: show.slug, name: show.name });
                  setQuery('');
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Stories and episodes for the podcast ${show.name}`}
                style={[styles.category, styles.podcastChip, on && { backgroundColor: colors.accent }]}
              >
                <Feather name="mic" size={11} color={on ? colors.accentForeground : colors.primary} />
                <Text style={[styles.categoryText, on && { color: colors.accentForeground }]}>
                  {show.name.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Three top stories, swipeable one card at a time. Hidden while searching: a search
            is a question about the archive, and a carousel of something else is in the way. */}
        {carousel.length > 0 && !searching && !podcast ? (
          <>
            <Text style={styles.featuredLabel}>FEATURED • TOP STORIES</Text>
            <ScrollView
              horizontal
              pagingEnabled
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + 12}
              snapToAlignment="start"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
            >
              {carousel.map((story, index) => (
                <Pressable
                  key={story.id}
                  onPress={() => router.push(`/article?id=${story.id}`)}
                  style={[styles.featured, { width: CARD_WIDTH }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Top story ${index + 1} of ${carousel.length}: ${story.title}`}
                >
                  {story.imageUrl ? (
                    <Image source={story.imageUrl} contentFit="cover" style={styles.featuredImage} />
                  ) : (
                    <EditorialPlaceholder label="TOP STORIES" style={styles.featuredImage} />
                  )}
                  <View style={styles.featuredMeta}>
                    <Text style={styles.featuredDate}>{story.dateLabel}</Text>
                    <Text numberOfLines={3} style={styles.featuredTitle}>{story.title}</Text>
                    <Text style={styles.featuredLink}>
                      READ STORY <Feather name="arrow-up-right" size={13} color={colors.primary} />
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            {carousel.length > 1 ? (
              <View style={styles.dots}>
                {carousel.map((story) => <View key={story.id} style={styles.dot} />)}
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={styles.latestLabel}>
          {searching
            ? `RESULTS FOR “${searchTerm.toUpperCase()}” • ${searchInCategory ? 'THIS CATEGORY' : 'EVERYTHING'}`
            : podcast
              ? `${podcast.name.toUpperCase()} • LATEST`
              : categoryId === null
                ? 'EJAZZ NEWS • LATEST'
                : `${NEWS_CATEGORIES.find((category) => category.id === categoryId)?.label.toUpperCase()} • LATEST`}
        </Text>

        {newsService.unreachable && list.length === 0 ? (
          <OfflineState kind="news" service="news" />
        ) : noShowCategory ? (
          <View style={styles.status}>
            <Feather name="tag" size={24} color={colors.mutedForeground} />
            <Text style={styles.statusText}>
              {`No stories are showStories ${podcast?.name ?? 'this show'} yet — the episodes are above.`}
            </Text>
          </View>
        ) : listQuery.isLoading || (podcast && podcastCategories.isLoading) ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>{searching ? 'Searching EJazz News…' : 'Loading EJazz News…'}</Text>
          </View>
        ) : listQuery.isError || (!searching && featured.isError) ? (
          <View style={styles.status}>
            <Feather name="wifi-off" size={24} color={colors.accent} />
            <Text style={styles.statusTitle}>Couldn’t load stories right now.</Text>
            <Text style={styles.statusText}>{newsError}</Text>
            <Pressable onPress={() => listQuery.refetch()}><Text style={styles.retry}>TRY AGAIN</Text></Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.status}>
            <Feather name="search" size={24} color={colors.mutedForeground} />
            <Text style={styles.statusText}>
              {searching
                ? searchInCategory
                  ? 'Nothing in this category matches. Try EVERYTHING.'
                  : 'Nothing in the archive matches that.'
                : podcast
                  ? `No stories are showStories ${podcast.name} yet — the episodes are above.`
                  : 'No stories have been published here yet.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.list}>
              {list.map((story) => <StoryCard key={story.id} story={story} />)}
            </View>
            {listQuery.hasNextPage ? (
              <Pressable
                onPress={() => listQuery.fetchNextPage()}
                disabled={listQuery.isFetchingNextPage}
                style={styles.loadMore}
              >
                {listQuery.isFetchingNextPage ? (
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
  categoryRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 22, alignItems: 'center' },
  category: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#2C4B75' },
  podcastChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: '#204570', backgroundColor: 'rgba(255,255,255,0.03)' },
  chipDivider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: '#2C4B75' },
  scopeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 16 },
  scope: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#2C4B75' },
  scopeOn: { borderColor: '#E43B48', backgroundColor: 'rgba(228,59,72,0.16)' },
  scopeText: { color: '#A7B7CC', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  scopeTextOn: { color: '#F7F9FC' },
  carousel: { gap: 12, paddingHorizontal: 20 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12 },
  dot: { width: 18, height: 2, backgroundColor: '#2C4B75' },
  categoryText: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  featuredLabel: { color: '#FF6B6B', fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginHorizontal: 20, marginBottom: 10 },
  featured: { backgroundColor: '#0D2A57' },
  featuredImage: { width: '100%', height: 210 },
  featuredMeta: { padding: 16 },
  featuredDate: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  featuredTitle: { color: '#F7F9FC', fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 9 },
  featuredLink: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 17 },
  episodeList: { paddingHorizontal: 20, gap: 8, marginBottom: 4 },
  episode: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
             paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
  episodeMeta: { flex: 1, gap: 2 },
  episodeTitle: { color: '#F7F9FC', fontSize: 13, fontWeight: '600' },
  episodeDate: { color: '#8C96AD', fontSize: 11 },
  episodeAll: { alignSelf: 'flex-start', paddingVertical: 4 },
  episodeEmpty: { color: '#8C96AD', fontSize: 12, paddingHorizontal: 20, paddingBottom: 8 },
  latestLabel: { color: '#A7B7CC', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginHorizontal: 20, marginTop: 33, marginBottom: 17 },
  list: { gap: 20, marginHorizontal: 20 },
  status: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  statusTitle: { color: '#F7F9FC', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  statusText: { color: '#A7B7CC', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retry: { color: '#E43B48', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, padding: 10 },
  loadMore: { height: 52, marginHorizontal: 20, marginTop: 28, borderWidth: 1, borderColor: '#2C4B75', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadMoreText: { color: '#E43B48', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
});