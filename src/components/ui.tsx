/**
 * Large, high-contrast building blocks. Every tappable thing is at least MinTapTarget tall,
 * every state has an icon + words (never color alone), and nothing relies on sound.
 */

import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandFonts, MinTapTarget, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signalText } from '@/state/errors';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'busy';

const TONE_COLOR: Record<Tone, ThemeColor> = {
  neutral: 'textSecondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  busy: 'primary',
};
const TONE_GLYPH: Record<Exclude<Tone, 'busy'>, string> = {
  neutral: '–',
  success: '✓',
  warning: '!',
  danger: '✕',
};

export function haptic(kind: 'success' | 'error' | 'tap') {
  if (Platform.OS === 'web') return;
  if (kind === 'tap') void Haptics.selectionAsync().catch(() => {});
  else
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
}

export function ToneIcon({ tone, size = 40 }: { tone: Tone; size?: number }) {
  const theme = useTheme();
  const color = theme[TONE_COLOR[tone]];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.icon, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      {tone === 'busy' ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText style={{ color, fontSize: size * 0.55, lineHeight: size * 0.7, fontFamily: BrandFonts.headingHeavy }}>
          {TONE_GLYPH[tone]}
        </ThemedText>
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  hint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  const theme = useTheme();
  const filled = variant === 'primary';
  const fg = filled ? theme.onAccent : variant === 'danger' ? theme.danger : theme.primary;
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          // Lime fill with a dark edge so the button outline stays visible on the off-white page.
          backgroundColor: filled ? theme.accent : theme.background,
          borderColor: filled ? theme.text : fg,
          opacity: inactive ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : null}
      <ThemedText type="label" style={{ color: fg, textAlign: 'center' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

/** A status block: icon, small heading, big state line, optional detail. Announced when it changes. */
export function StatusCard({
  heading,
  title,
  detail,
  tone,
  children,
}: {
  heading: string;
  title: string;
  detail?: string;
  tone: Tone;
  children?: ReactNode;
}) {
  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`${heading}: ${title}${detail ? `. ${detail}` : ''}`}
        accessibilityLiveRegion="polite"
        style={styles.statusRow}>
        <ToneIcon tone={tone} />
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {heading}
          </ThemedText>
          <ThemedText type="subtitle">{title}</ThemedText>
          {detail ? <ThemedText>{detail}</ThemedText> : null}
        </View>
      </View>
      {children ? <View style={styles.cardActions}>{children}</View> : null}
    </Card>
  );
}

export function NoticeBanner({
  kind,
  text,
  onDismiss,
}: {
  kind: 'error' | 'info';
  text: string;
  onDismiss?: () => void;
}) {
  const theme = useTheme();
  const color = kind === 'error' ? theme.danger : theme.primary;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.banner, { borderColor: color, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.statusRow}>
        <ToneIcon tone={kind === 'error' ? 'danger' : 'neutral'} size={32} />
        <ThemedText style={styles.flex}>{text}</ThemedText>
      </View>
      {onDismiss ? <Button label="OK" variant="secondary" onPress={onDismiss} /> : null}
    </View>
  );
}

export function SignalBars({ rssi }: { rssi: number }) {
  const theme = useTheme();
  const { bars, label } = signalText(rssi);
  return (
    <View style={styles.signal} accessibilityLabel={label}>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[1, 2, 3, 4].map((b) => (
          <View
            key={b}
            style={{
              width: 7,
              height: 6 + b * 6,
              borderRadius: 2,
              backgroundColor: b <= bars ? theme.text : 'transparent',
              borderWidth: 1.5,
              borderColor: theme.text,
            }}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** A big tappable list row. */
export function ListRow({
  title,
  rssi,
  trailing,
  onPress,
  disabled,
  selected,
  hint,
}: {
  title: string;
  rssi?: number;
  trailing?: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, rssi !== undefined ? signalText(rssi).label : '', trailing ?? '']
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: selected ? theme.primary : theme.border,
          borderWidth: selected ? 3 : 1.5,
          backgroundColor: pressed || selected ? theme.backgroundSelected : theme.backgroundElement,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <View style={styles.flex}>
        <ThemedText type="label">{title}</ThemedText>
        {rssi !== undefined ? <SignalBars rssi={rssi} /> : null}
      </View>
      {trailing ? (
        <ThemedText type="label" themeColor="primary">
          {trailing}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.one },
  icon: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  button: {
    minHeight: MinTapTarget,
    borderRadius: 14,
    borderWidth: 2.5,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: 18, borderWidth: 1.5, padding: Spacing.four, gap: Spacing.three },
  cardActions: { gap: Spacing.three },
  statusRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  banner: { borderWidth: 3, borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  signal: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  row: {
    minHeight: MinTapTarget + 16,
    borderRadius: 14,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
