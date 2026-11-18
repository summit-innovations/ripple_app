/**
 * App state for the Ripple Case, kept outside React so it is easy to test and reason about.
 * Screens read it through useRipple() (see RippleProvider.tsx).
 */

import { MockTransport } from '@/ble/mockTransport';
import type {
  AdapterState,
  HearingDevice,
  RippleCaseInfo,
  RippleStatus,
  RippleTransport,
  TransportKind,
  Unsubscribe,
} from '@/ble/transport';

import {
  adapterMessage,
  CASE_LOST,
  CASE_NOT_FOUND,
  CASE_SCAN_FAILED,
  PERMISSION_DENIED,
  resultMessage,
} from './errors';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type CaseConnection = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface Notice {
  kind: 'error' | 'info';
  text: string;
}

export interface SavedCase {
  id: string;
  name: string;
}

export interface RippleState {
  transportKind: TransportKind;
  /** Last-case lookup finished. */
  ready: boolean;
  adapter: AdapterState;
  caseConnection: CaseConnection;
  /** The case we are connected to, or trying to reach. */
  currentCase?: SavedCase;
  /** When the next reconnect attempt happens (ms since epoch). */
  nextRetryAt?: number;
  /** Ripple Cases the phone can see (Find screen). */
  caseScan: { active: boolean; cases: RippleCaseInfo[] };
  /** Last Status from the case. */
  status?: RippleStatus;
  /** Hearing devices the case can see (Choose screen). */
  hearingScan: { active: boolean; devices: HearingDevice[] };
  /** A command is waiting for its Result. */
  commandPending: boolean;
  notice?: Notice;
}

const LAST_CASE_KEY = 'ripple.lastCase';
const MAX_BACKOFF_SEC = 30;
const CASE_SCAN_MS = 30_000;

export class RippleController {
  private state: RippleState;
  private readonly listeners = new Set<() => void>();
  private readonly subs: Unsubscribe[] = [];
  private stopCaseScanFn?: Unsubscribe;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  /** True while the user wants to be connected to currentCase (drives auto-reconnect). */
  private wantConnected = false;
  private started = false;

  constructor(
    readonly transport: RippleTransport,
    private readonly storage: KeyValueStore,
  ) {
    this.state = {
      transportKind: transport.kind,
      ready: false,
      adapter: 'unknown',
      caseConnection: 'disconnected',
      caseScan: { active: false, cases: [] },
      hearingScan: { active: false, devices: [] },
      commandPending: false,
    };
  }

  // ---- store plumbing --------------------------------------------------------

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<RippleState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- lifecycle -------------------------------------------------------------

  /** Subscribe to the transport and auto-connect to the remembered case. Returns a cleanup. */
  start(): () => void {
    if (this.started) return () => this.stop();
    this.started = true;
    const t = this.transport;
    this.subs.push(
      t.onAdapterStateChange((adapter) => {
        const msg = adapterMessage(adapter);
        this.set({ adapter, notice: msg ? { kind: 'error', text: msg } : this.clearAdapterNotice() });
        if (adapter === 'poweredOn' && this.wantConnected && this.state.caseConnection === 'reconnecting') {
          this.retryNow();
        }
      }),
      t.onCaseConnectionChange((connected) => this.handleCaseConnection(connected)),
      t.onStatus((status) => this.set({ status })),
      t.onHearingDeviceFound((device, scanDone) => this.handleHearingDevice(device, scanDone)),
    );
    void this.autoConnect();
    return () => this.stop();
  }

  private stop() {
    this.subs.splice(0).forEach((u) => u());
    this.stopCaseScan();
    clearTimeout(this.retryTimer);
    this.started = false;
  }

  private async autoConnect() {
    let saved: SavedCase | undefined;
    try {
      const raw = await this.storage.getItem(LAST_CASE_KEY);
      saved = raw ? (JSON.parse(raw) as SavedCase) : undefined;
    } catch {
      saved = undefined;
    }
    this.set({ ready: true });
    if (!saved?.id) return;
    this.wantConnected = true;
    this.set({ currentCase: saved });
    void this.tryConnect(saved, { retry: true });
  }

