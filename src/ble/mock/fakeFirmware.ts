/**
 * A pretend ESP32-S3 that speaks the real byte protocol: it takes encoded Command bytes and
 * emits encoded Status / Devices / Result notifications. MockTransport talks to it exactly the
 * way BlePlxTransport talks to the real case, so the protocol and queue code get exercised too.
 */

import {
  decodeCommand,
  encodeDevice,
  encodeResult,
  encodeStatus,
  parseConnectArgs,
  ProtocolError,
} from '../protocol';
import type { HearingDevice, RippleStatus } from '../transport';
import {
  DEVICES_CHAR_UUID,
  Opcode,
  PROTOCOL_VERSION,
  RESULT_CHAR_UUID,
  ResultCode,
  STATUS_CHAR_UUID,
} from '../uuids';

export const FAKE_HEARING_DEVICES: readonly HearingDevice[] = [
  { address: 'C0:1D:4E:22:91:0A', addressType: 1, name: 'Phonak Audeo L', rssi: -52 },
  { address: 'D4:F5:13:6B:07:C2', addressType: 0, name: 'Oticon Intent 1', rssi: -63 },
  { address: 'E8:3A:9C:41:5D:B7', addressType: 1, name: 'ReSound Nexia', rssi: -71 },
  { address: 'F2:08:B6:7E:33:19', addressType: 1, name: 'Signia Pure C&G', rssi: -80 },
];

export interface FakeFirmwareOptions {
  /** Chance (0–1) that a command is rejected as busy or a connection fails. Default 0.05. */
  errorRate?: number;
  /** Injected for tests. */
  random?: () => number;
  /** Multiplies every delay. Tests use a small value. Default 1. */
  speed?: number;
}

type Notify = (charUuid: string, bytes: Uint8Array) => void;

const DEFAULT_SCAN_SEC = 6;
const UART_DELAY_MS = 120;

export class FakeFirmware {
  private status: RippleStatus = { linkState: 'idle', errorCode: 0 };
  private scanTimers: ReturnType<typeof setTimeout>[] = [];
  private linkTimers: ReturnType<typeof setTimeout>[] = [];
  private scanning = false;
  private notify: Notify = () => {};
  private readonly errorRate: number;
  private readonly random: () => number;
  private readonly speed: number;

  constructor(opts: FakeFirmwareOptions = {}) {
    this.errorRate = opts.errorRate ?? 0.05;
    this.random = opts.random ?? Math.random;
    this.speed = opts.speed ?? 1;
  }

  /** Attach (or detach with undefined) the phone. Notifications with no phone attached are dropped. */
  attach(notify: Notify | undefined) {
    this.notify = notify ?? (() => {});
  }

  readStatus(): Uint8Array {
    return encodeStatus(this.status);
  }

  write(bytes: Uint8Array): void {
    let seq = bytes[1] ?? 0;
    let opcode = bytes[2] ?? 0;
    let cmd;
    try {
      cmd = decodeCommand(bytes);
      seq = cmd.seq;
      opcode = cmd.opcode;
    } catch (e) {
      const code =
        e instanceof ProtocolError && e.kind === 'bad-version'
          ? ResultCode.UNSUPPORTED_VERSION
          : ResultCode.BAD_ARGUMENTS;
      return this.reply(seq, opcode, code);
    }

    switch (cmd.opcode) {
      case Opcode.START_SCAN: {
        if (this.status.linkState === 'connecting' || this.flaky())
          return this.reply(seq, opcode, ResultCode.BUSY);
        this.reply(seq, opcode, ResultCode.OK);
        return this.startScan(cmd.args[0] || DEFAULT_SCAN_SEC);
      }
      case Opcode.STOP_SCAN:
        this.reply(seq, opcode, ResultCode.OK);
        return this.endScan();
      case Opcode.CONNECT: {
        let target;
        try {
          target = parseConnectArgs(cmd.args);
        } catch {
          return this.reply(seq, opcode, ResultCode.BAD_ARGUMENTS);
        }
        if (this.flaky()) return this.reply(seq, opcode, ResultCode.BUSY);
        this.reply(seq, opcode, ResultCode.OK);
        return this.connect(target);
      }
      case Opcode.DISCONNECT: {
        if (!this.status.device || this.status.linkState === 'idle' || this.status.linkState === 'scanning')
          return this.reply(seq, opcode, ResultCode.NOT_CONNECTED_TO_HEARING_DEVICE);
        this.reply(seq, opcode, ResultCode.OK);
        this.clearLinkTimers();
        return this.later(this.linkTimers, 600, () => this.setStatus({ linkState: 'idle', errorCode: 0 }));
      }
      case Opcode.GET_STATUS:
        this.reply(seq, opcode, ResultCode.OK);
        return this.later(this.linkTimers, UART_DELAY_MS, () => this.notify(STATUS_CHAR_UUID, this.readStatus()));
      default:
        return this.reply(seq, opcode, ResultCode.UNKNOWN_OPCODE);
    }
  }

