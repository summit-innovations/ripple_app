import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerTitleStyle: { fontSize: 22, fontWeight: '700' } }}>
        <Stack.Screen name="index" options={{ title: 'Ripple' }} />
      </Stack>
    </ThemeProvider>
  );
}
