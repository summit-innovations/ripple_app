import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { getTransport } from '@/ble';

import { RippleController, type RippleState } from './rippleController';

const RippleContext = createContext<RippleController | null>(null);

export function RippleProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new RippleController(getTransport(), AsyncStorage));
  useEffect(() => controller.start(), [controller]);
  return <RippleContext.Provider value={controller}>{children}</RippleContext.Provider>;
}

/** Current Ripple state plus the controller for actions. */
export function useRipple(): { state: RippleState; ripple: RippleController } {
  const ripple = useContext(RippleContext);
  if (!ripple) throw new Error('useRipple must be used inside <RippleProvider>');
  const state = useSyncExternalStore(ripple.subscribe, ripple.getSnapshot, ripple.getSnapshot);
  return { state, ripple };
}
