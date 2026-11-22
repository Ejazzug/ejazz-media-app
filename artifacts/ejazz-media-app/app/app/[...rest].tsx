import { useRouter, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { destinationFromPath, destinationRoute } from '@/lib/destination';

/**
 * WHERE A SHARED LINK LANDS (owner, task #1: "deep links open the exact item").
 *
 * One route for every link EJazz hands out: `/app/article/123`, `/app/play/xtra`,
 * `/app/episode/echoes-of-fame/<ref>`. The path IS the destination grammar with slashes
 * instead of colons (lib/destination.ts `destinationFromPath`), so a link and a push aim at
 * the same places through the same code, and adding a destination adds a link for free.
 *
 * Both forms arrive here:
 *   ejazz-media-app://app/article/123          the app's own scheme, which works today
 *   https://control.ejazzug.com/app/article/123  once the store build carries the intent
 *                                                filter; until then the web page at that
 *                                                URL bounces to the scheme above
 *
 * It never STAYS on screen. A link is an instruction, not a destination, so this translates
 * and replaces itself -- `replace`, not `push`, or Back would return to a blank screen. An
 * unrecognised path goes Home rather than nowhere: someone who tapped an EJazz link has
 * opened the app, which is most of what the link was for.
 */
export default function DeepLinkScreen() {
  const router = useRouter();
  const colors = useColors();
  const { rest } = useLocalSearchParams<{ rest?: string | string[] }>();

  React.useEffect(() => {
    const segments = Array.isArray(rest) ? rest : rest ? [rest] : [];
    const dest = destinationFromPath(segments.join('/'));
    const route = dest ? destinationRoute(dest) : null;
    // Replaced, never pushed: this screen is a translation step, not a place.
    if (route) router.replace(route as never);
    else router.replace('/(tabs)');
  }, [rest, router]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