  dispose() {
    this.clearScanTimers();
    this.clearLinkTimers();
  }

  // -------------------------------------------------------------------------

  private startScan(durationSec: number) {
    this.clearScanTimers();
    this.scanning = true;
    if (this.status.linkState === 'idle' || this.status.linkState === 'error')
      this.setStatus({ linkState: 'scanning', errorCode: 0 });
    const durationMs = durationSec * 1000;
    FAKE_HEARING_DEVICES.forEach((d, i) => {
      const at = 500 + i * 900;
      if (at >= durationMs) return;
      this.later(this.scanTimers, at, () => {
        const rssi = Math.max(-100, Math.min(-30, d.rssi + Math.round((this.random() - 0.5) * 8)));
        this.notify(DEVICES_CHAR_UUID, encodeDevice({ scanDone: false, device: { ...d, rssi } }));
      });
    });
    this.later(this.scanTimers, durationMs, () => this.endScan());
  }

  private endScan() {
    if (!this.scanning) return;
    this.clearScanTimers();
    this.scanning = false;
    // Short "scan finished" marker: version + flags only.
    this.later(this.linkTimers, UART_DELAY_MS, () => {
      this.notify(DEVICES_CHAR_UUID, Uint8Array.of(PROTOCOL_VERSION, 0x01));
      if (this.status.linkState === 'scanning') this.setStatus({ linkState: 'idle', errorCode: 0 });
    });
  }

  private connect(target: Pick<HearingDevice, 'address' | 'addressType'>) {
    this.clearLinkTimers();
    const known = FAKE_HEARING_DEVICES.find((d) => d.address === target.address);
    const device: HearingDevice = { name: 'Hearing device', rssi: -60, ...known, ...target };
    if (this.scanning) {
      this.clearScanTimers();
      this.scanning = false;
      this.notify(DEVICES_CHAR_UUID, Uint8Array.of(PROTOCOL_VERSION, 0x01));
    }
    this.later(this.linkTimers, UART_DELAY_MS, () => this.setStatus({ linkState: 'connecting', device, errorCode: 0 }));
    this.later(this.linkTimers, 1800, () => {
      if (this.flaky()) {
        this.setStatus({ linkState: 'error', device, errorCode: ResultCode.NRF_TIMEOUT });
        return;
      }
      this.setStatus({ linkState: 'connected', device, errorCode: 0 });
      this.later(this.linkTimers, 1000, () => this.setStatus({ linkState: 'streaming', device, errorCode: 0 }));
    });
  }

  private setStatus(s: RippleStatus) {
    this.status = s;
    this.notify(STATUS_CHAR_UUID, encodeStatus(s));
  }

  private reply(seq: number, opcode: number, code: number) {
    setTimeout(() => this.notify(RESULT_CHAR_UUID, encodeResult({ seq, opcode, code })), UART_DELAY_MS * this.speed);
  }

  private flaky() {
    return this.random() < this.errorRate;
  }

  private later(bucket: ReturnType<typeof setTimeout>[], ms: number, fn: () => void) {
    const t = setTimeout(() => {
      bucket.splice(bucket.indexOf(t), 1);
      fn();
    }, ms * this.speed);
    bucket.push(t);
  }

  private clearScanTimers() {
    this.scanTimers.forEach(clearTimeout);
    this.scanTimers = [];
  }
  private clearLinkTimers() {
    this.linkTimers.forEach(clearTimeout);
    this.linkTimers = [];
  }
}
