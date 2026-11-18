import { FAKE_CASES, MockTransport } from '@/ble/mockTransport';

import { CASE_LOST, CASE_NOT_FOUND } from '../errors';
import { RippleController, type KeyValueStore } from '../rippleController';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const run = (ms: number) => jest.advanceTimersByTimeAsync(ms);

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
    removeItem: async (k) => {
      delete data[k];
    },
  };
}

const CASE = { id: FAKE_CASES[0].id, name: FAKE_CASES[0].name };

it('connects to a picked case and remembers it', async () => {
  const store = memoryStore();
  const c = new RippleController(new MockTransport({ errorRate: 0 }), store);
  c.start();
  await run(10);
  const p = c.connectCase(CASE);
  await run(1500);
  await expect(p).resolves.toBe(true);
  expect(c.getSnapshot().caseConnection).toBe('connected');
  expect(c.getSnapshot().status?.linkState).toBe('idle');
  expect(JSON.parse(store.data['ripple.lastCase'])).toEqual(CASE);
});

it('auto-connects to the remembered case on start', async () => {
  const c = new RippleController(
    new MockTransport({ errorRate: 0 }),
    memoryStore({ 'ripple.lastCase': JSON.stringify(CASE) }),
  );
  c.start();
  await run(10);
  expect(c.getSnapshot().caseConnection).toBe('connecting');
  await run(1500);
  expect(c.getSnapshot().caseConnection).toBe('connected');
});

it('shows an error (no retry loop) when a picked case cannot be reached', async () => {
  const c = new RippleController(new MockTransport({ errorRate: 0 }), memoryStore());
  c.start();
  await run(10);
  const p = c.connectCase({ id: 'nope', name: 'Ripple-0000' });
  await run(1500);
  await expect(p).resolves.toBe(false);
  expect(c.getSnapshot().caseConnection).toBe('disconnected');
  expect(c.getSnapshot().notice?.text).toBe(CASE_NOT_FOUND);
});

it('reconnects with backoff after the case goes out of range', async () => {
  const t = new MockTransport({ errorRate: 0 });
  const c = new RippleController(t, memoryStore());
  c.start();
  await run(10);
  const p = c.connectCase(CASE);
  await run(1500);
  await p;

  t.simulateOutOfRange(5000);
  expect(c.getSnapshot().caseConnection).toBe('reconnecting');
  expect(c.getSnapshot().notice?.text).toBe(CASE_LOST);

  // attempt 1 after 1 s fails (still out of range, 1.2 s connect), next wait 2 s, then 4 s...
  await run(1000 + 1200);
  expect(c.getSnapshot().caseConnection).toBe('reconnecting');
  await run(2000 + 1200); // attempt 2 at ~5.4 s: back in range
  expect(c.getSnapshot().caseConnection).toBe('connected');
  expect(c.getSnapshot().notice).toBeUndefined();
});

it('does not reconnect after the user disconnects', async () => {
  const t = new MockTransport({ errorRate: 0 });
  const c = new RippleController(t, memoryStore());
  c.start();
  await run(10);
  const p = c.connectCase(CASE);
  await run(1500);
  await p;
  await c.disconnectCase();
  await run(60_000);
  expect(c.getSnapshot().caseConnection).toBe('disconnected');
});

it('collects hearing devices and turns failed commands into friendly notices', async () => {
  const c = new RippleController(new MockTransport({ errorRate: 0 }), memoryStore());
  c.start();
  await run(10);
  const p = c.connectCase(CASE);
  await run(1500);
  await p;

  void c.startHearingScan();
  await run(7000);
  expect(c.getSnapshot().hearingScan.active).toBe(false);
  expect(c.getSnapshot().hearingScan.devices).toHaveLength(4);

  const d = c.disconnectHearing();
  await run(200);
  await expect(d).resolves.toBe(false);
  expect(c.getSnapshot().notice?.text).toMatch(/No hearing device/);
});
