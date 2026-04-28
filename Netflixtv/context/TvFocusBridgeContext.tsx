import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';

interface TvFocusBridgeContextValue {
  heroFocusTag: number | null;
  navFocusTag: number | null;
  setHeroFocusTag: (tag: number | null) => void;
  setNavFocusTag: (tag: number | null) => void;
}

const TvFocusBridgeContext = createContext<TvFocusBridgeContextValue | undefined>(undefined);

export function TvFocusBridgeProvider({ children }: { children: ReactNode }) {
  const [heroFocusTag, setHeroFocusTag] = useState<number | null>(null);
  const [navFocusTag, setNavFocusTag] = useState<number | null>(null);

  const value = useMemo(
    () => ({ heroFocusTag, navFocusTag, setHeroFocusTag, setNavFocusTag }),
    [heroFocusTag, navFocusTag]
  );

  return (
    <TvFocusBridgeContext.Provider value={value}>
      {children}
    </TvFocusBridgeContext.Provider>
  );
}

export function useTvFocusBridge() {
  const context = useContext(TvFocusBridgeContext);
  if (!context) {
    throw new Error('useTvFocusBridge must be used within a TvFocusBridgeProvider');
  }
  return context;
}
