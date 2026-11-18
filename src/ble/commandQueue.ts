/**
 * Sends Commands one at a time and matches each to its Result by seq + opcode.
 * Pure: the caller supplies the write function and feeds Results in via handleResult().
 *
 * Rules (docs/ripple-case-spec.md):
 * - seq counts 0–255 and wraps.
 * - Only one command in flight; the rest wait in order.
 * - No matching Result within the timeout -> { ok: false, code: 255 }.
 */

import { encodeCommand, type DecodedResult } from './protocol';
import type { CommandResult } from './transport';
import { COMMAND_TIMEOUT_MS, ResultCode } from './uuids';

export type WriteFn = (bytes: Uint8Array) => Promise<void>;

interface InFlight {
  seq: number;
  opcode: number;
  resolve: (r: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CommandQueue {
  private nextSeq = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private inFlight?: InFlight;
  /** Bumped by reset() so queued commands from an old connection fail fast. */
  private generation = 0;

  constructor(
    private readonly write: WriteFn,
    private readonly timeoutMs = COMMAND_TIMEOUT_MS,
  ) {}

  send(opcode: number, args: ArrayLike<number> = []): Promise<CommandResult> {
    const gen = this.generation;
    const run = () => (gen === this.generation ? this.sendNow(opcode, args) : failed());
    const p = this.tail.then(run, run);
    this.tail = p;
    return p;
  }

  /** Feed every decoded Result notification here. Unmatched Results are ignored. */
  handleResult(r: DecodedResult): void {
    const f = this.inFlight;
    if (!f || f.seq !== r.seq || f.opcode !== r.opcode) return;
    this.finish({ ok: r.code === ResultCode.OK, code: r.code });
  }

  /** Call when the link to the case drops: fails the in-flight command and anything queued. */
  reset(): void {
    this.generation++;
    if (this.inFlight) this.finish(failed());
  }

  private sendNow(opcode: number, args: ArrayLike<number>): Promise<CommandResult> {
    const seq = this.nextSeq;
    this.nextSeq = (this.nextSeq + 1) & 0xff;
    const bytes = encodeCommand(seq, opcode, args);
    return new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(
        () => this.finish({ ok: false, code: ResultCode.APP_TIMEOUT }),
        this.timeoutMs,
      );
      this.inFlight = { seq, opcode, resolve, timer };
      this.write(bytes).catch(() => {
        if (this.inFlight?.seq === seq) this.finish(failed());
      });
    });
  }

  private finish(r: CommandResult) {
    const f = this.inFlight;
    if (!f) return;
    clearTimeout(f.timer);
    this.inFlight = undefined;
    f.resolve(r);
  }
}

const failed = (): CommandResult => ({ ok: false, code: ResultCode.APP_WRITE_FAILED });
