/**
 * Every encoder and decoder for the Ripple Control GATT payloads (docs/ripple-case-spec.md).
 * Pure: no React, no BLE library. BLE values arrive as base64; decode to bytes, then parse.
 */

import type { HearingDevice, LinkState, RippleStatus } from './transport';
import { LINK_STATES, MAX_NAME_BYTES, Opcode, PROTOCOL_VERSION, RSSI_UNKNOWN } from './uuids';

export type ProtocolErrorKind = 'bad-version' | 'truncated' | 'bad-field' | 'bad-input';

export class ProtocolError extends Error {
  constructor(
    readonly kind: ProtocolErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

// ---------------------------------------------------------------------------
// base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, '');
  if (clean.length % 4 === 1) throw new ProtocolError('bad-input', 'Invalid base64 length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? B64_LOOKUP[code] : -1;
    if (v < 0) throw new ProtocolError('bad-input', `Invalid base64 character "${clean[i]}"`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// UTF-8

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
}

/** Lenient decoder: invalid or cut-off sequences become U+FFFD instead of throwing. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let need = 0;
    let cp = 0;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    } else if ((b & 0xe0) === 0xc0) {
      need = 1;
      cp = b & 0x1f;
    } else if ((b & 0xf0) === 0xe0) {
      need = 2;
      cp = b & 0x0f;
    } else if ((b & 0xf8) === 0xf0) {
      need = 3;
      cp = b & 0x07;
    } else {
      out += '�';
      i++;
      continue;
    }
    let j = 1;
    for (; j <= need; j++) {
      const c = bytes[i + j];
      if (c === undefined || (c & 0xc0) !== 0x80) break;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (j <= need) {
      out += '�';
      i += j;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

/** UTF-8 encode and cut to at most maxBytes without splitting a character. */
export function encodeName(name: string, maxBytes = MAX_NAME_BYTES): Uint8Array {
  const bytes = utf8Encode(name);
  if (bytes.length <= maxBytes) return bytes;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.slice(0, end);
}

// ---------------------------------------------------------------------------
// Addresses: "AA:BB:CC:DD:EE:FF" <-> 6 bytes, LSB first (FF first on the wire)

const ADDRESS_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;

export function addressToBytes(address: string): Uint8Array {
  if (!ADDRESS_RE.test(address)) throw new ProtocolError('bad-input', `Bad address "${address}"`);
  const parts = address.split(':').map((h) => parseInt(h, 16));
  return Uint8Array.from(parts.reverse());
}

export function bytesToAddress(bytes: Uint8Array): string {
  if (bytes.length !== 6) throw new ProtocolError('bad-input', 'Address must be 6 bytes');
  return Array.from(bytes)
    .reverse()
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(':');
}

const isZero = (bytes: Uint8Array) => bytes.every((b) => b === 0);

// ---------------------------------------------------------------------------
// Shared helpers

function checkHeader(bytes: Uint8Array, minLength: number, what: string) {
  if (bytes.length < 1) throw new ProtocolError('truncated', `${what}: empty payload`);
  if (bytes[0] !== PROTOCOL_VERSION)
    throw new ProtocolError('bad-version', `${what}: unsupported version ${bytes[0]}`);
  if (bytes.length < minLength)
    throw new ProtocolError('truncated', `${what}: ${bytes.length} bytes, need ${minLength}`);
}

const toInt8 = (b: number) => (b > 127 ? b - 256 : b);
const fromInt8 = (n: number) => {
  if (!Number.isInteger(n) || n < -128 || n > 127) throw new ProtocolError('bad-input', `Bad rssi ${n}`);
  return n & 0xff;
};

function readName(bytes: Uint8Array, lenOffset: number, what: string): string {
  const len = bytes[lenOffset];
  if (len > MAX_NAME_BYTES) throw new ProtocolError('bad-field', `${what}: name_len ${len} > ${MAX_NAME_BYTES}`);
  const start = lenOffset + 1;
  if (bytes.length < start + len)
    throw new ProtocolError('truncated', `${what}: name needs ${len} bytes, have ${bytes.length - start}`);
  return utf8Decode(bytes.subarray(start, start + len));
}

function readAddressType(b: number, what: string): number {
  if (b > 1) throw new ProtocolError('bad-field', `${what}: address_type ${b}`);
  return b;
}

// ---------------------------------------------------------------------------
// Status (Read + Notify)

const STATUS_HEADER = 12;

export function decodeStatus(bytes: Uint8Array): RippleStatus {
  checkHeader(bytes, STATUS_HEADER, 'Status');
  const ls = bytes[1];
  const linkState: LinkState | undefined = LINK_STATES[ls];
  if (!linkState) throw new ProtocolError('bad-field', `Status: link_state ${ls}`);
  const addr = bytes.subarray(2, 8);
  const name = readName(bytes, 11, 'Status');
  const status: RippleStatus = { linkState, errorCode: bytes[10] };
  if (!isZero(addr)) {
    status.device = {
      address: bytesToAddress(addr),
      addressType: readAddressType(bytes[8], 'Status'),
      rssi: toInt8(bytes[9]),
      name,
    };
  }
  return status;
}

export function encodeStatus(s: RippleStatus): Uint8Array {
  const ls = LINK_STATES.indexOf(s.linkState);
  if (ls < 0) throw new ProtocolError('bad-input', `Bad link state ${s.linkState}`);
  const name = s.device ? encodeName(s.device.name) : new Uint8Array(0);
  const out = new Uint8Array(STATUS_HEADER + name.length);
  out[0] = PROTOCOL_VERSION;
  out[1] = ls;
  if (s.device) {
    out.set(addressToBytes(s.device.address), 2);
    out[8] = s.device.addressType;
    out[9] = fromInt8(s.device.rssi);
  } else {
    out[9] = RSSI_UNKNOWN;
  }
  out[10] = s.errorCode & 0xff;
  out[11] = name.length;
  out.set(name, STATUS_HEADER);
  return out;
}

// ---------------------------------------------------------------------------
// Devices (Notify)

const DEVICES_HEADER = 11;
const FLAG_SCAN_DONE = 0x01;

export interface DevicesNotification {
  /** Absent when the scan-finished marker carries no device. */
  device?: HearingDevice;
  scanDone: boolean;
}

export function decodeDevice(bytes: Uint8Array): DevicesNotification {
  checkHeader(bytes, 2, 'Devices');
  const scanDone = (bytes[1] & FLAG_SCAN_DONE) !== 0;
  // A scan-finished marker may be just version + flags.
  if (scanDone && bytes.length === 2) return { scanDone };
  if (bytes.length < DEVICES_HEADER)
    throw new ProtocolError('truncated', `Devices: ${bytes.length} bytes, need ${DEVICES_HEADER}`);
  const addr = bytes.subarray(2, 8);
  const name = readName(bytes, 10, 'Devices');
  if (isZero(addr)) {
    if (scanDone) return { scanDone };
    throw new ProtocolError('bad-field', 'Devices: empty address');
  }
  return {
    scanDone,
    device: {
      address: bytesToAddress(addr),
      addressType: readAddressType(bytes[8], 'Devices'),
      rssi: toInt8(bytes[9]),
      name,
    },
  };
}

export function encodeDevice(n: DevicesNotification): Uint8Array {
  const name = n.device ? encodeName(n.device.name) : new Uint8Array(0);
  const out = new Uint8Array(DEVICES_HEADER + name.length);
  out[0] = PROTOCOL_VERSION;
  out[1] = n.scanDone ? FLAG_SCAN_DONE : 0;
  if (n.device) {
    out.set(addressToBytes(n.device.address), 2);
    out[8] = n.device.addressType;
    out[9] = fromInt8(n.device.rssi);
  } else {
    out[9] = RSSI_UNKNOWN;
  }
  out[10] = name.length;
  out.set(name, DEVICES_HEADER);
  return out;
}

// ---------------------------------------------------------------------------
// Command (Write)

export interface Command {
  seq: number;
  opcode: number;
  args: Uint8Array;
}

export function encodeCommand(seq: number, opcode: number, args: ArrayLike<number> = []): Uint8Array {
  if (!Number.isInteger(seq) || seq < 0 || seq > 255) throw new ProtocolError('bad-input', `Bad seq ${seq}`);
  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255)
    throw new ProtocolError('bad-input', `Bad opcode ${opcode}`);
  const out = new Uint8Array(3 + args.length);
  out[0] = PROTOCOL_VERSION;
  out[1] = seq;
  out[2] = opcode;
  out.set(args, 3);
  return out;
}

export function decodeCommand(bytes: Uint8Array): Command {
  checkHeader(bytes, 3, 'Command');
  return { seq: bytes[1], opcode: bytes[2], args: bytes.slice(3) };
}

/** Argument bytes for START_SCAN. 0 = firmware default. */
export function startScanArgs(durationSec = 0): Uint8Array {
  if (!Number.isInteger(durationSec) || durationSec < 0 || durationSec > 255)
    throw new ProtocolError('bad-input', `Bad scan duration ${durationSec}`);
  return Uint8Array.of(durationSec);
}

/** Argument bytes for CONNECT: address (6, LSB first) + address_type. */
export function connectArgs(d: Pick<HearingDevice, 'address' | 'addressType'>): Uint8Array {
  if (d.addressType !== 0 && d.addressType !== 1)
    throw new ProtocolError('bad-input', `Bad address type ${d.addressType}`);
  const out = new Uint8Array(7);
  out.set(addressToBytes(d.address), 0);
  out[6] = d.addressType;
  return out;
}

/** Inverse of connectArgs, used by the mock. */
export function parseConnectArgs(args: Uint8Array): Pick<HearingDevice, 'address' | 'addressType'> {
  if (args.length < 7) throw new ProtocolError('truncated', 'CONNECT args need 7 bytes');
  return { address: bytesToAddress(args.subarray(0, 6)), addressType: readAddressType(args[6], 'CONNECT') };
}

export const OPCODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(Opcode).map(([k, v]) => [v, k]),
);

// ---------------------------------------------------------------------------
// Result (Notify)

export interface DecodedResult {
  seq: number;
  opcode: number;
  code: number;
}

export function decodeResult(bytes: Uint8Array): DecodedResult {
  checkHeader(bytes, 4, 'Result');
  return { seq: bytes[1], opcode: bytes[2], code: bytes[3] };
}

export function encodeResult(r: DecodedResult): Uint8Array {
  return Uint8Array.of(PROTOCOL_VERSION, r.seq & 0xff, r.opcode & 0xff, r.code & 0xff);
}
