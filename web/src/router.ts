import { useSyncExternalStore } from 'react';

/** 只有 3 个页面，不引入路由库（design D1） */
export type Route =
  | { page: 'home' }
  | { page: 'practice'; qid: number | null }
  | { page: 'summary' }
  | { page: 'not-found' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { page: 'home' };
  if (path === '/summary') return { page: 'summary' };
  if (path === '/practice') return { page: 'practice', qid: null };
  const m = /^\/practice\/([^/]+)$/.exec(path);
  if (m) {
    const qid = /^\d{1,6}$/.test(m[1]!) ? Number(m[1]) : null;
    return { page: 'practice', qid };
  }
  return { page: 'not-found' };
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/** 跳转；replace 为 true 时替换当前历史记录（用于纠正地址） */
export function navigate(path: string, { replace = false } = {}) {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  notify();
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return parseRoute(pathname);
}
