/**
 * Runtime Bluetooth permissions.
 * Android 12+ (API 31+): BLUETOOTH_SCAN (declared neverForLocation) + BLUETOOTH_CONNECT.
 * Android 11 and below: ACCESS_FINE_LOCATION.
 * iOS: the system shows its own prompt the first time Bluetooth is used.
 */

import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const needed: Permission[] =
    apiLevel >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED);
}
