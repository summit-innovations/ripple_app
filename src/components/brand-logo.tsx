import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';

const LOGO = require('@/assets/images/logo.png');
const LOGO_WHITE = require('@/assets/images/logo-white.png');

/** The Ripple wordmark, black in light mode and white in dark mode. Read out as "Ripple". */
export function BrandLogo({ height = 36 }: { height?: number }) {
  const scheme = useColorScheme();
  return (
    <Image
      source={scheme === 'dark' ? LOGO_WHITE : LOGO}
      style={{ height, aspectRatio: 332 / 329 }}
      contentFit="contain"
      accessible
      accessibilityRole="header"
      accessibilityLabel="Ripple"
    />
  );
}
