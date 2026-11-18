/**
 * Fake Ripple Cases and hearing devices for Expo Go, the web preview, and App Store review demo
 * mode. Hearing-device traffic goes through the real byte protocol via FakeFirmware.
 */

import { BaseTransport, Emitter } from './baseTransport';
import { decodeStatus } from './protocol';
import { FakeFirmware, type FakeFirmwareOptions } from './mock/fakeFirmware';
import type { AdapterState, RippleCaseInfo, RippleStatus, Unsubscribe } from './transport';

export const FAKE_CASES: readonly RippleCaseInfo[] = [
  { id: 'mock-case-7f3a', name: 'Ripple-7F3A', rssi: -48 },
  { id: 'mock-case-21c0', name: 'Ripple-21C0', rssi: -77 },
];

export type MockTransportOptions = FakeFirmwareOptions;

export class MockTransport extends BaseTransport {
  readonly kind = 'mock' as const;

  private readonly firmwares = new Map<string, FakeFirmware>();
  private connectedId?: string;
  private outOfRangeUntil = 0;
  private adapterState: AdapterState = 'poweredOn';
  private readonly adapterEvents = new Emitter<[AdapterState]>();
  private readonly speed: number;

  constructor(private readonly opts: MockTransportOptions = {}) {
    super();
    this.speed = opts.speed ?? 1;
  }

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  onAdapterStateChange(cb: (s: AdapterState) => void): Unsubscribe {
    cb(this.adapterState);
    return this.adapterEvents.on(cb);
  }

  scanForCases(onFound: (c: RippleCaseInfo) => void, onError?: (e: Error) => void): Unsubscribe {
    if (this.adapterState !== 'poweredOn') {
      onError?.(new Error('Bluetooth is off'));
      return () => {};
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const visible = () => Date.now() >= this.outOfRangeUntil;
    FAKE_CASES.forEach((c, i) => {
      timers.push(setTimeout(() => visible() && onFound(c), (700 + i * 900) * this.speed));
    });
    // Signal strength drifts while scanning.
    const drift = setInterval(() => {
      if (!visible()) return;
      for (const c of FAKE_CASES) onFound({ ...c, rssi: c.rssi + Math.round((Math.random() - 0.5) * 6) });
    }, 1500 * this.speed);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(drift);
    };
  }

  async connectToCase(id: string): Promise<void> {
    if (this.connectedId === id) return;
    if (this.connectedId) await this.disconnectFromCase();
    await delay(1200 * this.speed);
    if (this.adapterState !== 'poweredOn') throw new Error('Bluetooth is off');
    if (Date.now() < this.outOfRangeUntil) throw new Error('Ripple Case not found');
    if (!FAKE_CASES.some((c) => c.id === id)) throw new Error('Ripple Case not found');
    const fw = this.firmwareFor(id);
    fw.attach((uuid, bytes) => this.handleNotification(uuid, bytes));
    this.connectedId = id;
    this.setCaseConnected(true);
  }

  async disconnectFromCase(): Promise<void> {
    this.dropLink();
  }

  async readStatus(): Promise<RippleStatus> {
    const fw = this.connectedId && this.firmwares.get(this.connectedId);
    if (!fw) throw new Error('Not connected to a Ripple Case');
    await delay(150 * this.speed);
    return decodeStatus(fw.readStatus());
  }

  protected async writeCommand(bytes: Uint8Array): Promise<void> {
    const fw = this.connectedId && this.firmwares.get(this.connectedId);
    if (!fw) throw new Error('Not connected to a Ripple Case');
    fw.write(bytes);
  }

  // ---- demo / debug controls -------------------------------------------------

  /** Pretend the case walked out of range: the link drops and reconnects fail for `ms`. */
  simulateOutOfRange(ms = 6000) {
    this.outOfRangeUntil = Date.now() + ms * this.speed;
    this.dropLink();
  }

  setAdapterState(s: AdapterState) {
    this.adapterState = s;
    this.adapterEvents.emit(s);
    if (s !== 'poweredOn') this.dropLink();
  }

  // ---------------------------------------------------------------------------

  private dropLink() {
    if (!this.connectedId) return;
    this.firmwares.get(this.connectedId)?.attach(undefined);
    this.connectedId = undefined;
    this.setCaseConnected(false);
  }

  /** One firmware per case, kept across reconnects, like a real case that keeps streaming. */
  private firmwareFor(id: string) {
    let fw = this.firmwares.get(id);
    if (!fw) {
      fw = new FakeFirmware(this.opts);
      this.firmwares.set(id, fw);
    }
    return fw;
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
