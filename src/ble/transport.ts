/**
 * The only way the app talks to a Ripple Case. Screens and state never import a BLE library;
 * they use a RippleTransport (MockTransport or BlePlxTransport), chosen in src/ble/index.ts.
 */

export type Unsubscribe = () => void;

/** The box, found by the phone. */
export interface RippleCaseInfo {
  /** Platform device id from the BLE library. */
  id: string;
  name: string;
  rssi: number;
}

/** Found by the Ripple Case and reported to the app. */
export interface HearingDevice {
  /** "AA:BB:CC:DD:EE:FF" */
  address: string;
  /** 0 = public, 1 = random */
  addressType: number;
  name: string;
  /** dBm; 127 = unknown */
  rssi: number;
}

export type LinkState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'streaming' | 'error';

export interface RippleStatus {
  linkState: LinkState;
  /** Current or target hearing device. */
  device?: HearingDevice;
  /** 0 = none */
  errorCode: number;
}

export interface CommandResult {
  ok: boolean;
  code: number;
}

/** The phone's own Bluetooth adapter. */
export type AdapterState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'poweredOn';

export type TransportKind = 'mock' | 'ble';

export interface RippleTransport {
  readonly kind: TransportKind;

  // Phone's Bluetooth
  /** Ask for runtime permissions needed to scan and connect. Resolves true when granted. */
  requestPermissions(): Promise<boolean>;
  /** Calls back immediately with the current state, then on every change. */
  onAdapterStateChange(cb: (s: AdapterState) => void): Unsubscribe;

  // Phone <-> Ripple Case
  scanForCases(onFound: (c: RippleCaseInfo) => void, onError?: (e: Error) => void): Unsubscribe;
  connectToCase(id: string): Promise<void>;
  disconnectFromCase(): Promise<void>;
  onCaseConnectionChange(cb: (connected: boolean) => void): Unsubscribe;

  // Ripple Case <-> hearing device (through the case)
  readStatus(): Promise<RippleStatus>;
  onStatus(cb: (s: RippleStatus) => void): Unsubscribe;
  onHearingDeviceFound(cb: (d: HearingDevice | undefined, scanDone: boolean) => void): Unsubscribe;
  startHearingDeviceScan(durationSec?: number): Promise<CommandResult>;
  stopHearingDeviceScan(): Promise<CommandResult>;
  connectHearingDevice(d: Pick<HearingDevice, 'address' | 'addressType'>): Promise<CommandResult>;
  disconnectHearingDevice(): Promise<CommandResult>;
}
