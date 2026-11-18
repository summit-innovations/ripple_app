import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, haptic, ListRow, NoticeBanner, StatusCard } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { resultMessage } from '@/state/errors';
import { useRipple } from '@/state/RippleProvider';
import type { HearingDevice } from '@/ble/transport';

export default function ChooseDeviceScreen() {
  const { state, ripple } = useRipple();
  const { status, hearingScan, caseConnection, notice } = state;
  /** Address the user tapped. Progress comes from Status, not from the command Result. */
  const [selected, setSelected] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      void ripple.startHearingScan();
      return () => void ripple.stopHearingScan();
    }, [ripple]),
  );

  const pick = async (d: HearingDevice) => {
    setSelected(d.address);
    const accepted = await ripple.connectHearing(d);
    if (!accepted) setSelected(undefined);
  };

  const target = selected && status?.device?.address === selected ? status : undefined;
  const progress = target?.linkState;
  const done = progress === 'connected' || progress === 'streaming';

  // Feel it as well as see it: haptic on success or failure.
  const lastProgress = useRef(progress);
  useEffect(() => {
    if (progress === lastProgress.current) return;
    lastProgress.current = progress;
    if (progress === 'streaming') haptic('success');
    if (progress === 'error') haptic('error');
  }, [progress]);

  if (caseConnection !== 'connected') {
    return (
      <Screen>
        <StatusCard
          heading="Ripple Case"
          title="Not connected"
          detail="Connect to your Ripple Case first."
          tone="warning">
          <Button label="Back to home" onPress={() => router.back()} />
        </StatusCard>
      </Screen>
    );
  }

  const devices = [...hearingScan.devices].sort((a, b) => b.rssi - a.rssi);
  const current = status?.device;
  const busy = progress === 'connecting';

  return (
    <Screen>
      {notice ? <NoticeBanner {...notice} onDismiss={() => ripple.dismissNotice()} /> : null}

      {target ? (
        <StatusCard
          heading="Hearing device"
          title={
            busy
              ? `Connecting to ${target.device?.name}…`
              : done
                ? `${progress === 'streaming' ? 'Streaming to' : 'Connected to'} ${target.device?.name}`
                : progress === 'error'
                  ? `Couldn't connect to ${target.device?.name}`
                  : (target.device?.name ?? '')
          }
          detail={
            progress === 'error'
              ? resultMessage(target.errorCode)
              : busy
                ? 'This can take a few seconds. Keep the hearing device close by.'
                : undefined
          }
          tone={busy ? 'busy' : done ? 'success' : progress === 'error' ? 'danger' : 'neutral'}>
          {done ? <Button label="Done" onPress={() => router.back()} /> : null}
        </StatusCard>
      ) : (
        <ThemedText>
          Put your hearing devices in pairing mode and keep them close. Then tap their name below.
        </ThemedText>
      )}

      <View style={styles.searching} accessibilityLiveRegion="polite">
        {hearingScan.active ? <ActivityIndicator size="large" /> : null}
        <ThemedText type="label">
          {hearingScan.active
            ? 'Your Ripple Case is searching…'
            : devices.length
              ? `Found ${devices.length} hearing ${devices.length === 1 ? 'device' : 'devices'}`
              : 'No hearing devices found'}
        </ThemedText>
      </View>

      <View style={styles.list}>
        {devices.map((d) => (
          <ListRow
            key={d.address}
            title={d.name || 'Unnamed device'}
            rssi={d.rssi}
            trailing={
              selected === d.address
                ? undefined
                : current?.address === d.address && status?.linkState === 'streaming'
                  ? 'In use'
                  : undefined
            }
            selected={selected === d.address}
            disabled={busy || state.commandPending}
            hint="Streams to this hearing device"
            onPress={() => pick(d)}
          />
        ))}
      </View>

      {!hearingScan.active ? (
        <Button
          label="Search again"
          variant="secondary"
          disabled={busy || state.commandPending}
          onPress={() => {
            setSelected(undefined);
            void ripple.startHearingScan();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searching: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  list: { gap: Spacing.three },
});
