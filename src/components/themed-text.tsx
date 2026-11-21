import { StyleSheet, Text, type TextProps } from 'react-native';

import { BrandFonts, ThemeColor } from '@/constants/theme';
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
    fontFamily: BrandFonts.body,
  },
  default: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: BrandFonts.body,
  },
  label: {
    fontSize: 22,
    lineHeight: 30,
    fontFamily: BrandFonts.heading,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontFamily: BrandFonts.heading,
  },
  title: {
    fontSize: 34,
    lineHeight: 42,
    fontFamily: BrandFonts.headingHeavy,
  },
});
