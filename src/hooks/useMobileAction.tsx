import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MobileAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

const MobileActionContext = createContext<{
  action: MobileAction | null;
  setAction: (a: MobileAction | null) => void;
} | null>(null);

export function MobileActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<MobileAction | null>(null);
  return (
    <MobileActionContext.Provider value={{ action, setAction }}>
      {children}
    </MobileActionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider + hooks intentionally colocated (same pattern as useTeamProfile.tsx)
export function useMobileActionValue(): MobileAction | null {
  const ctx = useContext(MobileActionContext);
  return ctx?.action ?? null;
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider + hooks intentionally colocated (same pattern as useTeamProfile.tsx)
export function useMobileAction(action: MobileAction | null): void {
  const ctx = useContext(MobileActionContext);
  const setAction = ctx?.setAction;
  const onPressRef = useRef<(() => void) | undefined>(action?.onPress);
  // eslint-disable-next-line react-hooks/refs -- intentional anti-loop pattern: latest onPress kept in a ref so the effect below doesn't need it as a dep
  onPressRef.current = action?.onPress;

  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;

  useEffect(() => {
    if (!setAction) return;
    if (label === null) {
      setAction(null);
      return;
    }
    setAction({ label, disabled, onPress: () => onPressRef.current?.() });
    return () => setAction(null);
  }, [setAction, label, disabled]);
}
