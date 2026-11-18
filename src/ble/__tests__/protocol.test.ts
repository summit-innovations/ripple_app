import {
  addressToBytes,
  base64ToBytes,
  bytesToAddress,
  bytesToBase64,
  connectArgs,
  decodeCommand,
  decodeDevice,
  decodeResult,
  decodeStatus,
  encodeCommand,
  encodeDevice,
  encodeName,
  encodeResult,
  encodeStatus,
  parseConnectArgs,
  ProtocolError,
  startScanArgs,
  utf8Decode,
  utf8Encode,
} from '../protocol';
import type { RippleStatus } from '../transport';
import { Opcode, PROTOCOL_VERSION } from '../uuids';

const hex = (s: string) => Uint8Array.from(s.trim().split(/\s+/).map((h) => parseInt(h, 16)));

function expectProtocolError(fn: () => unknown, kind: ProtocolError['kind']) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ProtocolError);
    expect((e as ProtocolError).kind).toBe(kind);
    return;
  }
  throw new Error(`expected ProtocolError(${kind})`);
}

describe('base64', () => {
  it.each([
    [[], ''],
    [[0], 'AA=='],
    [[0, 1], 'AAE='],
    [[0, 1, 2], 'AAEC'],
    [[255, 254, 253, 252], '//79/A=='],
    [[1, 4, 10, 145, 34, 78], 'AQQKkSJO'],
  ])('round-trips %j <-> %s', (arr, b64) => {
    const bytes = Uint8Array.from(arr);
    expect(bytesToBase64(bytes)).toBe(b64);
    expect(base64ToBytes(b64)).toEqual(bytes);
  });

  it('round-trips a 32-byte payload', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i * 8);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('rejects bad characters', () => {
    expectProtocolError(() => base64ToBytes('ab$d'), 'bad-input');
  });
});

describe('utf8 and names', () => {
  it('round-trips multibyte text', () => {
    const s = 'Jöhn’s Phonak 🎧';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(utf8Encode('é’🎧')).toEqual(hex('c3 a9 e2 80 99 f0 9f 8e a7'));
  });

  it('decodes invalid bytes leniently', () => {
    expect(utf8Decode(hex('41 ff 42'))).toBe('A�B');
    expect(utf8Decode(hex('41 e2 82'))).toBe('A�');
  });

  it('truncates names to 20 bytes without splitting a character', () => {
    expect(encodeName('A'.repeat(25))).toHaveLength(20);
    const name = 'A'.repeat(18) + 'é'; // 18 + 2 = 20 bytes
    expect(utf8Decode(encodeName(name))).toBe(name);
    const longer = 'A'.repeat(19) + 'é'; // 21 bytes -> drop the é entirely
    expect(utf8Decode(encodeName(longer))).toBe('A'.repeat(19));
  });
});

