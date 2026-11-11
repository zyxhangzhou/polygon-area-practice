import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { navigate, parseRoute, useRoute } from './router';
import { storage } from './storage';

describe('parseRoute', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/summary', { page: 'summary' }],
    ['/practice', { page: 'practice', qid: null }],
    ['/practice/4', { page: 'practice', qid: 4 }],
    ['/practice/4/', { page: 'practice', qid: 4 }],
    ['/practice/abc', { page: 'practice', qid: null }],
    ['/nope', { page: 'not-found' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });
});

describe('useRoute', () => {
  it('pushState 跳转与浏览器后退都会更新', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: 'home' });
    act(() => navigate('/practice/2'));
    expect(result.current).toEqual({ page: 'practice', qid: 2 });
    act(() => navigate('/practice/5', { replace: true }));
    expect(result.current).toEqual({ page: 'practice', qid: 5 });
    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    expect(result.current).toEqual({ page: 'home' });
  });
});

describe('storage', () => {
  it('读写 learnerId 与 sessionId', () => {
    storage.setLearnerId('l1');
    storage.setSessionId('s1');
    expect([storage.getLearnerId(), storage.getSessionId()]).toEqual(['l1', 's1']);
    storage.clearAll();
    expect([storage.getLearnerId(), storage.getSessionId()]).toEqual([null, null]);
  });

  it('localStorage 不可用时退化为内存，不抛错', () => {
    const boom = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(() => storage.setSessionId('s2')).not.toThrow();
    expect(storage.getSessionId()).toBe('s2');
    storage.clearAll();
    expect(storage.getSessionId()).toBeNull();
  });
});
