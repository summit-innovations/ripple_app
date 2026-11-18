/**
 * Picks the transport: the mock when EXPO_PUBLIC_USE_MOCK_BLE=1, on web, in Expo Go, or when the
 * native BLE module is missing. Otherwise the real BLE transport. Never crashes in Expo Go.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';

import { MockTransport } from './mockTransport';
import type { RippleTransport } from './transport';

export * from './transport';
export { MockTransport } from './mockTransport';

let instance: RippleTransport | undefined;

export function getTransport(): RippleTransport {
  instance ??= createTransport();
  return instance;
}

function createTransport(): RippleTransport {
  if (process.env.EXPO_PUBLIC_USE_MOCK_BLE === '1') return new MockTransport();
  if (Platform.OS === 'web') return new MockTransport();
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return new MockTransport();
  // The library calls TurboModuleRegistry.getEnforcing('BlePlx') on import, which throws if the
  // native module isn't in this build. Check first so we never even load it in that case.
  if (!TurboModuleRegistry.get('BlePlx')) {
    console.warn('[ripple] BLE native module missing; using the mock transport');
    return new MockTransport();
  }
  try {
    // Lazy require so the library is only loaded when it can work.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BlePlxTransport } = require('./blePlxTransport') as typeof import('./blePlxTransport');
    return new BlePlxTransport();
  } catch (e) {
    console.warn('[ripple] BLE transport failed to start; using the mock transport', e);
    return new MockTransport();
  }
}
