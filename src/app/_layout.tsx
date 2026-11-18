import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { RippleProvider } from '@/state/RippleProvider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RippleProvider>
        <Stack
          screenOptions={{
            headerTitleStyle: { fontSize: 22, fontWeight: '700' },
            headerBackButtonDisplayMode: 'minimal',
          }}>
          <Stack.Screen name="index" options={{ title: 'Ripple' }} />
          <Stack.Screen name="find-case" options={{ title: 'Find your Ripple Case' }} />
          <Stack.Screen name="choose-device" options={{ title: 'Choose hearing device' }} />
        </Stack>
      </RippleProvider>
    </ThemeProvider>
  );
}