describe('addresses', () => {
  it('puts the LSB first on the wire', () => {
    expect(addressToBytes('AA:BB:CC:DD:EE:FF')).toEqual(hex('ff ee dd cc bb aa'));
    expect(bytesToAddress(hex('ff ee dd cc bb aa'))).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('normalises to upper case and rejects junk', () => {
    expect(bytesToAddress(addressToBytes('0a:1b:2c:3d:4e:5f'))).toBe('0A:1B:2C:3D:4E:5F');
    expectProtocolError(() => addressToBytes('AA:BB:CC'), 'bad-input');
    expectProtocolError(() => addressToBytes('GG:BB:CC:DD:EE:FF'), 'bad-input');
  });
});

describe('Status', () => {
  const streaming: RippleStatus = {
    linkState: 'streaming',
    errorCode: 0,
    device: { address: 'C0:1D:4E:22:91:0A', addressType: 1, name: 'Phonak Audeo L', rssi: -52 },
  };

  it('decodes a hand-built payload', () => {
    const bytes = hex('01 04 0a 91 22 4e 1d c0 01 cc 00 03 41 42 43');
    expect(decodeStatus(bytes)).toEqual({
      linkState: 'streaming',
      errorCode: 0,
      device: { address: 'C0:1D:4E:22:91:0A', addressType: 1, rssi: -52, name: 'ABC' },
    });
  });

  it('round-trips every link state', () => {
    for (const linkState of ['idle', 'scanning', 'connecting', 'connected', 'streaming', 'error'] as const) {
      const s = { ...streaming, linkState, errorCode: linkState === 'error' ? 4 : 0 };
      expect(decodeStatus(encodeStatus(s))).toEqual(s);
    }
  });

  it('treats an all-zero address as no device', () => {
    const bytes = encodeStatus({ linkState: 'idle', errorCode: 0 });
    expect(bytes).toHaveLength(12);
    expect(bytes[9]).toBe(127);
    expect(decodeStatus(bytes)).toEqual({ linkState: 'idle', errorCode: 0 });
  });

  it('keeps rssi 127 (unknown) and negative values', () => {
    for (const rssi of [127, -128, -1, 0]) {
      const s = { ...streaming, device: { ...streaming.device!, rssi } };
      expect(decodeStatus(encodeStatus(s)).device!.rssi).toBe(rssi);
    }
  });

  it('handles names of 0 and 20 bytes and multibyte names', () => {
    for (const name of ['', 'X'.repeat(20), 'Ünïcødé 耳'])
      expect(decodeStatus(encodeStatus({ ...streaming, device: { ...streaming.device!, name } })).device!.name).toBe(
        name,
      );
  });

  it('rejects an unknown version', () => {
    const bytes = encodeStatus(streaming);
    bytes[0] = 2;
    expectProtocolError(() => decodeStatus(bytes), 'bad-version');
  });

  it('rejects every truncation', () => {
    const bytes = encodeStatus(streaming);
    for (let len = 0; len < bytes.length; len++) {
      expectProtocolError(() => decodeStatus(bytes.slice(0, len)), 'truncated');
    }
  });

  it('rejects bad fields', () => {
    const badState = encodeStatus(streaming);
    badState[1] = 6;
    expectProtocolError(() => decodeStatus(badState), 'bad-field');
    const longName = new Uint8Array(40);
    longName.set(encodeStatus(streaming));
    longName[11] = 21;
    expectProtocolError(() => decodeStatus(longName), 'bad-field');
    const badType = encodeStatus(streaming);
    badType[8] = 2;
    expectProtocolError(() => decodeStatus(badType), 'bad-field');
  });
});

describe('Devices', () => {
  const device = { address: 'D4:F5:13:6B:07:C2', addressType: 0, name: 'Oticon Intent 1', rssi: -63 };

  it('round-trips a device', () => {
    expect(decodeDevice(encodeDevice({ scanDone: false, device }))).toEqual({ scanDone: false, device });
  });

  it('decodes the scan-finished marker in short and full form', () => {
    expect(decodeDevice(hex('01 01'))).toEqual({ scanDone: true });
    expect(decodeDevice(encodeDevice({ scanDone: true }))).toEqual({ scanDone: true });
    expect(decodeDevice(encodeDevice({ scanDone: true, device }))).toEqual({ scanDone: true, device });
  });

  it('rejects a device with an empty address when the scan is not done', () => {
    expectProtocolError(() => decodeDevice(encodeDevice({ scanDone: false })), 'bad-field');
  });

  it('rejects bad version and truncation', () => {
    const bytes = encodeDevice({ scanDone: false, device });
    expectProtocolError(() => decodeDevice(Uint8Array.of(9, ...bytes.slice(1))), 'bad-version');
    for (let len = 0; len < bytes.length; len++) {
      expectProtocolError(() => decodeDevice(bytes.slice(0, len)), 'truncated');
    }
  });
});

describe('Command', () => {
  it('encodes START_SCAN', () => {
    expect(encodeCommand(7, Opcode.START_SCAN, startScanArgs(10))).toEqual(hex('01 07 01 0a'));
    expect(encodeCommand(0, Opcode.START_SCAN, startScanArgs())).toEqual(hex('01 00 01 00'));
  });

  it('encodes CONNECT with the address LSB first', () => {
    const args = connectArgs({ address: 'AA:BB:CC:DD:EE:FF', addressType: 1 });
    expect(encodeCommand(255, Opcode.CONNECT, args)).toEqual(hex('01 ff 03 ff ee dd cc bb aa 01'));
    expect(parseConnectArgs(args)).toEqual({ address: 'AA:BB:CC:DD:EE:FF', addressType: 1 });
  });

  it('encodes no-argument commands', () => {
    expect(encodeCommand(1, Opcode.STOP_SCAN)).toEqual(hex('01 01 02'));
    expect(encodeCommand(2, Opcode.DISCONNECT)).toEqual(hex('01 02 04'));
    expect(encodeCommand(3, Opcode.GET_STATUS)).toEqual(hex('01 03 05'));
  });

  it('round-trips through decodeCommand', () => {
    const bytes = encodeCommand(42, Opcode.CONNECT, [1, 2, 3, 4, 5, 6, 0]);
    expect(decodeCommand(bytes)).toEqual({ seq: 42, opcode: Opcode.CONNECT, args: Uint8Array.of(1, 2, 3, 4, 5, 6, 0) });
  });

  it('rejects out-of-range seq, durations and address types', () => {
    expectProtocolError(() => encodeCommand(256, 1), 'bad-input');
    expectProtocolError(() => encodeCommand(-1, 1), 'bad-input');
    expectProtocolError(() => startScanArgs(300), 'bad-input');
    expectProtocolError(() => connectArgs({ address: 'AA:BB:CC:DD:EE:FF', addressType: 2 }), 'bad-input');
  });
});

describe('Result', () => {
  it('round-trips', () => {
    const r = { seq: 200, opcode: Opcode.CONNECT, code: 3 };
    expect(encodeResult(r)).toEqual(hex('01 c8 03 03'));
    expect(decodeResult(encodeResult(r))).toEqual(r);
  });

  it('rejects bad version and truncation', () => {
    expectProtocolError(() => decodeResult(hex('02 00 01 00')), 'bad-version');
    for (const len of [0, 1, 2, 3]) {
      expectProtocolError(() => decodeResult(Uint8Array.of(PROTOCOL_VERSION, 0, 1, 0).slice(0, len)), 'truncated');
    }
  });
});
