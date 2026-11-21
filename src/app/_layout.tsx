import { Inter_500Medium } from '@expo-google-fonts/inter';
import { PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { BrandFonts, Colors } from '@/constants/theme';
import { RippleProvider } from '@/state/RippleProvider';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function navTheme(base: Theme, c: (typeof Colors)['light' | 'dark']): Theme {
  return {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.background, card: c.background, text: c.text },
  };
}
const LightNav = navTheme(DefaultTheme, Colors.light);
const DarkNav = navTheme(DarkTheme, Colors.dark);

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkNav : LightNav}>
      <RippleProvider>
        <Stack
          screenOptions={{
            headerTitleStyle: { fontSize: 22, fontFamily: BrandFonts.heading },
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
          }}>
          <Stack.Screen name="index" options={{ title: 'Ripple', headerTitle: () => <BrandLogo /> }} />
          <Stack.Screen name="find-case" options={{ title: 'Find your Ripple Case' }} />
          <Stack.Screen name="choose-device" options={{ title: 'Choose hearing device' }} />
        </Stack>
      </RippleProvider>
    </ThemeProvider>
  );
}
