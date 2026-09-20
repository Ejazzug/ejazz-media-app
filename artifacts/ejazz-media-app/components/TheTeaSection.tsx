import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { StoryCard } from '@/components/MediaComponents';
import { useLatestNews } from '@/lib/news';

const ENTERTAINMENT_CATEGORY_ID = 8871;
const MAX_STORIES = 6;

export function TheTeaSection() {
  const entertainment = useLatestNews(ENTERTAINMENT_CATEGORY_ID);
  const stories = (entertainment.data?.pages.flatMap((page) => page.stories) ?? []).slice(0, MAX_STORIES);

  if (!entertainment.isLoading && stories.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={styles.title}>The Tea ☕</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {stories.map((story) => (
          <View key={story.id} style={styles.cardWrap}>
            <StoryCard story={story} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  heading: { marginBottom: 12 },
  title: { color: '#F7F9FC', fontSize: 20, fontWeight: '700' },
  row: { gap: 16, paddingRight: 4 },
  cardWrap: { width: 260 },
});
