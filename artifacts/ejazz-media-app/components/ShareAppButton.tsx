import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useShareApp } from '@/lib/shareApp';

/**
 * "Share the app" icon for the top-right corner of a page. Opens the phone's share sheet with
 * an invitation and the download link. When the Control Room switches share buttons off it
 * leaves an empty spot of the same size, so the rest of the header does not shift.
 */
export function ShareAppButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const { enabled, shareApp } = useShareApp();
  if (!enabled) return <View style={[styles.button, style]} />;
  return (
    <Pressable
      onPress={shareApp}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Share the EJazz Media app"
      style={[styles.button, style]}
    >
      <Feather name="share-2" size={20} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
