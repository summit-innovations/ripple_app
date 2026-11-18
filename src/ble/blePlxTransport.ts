/**
 * The real transport, using @sfourdrinier/react-native-ble-plx. Only loaded (via require in
 * src/ble/index.ts) when the native module exists, so Expo Go never touches it.
 */

import { BleManager, State, type Device, type Subscription } from '@sfourdrinier/react-native-ble-plx';
import { Platform } from 'react-native';

import { BaseTransport, Emitter } from './baseTransport';
import { requestBlePermissions } from './permissions';
import { base64ToBytes, bytesToBase64, decodeStatus } from './protocol';
import type { AdapterState, RippleCaseInfo, RippleStatus, Unsubscribe } from './transport';
import {
  ANDROID_MTU,
  COMMAND_CHAR_UUID,
  DEVICES_CHAR_UUID,
  RESULT_CHAR_UUID,
  RIPPLE_NAME_PREFIX,
  RIPPLE_SERVICE_UUID,
  STATUS_CHAR_UUID,
} from './uuids';

const CONNECT_TIMEOUT_MS = 10_000;

const ADAPTER_STATE: Record<string, AdapterState> = {
  [State.Unknown]: 'unknown',
  [State.Resetting]: 'resetting',
  [State.Unsupported]: 'unsupported',
  [State.Unauthorized]: 'unauthorized',
  [State.PoweredOff]: 'poweredOff',
  [State.PoweredOn]: 'poweredOn',
};

export class BlePlxTransport extends BaseTransport {
  readonly kind = 'ble' as const;

  private readonly manager = new BleManager();
  private device?: Device;
  /** Subscriptions tied to the current connection. */
  private linkSubs: Subscription[] = [];
  private adapterState: AdapterState = 'unknown';
  private readonly adapterEvents = new Emitter<[AdapterState]>();
  private scanning = false;

  constructor() {
    super();
    this.manager.onStateChange((s) => {
      this.adapterState = ADAPTER_STATE[s] ?? 'unknown';
      this.adapterEvents.emit(this.adapterState);
    }, true);
  }

  requestPermissions(): Promise<boolean> {
    return requestBlePermissions();
  }

  onAdapterStateChange(cb: (s: AdapterState) => void): Unsubscribe {
    cb(this.adapterState);
    return this.adapterEvents.on(cb);
  }

  // ---- Phone <-> Ripple Case -------------------------------------------------

  scanForCases(onFound: (c: RippleCaseInfo) => void, onError?: (e: Error) => void): Unsubscribe {
    let stopped = false;
    this.scanning = true;
    this.manager
      .startDeviceScan([RIPPLE_SERVICE_UUID], { allowDuplicates: true }, (error, d) => {
        if (stopped) return;
        if (error) {
          onError?.(error);
          return;
        }
        if (!d) return;
        const name = d.localName ?? d.name ?? '';
        // Filtered by service UUID already; the name prefix is a sanity check.
        if (name && !name.startsWith(RIPPLE_NAME_PREFIX)) return;
        onFound({ id: d.id, name: name || 'Ripple Case', rssi: d.rssi ?? 127 });
      })
      .catch((e: Error) => {
        if (!stopped) onError?.(e);
      });
    return () => {
      stopped = true;
      if (this.scanning) {
        this.scanning = false;
        this.manager.stopDeviceScan().catch(() => {});
      }
    };
  }

  async connectToCase(id: string): Promise<void> {
    if (this.device?.id === id) return;
    if (this.device) await this.disconnectFromCase();

    const device = await this.manager.connectToDevice(id, {
      timeout: CONNECT_TIMEOUT_MS,
      ...(Platform.OS === 'android' ? { requestMTU: ANDROID_MTU } : {}),
    });
    try {
      await device.discoverAllServicesAndCharacteristics();
      if (Platform.OS === 'android' && device.mtu < 35) {
        // Some stacks ignore requestMTU during connect; ask again.
        await this.manager.requestMTUForDevice(id, ANDROID_MTU).catch(() => undefined);
      }

      this.device = device;
      this.linkSubs.push(
        this.manager.onDeviceDisconnected(id, () => this.handleDisconnected()),
        // Result first: it must be subscribed before any Command is written.
        this.monitor(id, RESULT_CHAR_UUID),
        this.monitor(id, STATUS_CHAR_UUID),
        this.monitor(id, DEVICES_CHAR_UUID),
      );
      // GATT operations are queued in order, so this read also waits for the
      // notification subscriptions above to be written.
      await this.manager.readCharacteristicForDevice(id, RIPPLE_SERVICE_UUID, STATUS_CHAR_UUID);
    } catch (e) {
      this.clearLink();
      await this.manager.cancelDeviceConnection(id).catch(() => undefined);
      throw e;
    }
    this.setCaseConnected(true);
  }

  async disconnectFromCase(): Promise<void> {
    const d = this.device;
    if (!d) return;
    this.clearLink();
    this.setCaseConnected(false);
    await this.manager.cancelDeviceConnection(d.id).catch(() => undefined);
  }

  // ---- Ripple Case <-> hearing device ---------------------------------------

  async readStatus(): Promise<RippleStatus> {
    const d = this.requireDevice();
    const c = await this.manager.readCharacteristicForDevice(d.id, RIPPLE_SERVICE_UUID, STATUS_CHAR_UUID);
    if (!c.value) throw new Error('Empty Status value');
    return decodeStatus(base64ToBytes(c.value));
  }

  protected async writeCommand(bytes: Uint8Array): Promise<void> {
    const d = this.requireDevice();
    await this.manager.writeCharacteristicWithResponseForDevice(
      d.id,
      RIPPLE_SERVICE_UUID,
      COMMAND_CHAR_UUID,
      bytesToBase64(bytes),
    );
  }

  // ---------------------------------------------------------------------------

  private monitor(id: string, charUuid: string): Subscription {
    return this.manager.monitorCharacteristicForDevice(id, RIPPLE_SERVICE_UUID, charUuid, (error, c) => {
      if (error) {
        // Errors here usually mean the link dropped; onDeviceDisconnected handles that.
        console.warn(`[ripple] monitor ${charUuid} error`, error.message);
        return;
      }
      if (!c?.value) return;
      try {
        this.handleNotification(charUuid, base64ToBytes(c.value));
      } catch (e) {
        console.warn('[ripple] bad base64 notification', e);
      }
    });
  }

  private handleDisconnected() {
    if (!this.device) return; // we initiated it
    this.clearLink();
    this.setCaseConnected(false);
  }

  private clearLink() {
    this.linkSubs.splice(0).forEach((s) => s.remove());
    this.device = undefined;
  }

  private requireDevice(): Device {
    if (!this.device) throw new Error('Not connected to a Ripple Case');
    return this.device;
  }
}
