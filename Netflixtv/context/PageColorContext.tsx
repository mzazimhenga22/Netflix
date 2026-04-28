import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PageColorContextType {
  pageColor: string;
  setPageColor: (color: string) => void;
}

const PageColorContext = createContext<PageColorContextType | undefined>(undefined);

export function PageColorProvider({ children }: { children: ReactNode }) {
  const [pageColor, setPageColor] = useState('#000000');

  return (
    <PageColorContext.Provider value={{ pageColor, setPageColor }}>
      {children}
    </PageColorContext.Provider>
  );
}

export function usePageColor() {
  const context = useContext(PageColorContext);
  if (context === undefined) {
    throw new Error('usePageColor must be used within a PageColorProvider');
  }
  return context;
}
