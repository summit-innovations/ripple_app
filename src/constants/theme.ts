/**
 * High-contrast palette and type scale for older users with hearing loss.
 * Every status uses an icon + words as well as color, so color is never the only signal.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // Brand colors from rippletech.store. Lime (`accent`) is only ever a fill behind dark text,
  // never a text color on a light background.
  light: {
    text: '#202124',
    textSecondary: '#4A5568',
    background: '#FAFAF7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF3C4',
    border: '#5B6069',
    primary: '#182D45',
    accent: '#E6F65A',
    onAccent: '#202124',
    success: '#0A6B2E',
    warning: '#8A4B00',
    danger: '#B3121F',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#D2D5DA',
    background: '#0B0F14',
    backgroundElement: '#16202C',
    backgroundSelected: '#2A3442',
    border: '#9DA3AD',
    primary: '#E6F65A',
    accent: '#E6F65A',
    onAccent: '#000000',
    success: '#6EE59A',
    warning: '#FFC266',
    danger: '#FF8A8A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Brand typefaces (same as rippletech.store), loaded in the root layout with useFonts. */
export const BrandFonts = {
  headingHeavy: 'PlusJakartaSans_800ExtraBold',
  heading: 'PlusJakartaSans_700Bold',
  body: 'Inter_500Medium',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Minimum height of anything tappable. */
export const MinTapTarget = 64;
export const MaxContentWidth = 640;
