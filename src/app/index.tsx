import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, NoticeBanner, StatusCard, type Tone } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { linkStateText, resultMessage } from '@/state/errors';
import type { RippleState } from '@/state/rippleController';
import { useRipple } from '@/state/RippleProvider';
import type { LinkState } from '@/ble/transport';

export default function HomeScreen() {
  const { state, ripple } = useRipple();
  const { caseConnection, currentCase, status, notice, commandPending } = state;
  const now = useNow(caseConnection === 'reconnecting');

  if (!state.ready) {
    return (
      <Screen>
        <ActivityIndicator size="large" accessibilityLabel="Loading" />
      </Screen>
    );
  }

  const caseView = describeCase(state, now);
  const linkState = status?.linkState ?? 'idle';
  const hasHearingDevice = !!status?.device && ['connecting', 'connected', 'streaming'].includes(linkState);

  return (
    <Screen>
      {notice ? <NoticeBanner {...notice} onDismiss={() => ripple.dismissNotice()} /> : null}

      <StatusCard heading="Ripple Case" title={caseView.title} detail={caseView.detail} tone={caseView.tone}>
        {caseConnection === 'connected' ? (
          <Button label="Disconnect Ripple Case" variant="secondary" onPress={() => ripple.disconnectCase()} />
        ) : caseConnection === 'reconnecting' ? (
          <>
            <Button label="Try again now" onPress={() => ripple.retryNow()} />
            <Button label="Stop trying" variant="secondary" onPress={() => ripple.disconnectCase()} />
          </>
        ) : caseConnection === 'disconnected' && currentCase ? (
          <>
            <Button label={`Connect to ${currentCase.name}`} onPress={() => ripple.retryNow()} />
            <Button
              label="Find a different Ripple Case"
              variant="secondary"
              onPress={() => router.push('/find-case')}
            />
          </>
        ) : caseConnection === 'disconnected' ? (
          <Button label="Find your Ripple Case" onPress={() => router.push('/find-case')} />
        ) : null}
      </StatusCard>

      {caseConnection === 'connected' ? (
        <StatusCard
          heading="Hearing device"
          title={linkStateText(linkState, status?.device)}
          detail={linkState === 'error' && status ? resultMessage(status.errorCode) : undefined}
          tone={LINK_TONE[linkState]}>
          <Button
            label={linkState === 'streaming' ? 'Change hearing device' : 'Choose hearing device'}
            variant={linkState === 'streaming' ? 'secondary' : 'primary'}
            onPress={() => router.push('/choose-device')}
          />
          {hasHearingDevice ? (
            <Button
              label="Disconnect hearing device"
              variant="danger"
              busy={commandPending}
              onPress={() => ripple.disconnectHearing()}
            />
          ) : null}
        </StatusCard>
      ) : null}

      {ripple.demo ? <DemoPanel /> : null}
    </Screen>
  );
}

const LINK_TONE: Record<LinkState, Tone> = {
  idle: 'neutral',
  scanning: 'busy',
  connecting: 'busy',
  connected: 'success',
  streaming: 'success',
  error: 'danger',
};

function describeCase(s: RippleState, now: number): { title: string; detail?: string; tone: Tone } {
  const name = s.currentCase?.name;
  switch (s.caseConnection) {
    case 'connected':
      return { title: 'Connected', detail: name, tone: 'success' };
    case 'connecting':
      return { title: 'Connecting…', detail: name, tone: 'busy' };
    case 'reconnecting': {
      const secs = s.nextRetryAt ? Math.max(0, Math.ceil((s.nextRetryAt - now) / 1000)) : 0;
      return {
        title: 'Reconnecting…',
        detail: `Looking for ${name ?? 'your Ripple Case'}. ${secs > 0 ? `Trying again in ${secs} seconds.` : 'Trying now.'}`,
        tone: 'warning',
      };
    }
    case 'disconnected':
      return name
        ? { title: 'Not connected', detail: name, tone: 'neutral' }
        : { title: 'Not set up yet', detail: 'Find your Ripple Case to get started.', tone: 'neutral' };
  }
}

function DemoPanel() {
  const { state, ripple } = useRipple();
  const demo = ripple.demo!;
  return (
    <Card>
      <View style={styles.demoText}>
        <ThemedText type="label">Demo mode</ThemedText>
        <ThemedText themeColor="textSecondary">
          This app is using a pretend Ripple Case and pretend hearing devices.
        </ThemedText>
      </View>
      {__DEV__ ? (
        <>
          <Button
            label="Simulate going out of range"
            variant="secondary"
            disabled={state.caseConnection !== 'connected'}
            onPress={() => demo.simulateOutOfRange()}
          />
          <Button
            label={state.adapter === 'poweredOn' ? 'Simulate Bluetooth off' : 'Simulate Bluetooth on'}
            variant="secondary"
            onPress={() => demo.setAdapterState(state.adapter === 'poweredOn' ? 'poweredOff' : 'poweredOn')}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  demoText: { gap: Spacing.one },
});
