import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { PracticeStore, type PracticeState } from './store';

const StoreContext = createContext<PracticeStore | null>(null);

export function StoreProvider({ store, children }: { store: PracticeStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): PracticeStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('缺少 StoreProvider');
  return store;
}

export function usePracticeState(): PracticeState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
