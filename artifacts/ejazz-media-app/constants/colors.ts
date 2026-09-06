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
    text: '#F5F1E9',
    tint: '#3E79FF',
    background: '#0A0B0F',
    foreground: '#F5F1E9',
    card: '#13161E',
    cardForeground: '#F5F1E9',
    primary: '#3E79FF',
    primaryForeground: '#FFFFFF',
    secondary: '#191D27',
    secondaryForeground: '#F5F1E9',
    muted: '#1D222D',
    mutedForeground: '#9298A6',
    accent: '#F2B86B',
    accentForeground: '#0A0B0F',
    destructive: '#E66C6C',
    destructiveForeground: '#FFFFFF',
    border: '#282D38',
    input: '#303643',
    success: '#7BC995',
    overlay: '#0A0B0FCC',
    ink: '#07080B',
  },
  dark: {
    text: '#F5F1E9',
    tint: '#3E79FF',
    background: '#0A0B0F',
    foreground: '#F5F1E9',
    card: '#13161E',
    cardForeground: '#F5F1E9',
    primary: '#3E79FF',
    primaryForeground: '#FFFFFF',
    secondary: '#191D27',
    secondaryForeground: '#F5F1E9',
    muted: '#1D222D',
    mutedForeground: '#9298A6',
    accent: '#F2B86B',
    accentForeground: '#0A0B0F',
    destructive: '#E66C6C',
    destructiveForeground: '#FFFFFF',
    border: '#282D38',
    input: '#303643',
    success: '#7BC995',
    overlay: '#0A0B0FCC',
    ink: '#07080B',
  },
  radius: 14,
};

export default colors;
