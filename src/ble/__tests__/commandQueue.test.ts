import { CommandQueue } from '../commandQueue';
import { decodeCommand } from '../protocol';
import { Opcode } from '../uuids';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup() {
  const written: Uint8Array[] = [];
  const q = new CommandQueue(async (b) => {
    written.push(b);
  });
  const lastCmd = () => decodeCommand(written[written.length - 1]);
  const reply = (code = 0) => {
    const c = lastCmd();
    q.handleResult({ seq: c.seq, opcode: c.opcode, code });
  };
  return { q, written, lastCmd, reply };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

it('resolves with the matching Result', async () => {
  const { q, reply } = setup();
  const p = q.send(Opcode.STOP_SCAN);
  await flush();
  reply(0);
  await expect(p).resolves.toEqual({ ok: true, code: 0 });
});

it('reports non-zero result codes as not ok', async () => {
  const { q, reply } = setup();
  const p = q.send(Opcode.DISCONNECT);
  await flush();
  reply(6);
  await expect(p).resolves.toEqual({ ok: false, code: 6 });
});

it('sends one command at a time, in order', async () => {
  const { q, written, reply } = setup();
  const a = q.send(Opcode.START_SCAN, [0]);
  const b = q.send(Opcode.STOP_SCAN);
  await flush();
  expect(written).toHaveLength(1);
  reply();
  await a;
  await flush();
  expect(written).toHaveLength(2);
  expect(decodeCommand(written[1]).opcode).toBe(Opcode.STOP_SCAN);
  reply();
  await expect(b).resolves.toEqual({ ok: true, code: 0 });
});

it('ignores Results with the wrong seq or opcode', async () => {
  const { q, lastCmd } = setup();
  const p = q.send(Opcode.STOP_SCAN);
  await flush();
  const c = lastCmd();
  q.handleResult({ seq: c.seq + 1, opcode: c.opcode, code: 0 });
  q.handleResult({ seq: c.seq, opcode: Opcode.CONNECT, code: 0 });
  jest.advanceTimersByTime(5000);
  await expect(p).resolves.toEqual({ ok: false, code: 255 });
});

it('times out after 5 s with code 255, then carries on', async () => {
  const { q, written, reply } = setup();
  const a = q.send(Opcode.GET_STATUS);
  const b = q.send(Opcode.GET_STATUS);
  await flush();
  jest.advanceTimersByTime(4999);
  await flush();
  expect(written).toHaveLength(1);
  jest.advanceTimersByTime(1);
  await expect(a).resolves.toEqual({ ok: false, code: 255 });
  await flush();
  expect(written).toHaveLength(2);
  reply();
  await expect(b).resolves.toEqual({ ok: true, code: 0 });
});

it('wraps seq from 255 to 0', async () => {
  const { q, lastCmd, reply } = setup();
  const seqs: number[] = [];
  for (let i = 0; i < 258; i++) {
    const p = q.send(Opcode.GET_STATUS);
    await flush();
    seqs.push(lastCmd().seq);
    reply();
    await p;
  }
  expect(seqs.slice(0, 3)).toEqual([0, 1, 2]);
  expect(seqs.slice(254)).toEqual([254, 255, 0, 1]);
});

it('fails fast when the write fails', async () => {
  const q = new CommandQueue(async () => {
    throw new Error('gone');
  });
  await expect(q.send(Opcode.STOP_SCAN)).resolves.toEqual({ ok: false, code: 254 });
});

it('reset() fails the in-flight command and everything queued', async () => {
  const { q, written } = setup();
  const a = q.send(Opcode.START_SCAN, [0]);
  const b = q.send(Opcode.STOP_SCAN);
  await flush();
  q.reset();
  await expect(a).resolves.toEqual({ ok: false, code: 254 });
  await expect(b).resolves.toEqual({ ok: false, code: 254 });
  expect(written).toHaveLength(1);
});
