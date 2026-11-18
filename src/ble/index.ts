/**
 * Picks the transport: the mock when EXPO_PUBLIC_USE_MOCK_BLE=1, on web, in Expo Go, or when the
 * native BLE module is missing. Otherwise the real BLE transport. Never crashes in Expo Go.
 */

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
  return new MockTransport();
}
