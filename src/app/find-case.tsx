import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, haptic, ListRow, NoticeBanner } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRipple } from '@/state/RippleProvider';

export default function FindCaseScreen() {
  const { state, ripple } = useRipple();
  const [connectingId, setConnectingId] = useState<string>();
  const { active, cases } = state.caseScan;

  useFocusEffect(
    useCallback(() => {
      void ripple.startCaseScan();
      return () => ripple.stopCaseScan();
    }, [ripple]),
  );

  const connect = async (id: string, name: string) => {
    setConnectingId(id);
    const ok = await ripple.connectCase({ id, name });
    setConnectingId(undefined);
    if (ok) {
      haptic('success');
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      haptic('error');
    }
  };

  const sorted = [...cases].sort((a, b) => b.rssi - a.rssi);

  return (
    <Screen>
      {state.notice ? <NoticeBanner {...state.notice} onDismiss={() => ripple.dismissNotice()} /> : null}

      <ThemedText>Turn on your Ripple Case and keep it close to your phone. Then tap its name below.</ThemedText>

      <View style={styles.searching} accessibilityLiveRegion="polite">
        {active ? <ActivityIndicator size="large" /> : null}
        <ThemedText type="label">
          {active
            ? 'Searching…'
            : cases.length
              ? `Found ${cases.length} Ripple ${cases.length === 1 ? 'Case' : 'Cases'}`
              : 'No Ripple Cases found'}
        </ThemedText>
      </View>

      <View style={styles.list}>
        {sorted.map((c) => (
          <ListRow
            key={c.id}
            title={c.name}
            rssi={c.rssi}
            trailing={connectingId === c.id ? 'Connecting…' : state.currentCase?.id === c.id ? 'Your case' : undefined}
            disabled={!!connectingId}
            selected={connectingId === c.id}
            hint="Connects to this Ripple Case"
            onPress={() => connect(c.id, c.name)}
          />
        ))}
      </View>

      {!active && !connectingId ? (
        <Button label="Search again" variant="secondary" onPress={() => ripple.startCaseScan()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searching: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  list: { gap: Spacing.three },
});
