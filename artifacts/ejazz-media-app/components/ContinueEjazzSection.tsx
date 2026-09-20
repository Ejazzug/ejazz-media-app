import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PODCAST_SHOWS, usePodcastFeed, type PodcastSlug } from '@/lib/podcasts';

function PodcastShowCard({ slug, name }: { slug: PodcastSlug; name: string }) {
  const router = useRouter();
  const feed = usePodcastFeed(slug);
  const latestEpisode = feed.data?.episodes[0];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/radio', params: { mode: 'podcasts' } })}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name} podcast`}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
    >
      <Text style={styles.showName}>{name}</Text>
      {feed.isLoading ? (
        <ActivityIndicator size="small" color="#7890AE" style={styles.spinner} />
      ) : (
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {latestEpisode ? latestEpisode.title : 'New episodes drop regularly'}
        </Text>
      )}
    </Pressable>
  );
}

export function ContinueEjazzSection() {
  if (PODCAST_SHOWS.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={styles.title}>Continue The EJazz</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {PODCAST_SHOWS.map((show) => (
          <PodcastShowCard key={show.slug} slug={show.slug} name={show.name} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  heading: { marginBottom: 12 },
  title: { color: '#F7F9FC', fontSize: 20, fontWeight: '700' },
  row: { gap: 12, paddingRight: 4 },
  card: {
    width: 200,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 6,
  },
  showName: { color: '#F7F9FC', fontSize: 15, fontWeight: '700' },
  episodeTitle: { color: '#A7B7CC', fontSize: 12, lineHeight: 16 },
  spinner: { alignSelf: 'flex-start', marginTop: 2 },
});
