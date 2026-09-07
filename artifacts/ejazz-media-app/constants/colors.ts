/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#F7F9FC',
    tint: '#E43B48',
    background: '#071B3A',
    foreground: '#F7F9FC',
    card: '#0D2A57',
    cardForeground: '#F7F9FC',
    primary: '#E43B48',
    primaryForeground: '#FFFFFF',
    secondary: '#123363',
    secondaryForeground: '#F7F9FC',
    muted: '#163761',
    mutedForeground: '#A7B7CC',
    accent: '#FF6B6B',
    accentForeground: '#071B3A',
    destructive: '#FF7A82',
    destructiveForeground: '#FFFFFF',
    border: '#204570',
    input: '#2C4B75',
    success: '#7BC995',
    overlay: '#071B3ACC',
    ink: '#041127',
    gradientStart: '#34152E',
    gradientEnd: '#041127',
  },
  dark: {
    text: '#F7F9FC',
    tint: '#E43B48',
    background: '#071B3A',
    foreground: '#F7F9FC',
    card: '#0D2A57',
    cardForeground: '#F7F9FC',
    primary: '#E43B48',
    primaryForeground: '#FFFFFF',
    secondary: '#123363',
    secondaryForeground: '#F7F9FC',
    muted: '#163761',
    mutedForeground: '#A7B7CC',
    accent: '#FF6B6B',
    accentForeground: '#071B3A',
    destructive: '#FF7A82',
    destructiveForeground: '#FFFFFF',
    border: '#204570',
    input: '#2C4B75',
    success: '#7BC995',
    overlay: '#071B3ACC',
    ink: '#041127',
    gradientStart: '#34152E',
    gradientEnd: '#041127',
  },
  radius: 14,
};

export default colors;