  // ---- Ripple Case -----------------------------------------------------------

  async startCaseScan() {
    this.stopCaseScan();
    if (!(await this.ensureBluetooth())) return;
    this.set({ caseScan: { active: true, cases: [] } });
    // Don't scan forever: it drains the battery. The screen offers "Search again".
    const timer = setTimeout(() => this.stopCaseScan(), CASE_SCAN_MS);
    const stopScan = this.transport.scanForCases(
      (found) => {
        const cases = [...this.state.caseScan.cases];
        const i = cases.findIndex((c) => c.id === found.id);
        if (i >= 0) cases[i] = found;
        else cases.push(found);
        this.set({ caseScan: { active: true, cases } });
      },
      (e) => {
        this.stopCaseScan();
        this.set({ notice: { kind: 'error', text: adapterMessage(this.state.adapter) ?? CASE_SCAN_FAILED } });
        console.warn('[ripple] case scan failed', e);
      },
    );
    this.stopCaseScanFn = () => {
      clearTimeout(timer);
      stopScan();
    };
  }

  stopCaseScan() {
    this.stopCaseScanFn?.();
    this.stopCaseScanFn = undefined;
    if (this.state.caseScan.active) this.set({ caseScan: { ...this.state.caseScan, active: false } });
  }

  /** Connect to a case the user picked. Resolves true on success. */
  async connectCase(c: SavedCase): Promise<boolean> {
    this.stopCaseScan();
    if (!(await this.ensureBluetooth())) return false;
    this.wantConnected = true;
    this.retryAttempt = 0;
    clearTimeout(this.retryTimer);
    this.set({ currentCase: { id: c.id, name: c.name }, status: undefined, notice: undefined });
    return this.tryConnect(c, { retry: false });
  }

  async disconnectCase() {
    this.wantConnected = false;
    clearTimeout(this.retryTimer);
    this.retryAttempt = 0;
    this.set({ caseConnection: 'disconnected', nextRetryAt: undefined });
    try {
      await this.transport.disconnectFromCase();
    } catch {
      // Already gone.
    }
  }

  /** Forget the remembered case (and disconnect). */
  async forgetCase() {
    await this.disconnectCase();
    this.set({ currentCase: undefined, status: undefined });
    await this.storage.removeItem(LAST_CASE_KEY).catch(() => {});
  }

  retryNow() {
    const c = this.state.currentCase;
    if (!c || this.state.caseConnection === 'connected' || this.state.caseConnection === 'connecting') return;
    clearTimeout(this.retryTimer);
    this.wantConnected = true;
    void this.tryConnect(c, { retry: true });
  }

  private async tryConnect(c: SavedCase, { retry }: { retry: boolean }): Promise<boolean> {
    this.set({
      caseConnection: this.retryAttempt > 0 ? 'reconnecting' : 'connecting',
      nextRetryAt: undefined,
    });
    try {
      await this.transport.connectToCase(c.id);
    } catch {
      if (!this.wantConnected || this.state.currentCase?.id !== c.id) return false;
      if (retry) {
        this.scheduleRetry(c);
      } else {
        this.wantConnected = false;
        this.set({ caseConnection: 'disconnected', notice: { kind: 'error', text: CASE_NOT_FOUND } });
      }
      return false;
    }
    // connected: handleCaseConnection(true) already ran
    await this.storage.setItem(LAST_CASE_KEY, JSON.stringify(c)).catch(() => {});
    try {
      this.set({ status: await this.transport.readStatus() });
    } catch {
      // A Status notification will arrive anyway.
    }
    return true;
  }

