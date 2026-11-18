/** Plain-language messages for everything that can go wrong. */

import type { AdapterState, HearingDevice, LinkState } from '@/ble/transport';
import { ResultCode } from '@/ble/uuids';

export function resultMessage(code: number): string {
  switch (code) {
    case ResultCode.OK:
      return 'Done.';
    case ResultCode.UNKNOWN_OPCODE:
      return "Your Ripple Case didn't understand the app. Please update the app and your Ripple Case.";
    case ResultCode.BAD_ARGUMENTS:
      return 'Your Ripple Case could not do that. Please try again.';
    case ResultCode.BUSY:
      return 'Your Ripple Case is busy. Wait a few seconds, then try again.';
    case ResultCode.NRF_TIMEOUT:
      return "The hearing device didn't answer. Make sure it is turned on and close by, then try again.";
    case ResultCode.NRF_ERROR:
      return 'Your Ripple Case had trouble talking to the hearing device. Please try again.';
    case ResultCode.NOT_CONNECTED_TO_HEARING_DEVICE:
      return 'No hearing device is connected right now.';
    case ResultCode.UNSUPPORTED_VERSION:
      return 'Your Ripple Case needs a software update to work with this app.';
    case ResultCode.APP_WRITE_FAILED:
      return "Can't reach your Ripple Case. Make sure it is turned on and close by.";
    case ResultCode.APP_TIMEOUT:
      return "Your Ripple Case didn't answer in time. Please try again.";
    default:
      return `Something went wrong (code ${code}). Please try again.`;
  }
}

export function adapterMessage(s: AdapterState): string | undefined {
  switch (s) {
    case 'poweredOff':
      return "Bluetooth is turned off. Turn it on in your phone's settings.";
    case 'unauthorized':
      return PERMISSION_DENIED;
    case 'unsupported':
      return "This phone doesn't support the kind of Bluetooth the Ripple Case uses.";
    default:
      return undefined;
  }
}

export const PERMISSION_DENIED =
  "Ripple needs permission to use Bluetooth. Please allow it in your phone's settings, then try again.";
export const CASE_NOT_FOUND = "Couldn't connect to your Ripple Case. Make sure it is turned on and close by.";
export const CASE_SCAN_FAILED = "Couldn't search for Ripple Cases. Please try again.";
export const CASE_LOST ='Lost connection to your Ripple Case. Bring it closer. We will keep trying.';

/** One-line description of the hearing-device link, for the Home screen. */
export function linkStateText(state: LinkState, device?: HearingDevice): string {
  const name = device?.name || 'your hearing device';
  switch (state) {
    case 'idle':
      return 'No hearing device connected';
    case 'scanning':
      return 'Looking for hearing devices…';
    case 'connecting':
      return `Connecting to ${name}…`;
    case 'connected':
      return `Connected to ${name}`;
    case 'streaming':
      return `Streaming to ${name}`;
    case 'error':
      return `Couldn't connect to ${name}`;
  }
}

/** Signal strength in words, so it never depends on reading bars alone. */
export function signalText(rssi: number): { bars: number; label: string } {
  if (rssi === 127) return { bars: 0, label: 'Signal unknown' };
  if (rssi >= -55) return { bars: 4, label: 'Strong signal' };
  if (rssi >= -67) return { bars: 3, label: 'Good signal' };
  if (rssi >= -78) return { bars: 2, label: 'Fair signal' };
  return { bars: 1, label: 'Weak signal' };
}
