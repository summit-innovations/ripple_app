# Ripple Case App — spec

Companion mobile app for the **Ripple Case** (Rev 7.0 MVP). This is a 6 × 6.5 in device that uses
7 microphones to beamform audio from one direction and streams it, amplified, to the user's
hearing aids over Bluetooth LE Audio.

The app's MVP job is to **control which hearing device the Ripple Case streams to**. It does
not handle audio.

> **This file is the contract with the firmware team.** If you change anything in the BLE GATT
> spec below, update this file and tell the firmware team. The app-side source of truth for the
> bytes is `src/ble/uuids.ts` and `src/ble/protocol.ts`.

## Architecture

```
 Phone (this app)  ──BLE GATT──▶  ESP32-S3 (master controller)  ──UART──▶  nRF5340  ──LE Audio──▶  Hearing aid
```

- **This app only talks to the ESP32-S3**, over a custom BLE GATT service defined below.
  It never talks to the nRF5340 or the hearing aid directly.
- The ESP32-S3 keeps a cached copy of the nRF5340's state. It turns app commands into UART
  messages and turns nRF updates into BLE notifications.
- There are two kinds of "device" in the app. Keep them separate in code and in the UI:
  1. **Ripple Case**: the box the phone connects to (BLE peripheral, the ESP32-S3).
  2. **Hearing device**: the hearing aid the Ripple Case streams to. The app finds and selects
     these *through* the Ripple Case (the Ripple Case does the scanning, not the phone).

## Tech stack and environment