  private scheduleRetry(c: SavedCase) {
    const delaySec = Math.min(MAX_BACKOFF_SEC, 2 ** this.retryAttempt);
    this.retryAttempt++;
    const nextRetryAt = Date.now() + delaySec * 1000;
    this.set({ caseConnection: 'reconnecting', nextRetryAt });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.wantConnected && this.state.adapter !== 'poweredOff') void this.tryConnect(c, { retry: true });
      else if (this.wantConnected) this.scheduleRetry(c);
    }, delaySec * 1000);
  }

  private handleCaseConnection(connected: boolean) {
    if (connected) {
      this.retryAttempt = 0;
      clearTimeout(this.retryTimer);
      const wasLost = this.state.notice?.text === CASE_LOST;
      this.set({
        caseConnection: 'connected',
        nextRetryAt: undefined,
        notice: wasLost ? undefined : this.state.notice,
      });
      return;
    }
    // Link dropped: anything in progress through the case is over.
    this.set({ hearingScan: { ...this.state.hearingScan, active: false }, commandPending: false });
    if (!this.wantConnected || !this.state.currentCase) {
      this.set({ caseConnection: 'disconnected' });
      return;
    }
    if (this.state.caseConnection === 'connected') {
      this.set({ notice: { kind: 'error', text: CASE_LOST } });
      this.retryAttempt = 0;
      this.scheduleRetry(this.state.currentCase);
    }
  }

  // ---- hearing devices -------------------------------------------------------

  async startHearingScan() {
    this.set({ hearingScan: { active: true, devices: [] }, notice: undefined });
    const r = await this.command(() => this.transport.startHearingDeviceScan());
    if (!r) this.set({ hearingScan: { ...this.state.hearingScan, active: false } });
  }

  async stopHearingScan() {
    if (!this.state.hearingScan.active) return;
    this.set({ hearingScan: { ...this.state.hearingScan, active: false } });
    if (this.state.caseConnection === 'connected') {
      // Best effort; no message if this fails.
      await this.transport.stopHearingDeviceScan().catch(() => undefined);
    }
  }

  async connectHearing(d: HearingDevice) {
    this.set({ notice: undefined });
    return this.command(() => this.transport.connectHearingDevice(d));
  }

  async disconnectHearing() {
    this.set({ notice: undefined });
    return this.command(() => this.transport.disconnectHearingDevice());
  }

  private handleHearingDevice(device: HearingDevice | undefined, scanDone: boolean) {
    const devices = [...this.state.hearingScan.devices];
    if (device) {
      const i = devices.findIndex((d) => d.address === device.address);
      if (i >= 0) devices[i] = device;
      else devices.push(device);
    }
    this.set({ hearingScan: { active: scanDone ? false : this.state.hearingScan.active, devices } });
  }

  // ---- misc ------------------------------------------------------------------

  dismissNotice() {
    this.set({ notice: undefined });
  }

  /** Demo controls, only on the mock transport. */
  get demo() {
    return this.transport instanceof MockTransport ? this.transport : undefined;
  }

  /** Run a command; on failure, show a friendly notice. Resolves true when accepted. */
  private async command(run: () => Promise<{ ok: boolean; code: number }>): Promise<boolean> {
    this.set({ commandPending: true });
    try {
      const r = await run();
      if (!r.ok) this.set({ notice: { kind: 'error', text: resultMessage(r.code) } });
      return r.ok;
    } catch {
      this.set({ notice: { kind: 'error', text: resultMessage(254) } });
      return false;
    } finally {
      this.set({ commandPending: false });
    }
  }

  private async ensureBluetooth(): Promise<boolean> {
    const granted = await this.transport.requestPermissions().catch(() => false);
    if (!granted) {
      this.set({ notice: { kind: 'error', text: PERMISSION_DENIED } });
      return false;
    }
    const msg = adapterMessage(this.state.adapter);
    if (msg) {
      this.set({ notice: { kind: 'error', text: msg } });
      return false;
    }
    return true;
  }

  private clearAdapterNotice(): Notice | undefined {
    const n = this.state.notice;
    const adapterTexts = (['poweredOff', 'unauthorized', 'unsupported'] as const).map(adapterMessage);
    return n && adapterTexts.includes(n.text) ? undefined : n;
  }
}
