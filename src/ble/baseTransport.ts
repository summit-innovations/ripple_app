/**
 * Shared plumbing for both transports: listener sets, the command queue, and routing of
 * notification bytes (Status / Devices / Result) through protocol.ts. Subclasses only deal with
 * how bytes reach the phone (a real BLE link, or the fake firmware).
 */

import { CommandQueue } from './commandQueue';
import { connectArgs, decodeDevice, decodeResult, decodeStatus, startScanArgs } from './protocol';
import type {
  AdapterState,
  CommandResult,
  HearingDevice,
  RippleCaseInfo,
  RippleStatus,
  RippleTransport,
  TransportKind,
  Unsubscribe,
} from './transport';
import { DEVICES_CHAR_UUID, Opcode, RESULT_CHAR_UUID, STATUS_CHAR_UUID } from './uuids';

export class Emitter<A extends unknown[]> {
  private readonly listeners = new Set<(...args: A) => void>();
  on(cb: (...args: A) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  emit(...args: A) {
    for (const cb of [...this.listeners]) {
      try {
        cb(...args);
      } catch (e) {
        console.warn('[ripple] listener threw', e);
      }
    }
  }
}

export abstract class BaseTransport implements RippleTransport {
  abstract readonly kind: TransportKind;

  protected readonly statusEvents = new Emitter<[RippleStatus]>();
  protected readonly deviceEvents = new Emitter<[HearingDevice | undefined, boolean]>();
  protected readonly caseConnectionEvents = new Emitter<[boolean]>();
  protected readonly queue: CommandQueue;

  constructor(commandTimeoutMs?: number) {
    this.queue = new CommandQueue((bytes) => this.writeCommand(bytes), commandTimeoutMs);
  }

  /** Write one encoded Command to the case. Reject if it can't be written. */
  protected abstract writeCommand(bytes: Uint8Array): Promise<void>;

  abstract requestPermissions(): Promise<boolean>;
  abstract onAdapterStateChange(cb: (s: AdapterState) => void): Unsubscribe;
  abstract scanForCases(onFound: (c: RippleCaseInfo) => void, onError?: (e: Error) => void): Unsubscribe;
  abstract connectToCase(id: string): Promise<void>;
  abstract disconnectFromCase(): Promise<void>;
  abstract readStatus(): Promise<RippleStatus>;

  /** Route a notification from one of the Ripple characteristics. Bad payloads are logged and dropped. */
  protected handleNotification(charUuid: string, bytes: Uint8Array) {
    try {
      switch (charUuid.toLowerCase()) {
        case STATUS_CHAR_UUID:
          this.statusEvents.emit(decodeStatus(bytes));
          break;
        case DEVICES_CHAR_UUID: {
          const n = decodeDevice(bytes);
          this.deviceEvents.emit(n.device, n.scanDone);
          break;
        }
        case RESULT_CHAR_UUID:
          this.queue.handleResult(decodeResult(bytes));
          break;
      }
    } catch (e) {
      console.warn(`[ripple] dropped bad notification on ${charUuid}`, e);
    }
  }

  /** Subclasses call this whenever the link to the case comes up or goes down. */
  protected setCaseConnected(connected: boolean) {
    if (!connected) this.queue.reset();
    this.caseConnectionEvents.emit(connected);
  }

  onCaseConnectionChange(cb: (connected: boolean) => void): Unsubscribe {
    return this.caseConnectionEvents.on(cb);
  }
  onStatus(cb: (s: RippleStatus) => void): Unsubscribe {
    return this.statusEvents.on(cb);
  }
  onHearingDeviceFound(cb: (d: HearingDevice | undefined, scanDone: boolean) => void): Unsubscribe {
    return this.deviceEvents.on(cb);
  }

  startHearingDeviceScan(durationSec = 0): Promise<CommandResult> {
    return this.queue.send(Opcode.START_SCAN, startScanArgs(durationSec));
  }
  stopHearingDeviceScan(): Promise<CommandResult> {
    return this.queue.send(Opcode.STOP_SCAN);
  }
  connectHearingDevice(d: Pick<HearingDevice, 'address' | 'addressType'>): Promise<CommandResult> {
    return this.queue.send(Opcode.CONNECT, connectArgs(d));
  }
  disconnectHearingDevice(): Promise<CommandResult> {
    return this.queue.send(Opcode.DISCONNECT);
  }
  requestStatusNotify(): Promise<CommandResult> {
    return this.queue.send(Opcode.GET_STATUS);
  }
}