- Expo SDK 58 (React Native) + TypeScript, Expo Router for screens (routes in `src/app/`).
- BLE library: `@sfourdrinier/react-native-ble-plx`, a maintained fork of
  `dotintent/react-native-ble-plx` with the same API. Upstream is stuck at 3.5.1 and its config
  plugin breaks on Expo SDK 56+ (upstream issue #1339).
- The developer works on **Windows / PowerShell, with no Mac**.
  - UI work: Expo Go on a phone, using the **mock transport** (see below).
  - Real BLE: an Android development build through EAS (`npx eas-cli@latest build --profile development --platform android`).
  - iOS builds wait until the Apple Developer organization account is approved.
- BLE does **not** work in Expo Go, the iOS simulator, or the Android emulator. Only physical
  phones with a development build can use real BLE.

## Rule 1: all BLE goes through one transport interface

No screen or component imports the BLE library directly. Everything goes through
`RippleTransport` (`src/ble/transport.ts`), which has two implementations:

- `MockTransport`: fake Ripple Case and fake hearing devices, with realistic delays, state
  changes and occasional errors. Used in Expo Go and for the App Store reviewer demo mode.
- `BlePlxTransport`: the real implementation.

The mock is chosen when `EXPO_PUBLIC_USE_MOCK_BLE=1` is set **or** when the native BLE module is
missing (as in Expo Go). The app must never crash in Expo Go.

## Rule 2: byte encoding and decoding lives in one pure module

`src/ble/protocol.ts` holds every encoder and decoder for the payloads below. It has no React
and no BLE-library imports, so it can be unit-tested with Jest. The BLE library sends and
receives values as **base64 strings**: decode to bytes (`Uint8Array`) first, then parse.

## BLE GATT spec (ESP32-S3 peripheral)

All multi-byte integers are little-endian. Byte 0 of every payload is the protocol version
(currently `0x01`). Decoders must reject unknown versions.

**Advertising:** local name starts with `Ripple`, and the advertisement includes the service
UUID. When scanning for Ripple Cases, filter by service UUID.

| Item | UUID | Properties |
|---|---|---|
| Ripple Control service | `35d50001-4882-4464-bc0e-3bc4654aacb1` | |
| `Status` | `35d50002-4882-4464-bc0e-3bc4654aacb1` | Read, Notify |
| `Devices` | `35d50003-4882-4464-bc0e-3bc4654aacb1` | Notify |
| `Command` | `35d50004-4882-4464-bc0e-3bc4654aacb1` | Write (with response) |
| `Result` | `35d50005-4882-4464-bc0e-3bc4654aacb1` | Notify |

**MTU:** payloads are up to 32 bytes. On Android, the app requests MTU 185 after connecting. iOS
negotiates the MTU automatically. Names are UTF-8 and truncated to 20 bytes.

### `Status` (Read + Notify)
The firmware notifies on every change. The app also reads it once right after connecting.

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version (`0x01`) |
| 1 | 1 | link_state: 0 idle, 1 scanning, 2 connecting, 3 connected, 4 streaming, 5 error |
| 2 | 6 | hearing device address (LSB first; all zeros = none) |
| 8 | 1 | address_type (0 public, 1 random) |
| 9 | 1 | rssi (int8, dBm; 127 = unknown) |
| 10 | 1 | error_code (see codes below; 0 = none) |
| 11 | 1 | name_len (0–20) |
| 12 | n | name (UTF-8) |

### `Devices` (Notify)
One notification per hearing device found during a scan.

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version |
| 1 | 1 | flags: bit0 = scan finished (when set, the device fields may be empty) |
| 2 | 6 | address (LSB first) |
| 8 | 1 | address_type |
| 9 | 1 | rssi (int8) |
| 10 | 1 | name_len |
| 11 | n | name |

### `Command` (Write)

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version |
| 1 | 1 | seq (app increments it 0–255 and wraps; matches the `Result`) |
| 2 | 1 | opcode |
| 3 | n | arguments |

| Opcode | Name | Arguments |
|---|---|---|
| `0x01` | START_SCAN | duration_sec (u8; 0 = firmware default) |
| `0x02` | STOP_SCAN | none |
| `0x03` | CONNECT | address (6, LSB first) + address_type (1) |
| `0x04` | DISCONNECT | none |
| `0x05` | GET_STATUS | none (forces a fresh `Status` notify) |

### `Result` (Notify)
One notification for every `Command`.

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version |
| 1 | 1 | seq (copied from the command) |
| 2 | 1 | opcode (copied from the command) |
| 3 | 1 | result code |

**Result and error codes:** 0 OK, 1 unknown opcode, 2 bad arguments, 3 busy, 4 nRF timeout,
5 nRF error, 6 not connected to a hearing device, 7 unsupported protocol version.
App-side only: 255 = no `Result` within 5 s (timeout).

**App rules for commands:**
- Subscribe to `Result` before writing any `Command`.
- If no matching `Result` arrives within 5 s, resolve as a timeout (app-side code 255).
- Send one command at a time; queue the rest.
- `Result` OK only means the command was accepted. The real outcome (for example, the
  connection succeeding) arrives later through `Status`. The UI follows `Status`.

## For reference only: UART between ESP32-S3 and nRF5340 (firmware, not app)

Frame: `0x7E | type(1) | seq(1) | len(2, LE) | payload(len) | crc16(2)`, with COBS or SLIP
framing. The ESP32 copies the BLE payload bytes into the UART payload wherever it can, to
minimize translation.

## App behavior (MVP)

1. **Find your Ripple Case**: scan, list nearby cases, tap to connect, and remember the last
   case so the app can auto-connect next time.
2. **Home**: shows the Ripple Case connection plus the hearing device link state and name.
   Includes Disconnect.
3. **Choose hearing device**: send START_SCAN, list results from `Devices` live, tap to send
   CONNECT, and show progress from `Status`.
4. **Errors**: friendly messages for each error code, Bluetooth off, permission denied, and a
   Ripple Case going out of range (auto-reconnect with backoff).

Design for older users with hearing loss: large text and tap targets, high contrast, and never
rely on sound for feedback.

## Permissions / config

- iOS: `NSBluetoothAlwaysUsageDescription`, set through the config plugin.
- Android 12+: `BLUETOOTH_SCAN` (with `neverForLocation`) and `BLUETOOTH_CONNECT`. Android 11
  and below: `ACCESS_FINE_LOCATION`. Requested at runtime before scanning.
- After changing native config, rebuild the development build. JavaScript-only changes don't
  need a rebuild.

## Open questions (don't guess; ask the developer)

- LE Audio mode, unicast (CIS) or broadcast (Auracast/BIS)? This could add settings such as a
  broadcast name or code. The MVP assumes unicast connect/disconnect.
- Whether the Ripple Case needs pairing/bonding with the phone (encrypted link) for the MVP.
  The MVP assumes no bonding.

## Code layout

```
src/ble/uuids.ts            UUID and protocol constants
src/ble/protocol.ts         encode/decode (pure, unit-tested)
src/ble/commandQueue.ts     one-at-a-time command queue with seq + 5 s timeout (pure, unit-tested)
src/ble/transport.ts        RippleTransport interface + types
src/ble/mockTransport.ts    fake implementation
src/ble/blePlxTransport.ts  real implementation
src/ble/permissions.ts      Android runtime permissions
src/ble/index.ts            picks mock or real
src/state/                  React context exposing status to screens
src/app/                    Expo Router screens
```

## Working agreements

- Work in small steps; the app should run after each one. Commit after each working step.
- Jest tests for `protocol.ts` (round-trip encode/decode, bad versions, truncated payloads).
- Use PowerShell-compatible commands. Use `npx expo install` for Expo-compatible package versions.
