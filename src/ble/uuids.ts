/**
 * Ripple Control GATT service: UUIDs and protocol constants.
 * Mirrors docs/ripple-case-spec.md. If you change anything here, update the spec and tell the
 * firmware team.
 */

export const RIPPLE_SERVICE_UUID = '35d50001-4882-4464-bc0e-3bc4654aacb1';
export const STATUS_CHAR_UUID = '35d50002-4882-4464-bc0e-3bc4654aacb1';
export const DEVICES_CHAR_UUID = '35d50003-4882-4464-bc0e-3bc4654aacb1';
export const COMMAND_CHAR_UUID = '35d50004-4882-4464-bc0e-3bc4654aacb1';
export const RESULT_CHAR_UUID = '35d50005-4882-4464-bc0e-3bc4654aacb1';

/** Advertised local name prefix. */
export const RIPPLE_NAME_PREFIX = 'Ripple';

export const PROTOCOL_VERSION = 0x01;
/** Max name length on the wire, in UTF-8 bytes. */
export const MAX_NAME_BYTES = 20;
/** RSSI value meaning "unknown". */
export const RSSI_UNKNOWN = 127;
/** Android MTU to request after connecting. iOS negotiates automatically. */
export const ANDROID_MTU = 185;
/** How long to wait for a matching Result before giving up. */
export const COMMAND_TIMEOUT_MS = 5000;

export const Opcode = {
  START_SCAN: 0x01,
  STOP_SCAN: 0x02,
  CONNECT: 0x03,
  DISCONNECT: 0x04,
  GET_STATUS: 0x05,
} as const;
export type OpcodeValue = (typeof Opcode)[keyof typeof Opcode];

/** Result codes from the firmware (also used as Status error_code), plus app-side codes. */
export const ResultCode = {
  OK: 0,
  UNKNOWN_OPCODE: 1,
  BAD_ARGUMENTS: 2,
  BUSY: 3,
  NRF_TIMEOUT: 4,
  NRF_ERROR: 5,
  NOT_CONNECTED_TO_HEARING_DEVICE: 6,
  UNSUPPORTED_VERSION: 7,
  /** App-side only: the Command could not be written (case not connected or write failed). */
  APP_WRITE_FAILED: 254,
  /** App-side only: no matching Result within COMMAND_TIMEOUT_MS. */
  APP_TIMEOUT: 255,
} as const;

/** Wire values of link_state, in order. */
export const LINK_STATES = ['idle', 'scanning', 'connecting', 'connected', 'streaming', 'error'] as const;
