import React, { createContext, useContext, useState } from 'react';

export type ContentFilter = 'all' | 'tv' | 'movie';

interface FilterContextType {
  filter: ContentFilter;
  setFilter: (filter: ContentFilter) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<ContentFilter>('all');

  return (
    <FilterContext.Provider value={{ filter, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}
