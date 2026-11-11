import { useState } from 'react';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { PracticePage } from './pages/PracticePage';
import { SummaryPage } from './pages/SummaryPage';
import { StoreProvider } from './practice/context';
import { PracticeStore } from './practice/store';
import { navigate, useRoute } from './router';

export function App({ store: injected }: { store?: PracticeStore }) {
  const [store] = useState(() => injected ?? new PracticeStore());
  const route = useRoute();
  return (
    <StoreProvider store={store}>
      {route.page === 'home' && <HomePage />}
      {route.page === 'practice' && <PracticePage qid={route.qid} />}
      {route.page === 'summary' && (
        <SummaryPage key={route.sessionId ?? 'current'} sessionId={route.sessionId} />
      )}
      {route.page === 'history' && <HistoryPage />}
      {route.page === 'not-found' && (
        <main className="page">
          <p>页面不存在。</p>
          <button onClick={() => navigate('/')}>回到首页</button>
        </main>
      )}
    </StoreProvider>
  );
}
