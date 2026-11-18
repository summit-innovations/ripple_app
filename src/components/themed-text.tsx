import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'label' | 'small';
  themeColor?: ThemeColor;
};

/** Text with large, readable defaults. Body text is 20pt. */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: 500,
  },
  default: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 500,
  },
  label: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
  },
  title: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: 800,
  },
});
