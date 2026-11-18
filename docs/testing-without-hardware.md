# Testing before the Ripple Case hardware exists

## 1. Everyday UI work: the mock (no hardware, no build)

Run `npx expo start` and open the app in **Expo Go**. Expo Go has no Bluetooth module, so the
app uses `MockTransport`: two pretend Ripple Cases and four pretend hearing aids, with realistic
delays and an occasional "busy" or "didn't answer" error. The mock runs the real byte protocol
through a fake firmware (`src/ble/mock/fakeFirmware.ts`), so the encode/decode code gets
exercised too.

In development builds the Home screen has a **Demo mode** card with buttons to simulate the case
going out of range (to test auto-reconnect) and Bluetooth turning off.

To force the mock inside a development build: `npm run start:mock`.

## 2. Real Bluetooth against a fake case: nRF Connect

Before the ESP32 firmware is ready, a **second Android phone** running the free **nRF Connect for
Mobile** app (Nordic Semiconductor) can act as a Ripple Case. This checks scanning, connecting,
the MTU request, reads, and notifications on a real radio.

On the second phone, open nRF Connect, go to **Configure GATT server**, and add:

| Item | UUID | Properties |
|---|---|---|
| Service | `35d50001-4882-4464-bc0e-3bc4654aacb1` | |
| Status | `35d50002-4882-4464-bc0e-3bc4654aacb1` | Read, Notify |
| Devices | `35d50003-4882-4464-bc0e-3bc4654aacb1` | Notify |
| Command | `35d50004-4882-4464-bc0e-3bc4654aacb1` | Write |
| Result | `35d50005-4882-4464-bc0e-3bc4654aacb1` | Notify |

Then, in the **Advertiser** tab, advertise with the local name `Ripple-TEST` and include the
service UUID.

Useful values to set or send by hand (hex):

| What | Characteristic | Bytes |
|---|---|---|
| Idle, no hearing device | Status | `0100000000000000007f0000` |
| Streaming to "Phonak Audeo L" | Status | `01040a91224e1dc001cc000e50686f6e616b20417564656f204c` |
| One hearing device found | Devices | `01000a91224e1dc001cc0e50686f6e616b20417564656f204c` |
| Scan finished | Devices | `0101` |
| OK for a command with seq `NN`, opcode `OO` | Result | `01NNOO00` |

When the app writes a command, nRF Connect shows the bytes, for example `01 00 01 00` is
START_SCAN with seq 0. To answer it, send a Result notification with the same seq and opcode
within 5 seconds. Otherwise the app reports "didn't answer in time", which is also worth testing.

## 3. Building the Android development build

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --profile development --platform android
```

Install the APK from the link EAS gives you, run `npx expo start`, and open the project from the
development build. JavaScript changes reload instantly; only native config changes (`app.json`
plugins, new native libraries) need a new build.
