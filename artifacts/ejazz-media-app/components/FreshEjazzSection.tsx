import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type FreshEjazzItem = {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
};

// Placeholder lineup until the fresh-drops feed is wired up to a real source.
export const FRESH_EJAZZ_MOCK: FreshEjazzItem[] = [
  { id: 'fresh-1', tag: 'ON ROTATION', title: 'New on AT40', subtitle: "This week's freshest chart adds" },
  { id: 'fresh-2', tag: 'TRENDING', title: 'Afrobeats Heat', subtitle: 'The sound everyone keeps running back' },
  { id: 'fresh-3', tag: 'INDIE', title: 'Underground Finds', subtitle: 'Deep cuts worth your ears' },
  { id: 'fresh-4', tag: 'THROWBACK', title: 'Pop Rewind', subtitle: 'The hits that never left rotation' },
];

export function FreshEjazzSection({ items = FRESH_EJAZZ_MOCK }: { items?: FreshEjazzItem[] }) {
  const router = useRouter();

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={styles.title}>Fresh EJazz 🎧</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => router.push('/radio')}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
          >
            <Text style={styles.tag}>{item.tag}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
          </Pressable>
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
    width: 168,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#204570',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 6,
  },
  tag: { color: '#FF6B6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  cardTitle: { color: '#F7F9FC', fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: '#A7B7CC', fontSize: 12, lineHeight: 16 },
});
