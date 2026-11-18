import { FAKE_HEARING_DEVICES } from '../mock/fakeFirmware';
import { FAKE_CASES, MockTransport } from '../mockTransport';
import type { HearingDevice, LinkState } from '../transport';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const run = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
};

async function connected(errorRate = 0) {
  const t = new MockTransport({ errorRate });
  const p = t.connectToCase(FAKE_CASES[0].id);
  await run(1300);
  await p;
  return t;
}

it('finds fake cases while scanning', async () => {
  const t = new MockTransport();
  const found = new Set<string>();
  const stop = t.scanForCases((c) => found.add(c.name));
  await run(2000);
  stop();
  expect([...found]).toEqual(FAKE_CASES.map((c) => c.name));
});

it('connects to a case and reads idle status', async () => {
  const t = await connected();
  const p = t.readStatus();
  await run(200);
  await expect(p).resolves.toEqual({ linkState: 'idle', errorCode: 0 });
});

it('scans for hearing devices through the case, then connects and streams', async () => {
  const t = await connected();
  const found: HearingDevice[] = [];
  let done = false;
  const states: LinkState[] = [];
  t.onHearingDeviceFound((d, scanDone) => {
    if (d) found.push(d);
    if (scanDone) done = true;
  });
  t.onStatus((s) => states.push(s.linkState));

  const scan = t.startHearingDeviceScan();
  await run(200);
  await expect(scan).resolves.toEqual({ ok: true, code: 0 });
  await run(6500);
  expect(found.map((d) => d.name)).toEqual(FAKE_HEARING_DEVICES.map((d) => d.name));
  expect(done).toBe(true);

  const conn = t.connectHearingDevice(found[0]);
  await run(200);
  await expect(conn).resolves.toEqual({ ok: true, code: 0 });
  await run(3000);
  expect(states).toEqual(['scanning', 'idle', 'connecting', 'connected', 'streaming']);

  const status = t.readStatus();
  await run(200);
  expect((await status).device?.address).toBe(found[0].address);
});

it('rejects DISCONNECT when no hearing device is connected', async () => {
  const t = await connected();
  const p = t.disconnectHearingDevice();
  await run(200);
  await expect(p).resolves.toEqual({ ok: false, code: 6 });
});

it('reports connection failures through Status', async () => {
  // First roll passes the "busy" check, second roll fails the link to the hearing device.
  const rolls = [0.9, 0.0];
  const t = new MockTransport({ errorRate: 0.5, random: () => rolls.shift() ?? 0.9 });
  const c = t.connectToCase(FAKE_CASES[0].id);
  await run(1300);
  await c;
  const statuses: { linkState: LinkState; errorCode: number }[] = [];
  t.onStatus((s) => statuses.push(s));
  const p = t.connectHearingDevice(FAKE_HEARING_DEVICES[1]);
  await run(2500);
  await expect(p).resolves.toEqual({ ok: true, code: 0 });
  expect(statuses.at(-1)).toMatchObject({ linkState: 'error', errorCode: 4 });
});

it('drops the link when out of range and refuses to reconnect until back', async () => {
  const t = await connected();
  const events: boolean[] = [];
  t.onCaseConnectionChange((c) => events.push(c));
  t.simulateOutOfRange(5000);
  expect(events).toEqual([false]);

  const cmd = t.startHearingDeviceScan();
  await expect(cmd).resolves.toEqual({ ok: false, code: 254 });

  const early = t.connectToCase(FAKE_CASES[0].id);
  const earlyResult = expect(early).rejects.toThrow('not found');
  await run(1300);
  await earlyResult;

  await run(4000);
  const later = t.connectToCase(FAKE_CASES[0].id);
  await run(1300);
  await later;
  expect(events).toEqual([false, true]);
});
