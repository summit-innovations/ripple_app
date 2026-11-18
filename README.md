# Ripple Case app

Companion app for the Ripple Case. It tells the case which hearing device to stream to.
The full spec, including the BLE GATT contract shared with the firmware team, is in
[docs/ripple-case-spec.md](docs/ripple-case-spec.md).

## Run it

```bash
npm install
npx expo start
```

Open it in **Expo Go** on your phone. Expo Go has no Bluetooth module, so the app automatically
uses the **mock transport** (a fake Ripple Case and fake hearing aids).

To force the mock in a development build too, set `EXPO_PUBLIC_USE_MOCK_BLE=1`
(PowerShell: `$env:EXPO_PUBLIC_USE_MOCK_BLE="1"; npx expo start`).

## Checks

```bash
npm test
npx tsc --noEmit
npx expo lint
```

## Real Bluetooth (Android development build)

```bash
npx eas-cli@latest build --profile development --platform android
```

Install the APK on a physical Android phone, then run `npx expo start` and open the project in
the development build. See [docs/testing-without-hardware.md](docs/testing-without-hardware.md)
for testing against a fake Ripple Case before the hardware exists.
