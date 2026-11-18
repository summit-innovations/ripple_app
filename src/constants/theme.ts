/**
 * High-contrast palette and type scale for older users with hearing loss.
 * Every status uses an icon + words as well as color, so color is never the only signal.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    textSecondary: '#3A3D42',
    background: '#FFFFFF',
    backgroundElement: '#F0F1F4',
    backgroundSelected: '#DDE3EE',
    border: '#5B6069',
    primary: '#0B4FC2',
    onPrimary: '#FFFFFF',
    success: '#0A6B2E',
    warning: '#8A4B00',
    danger: '#B3121F',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#D2D5DA',
    background: '#000000',
    backgroundElement: '#1C1D20',
    backgroundSelected: '#2B3442',
    border: '#9DA3AD',
    primary: '#7FB0FF',
    onPrimary: '#000000',
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
