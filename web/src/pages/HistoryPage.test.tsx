import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryResponse } from '../api/types';
import { App } from '../App';
import { PracticeStore } from '../practice/store';
import { storage } from '../storage';
import { LEARNER_ID, SESSION_ID, summaryResponse } from '../test/fixtures';
import { apiError, json, mockApi } from '../test/mock-api';

const OLD_ID = '44444444-4444-4444-8444-444444444444';

const history = (): HistoryResponse => ({
  sessions: [
    {
      id: SESSION_ID,
      status: 'in_progress',
      endedEarly: null,
      startedAt: '2026-11-11T03:00:00.000Z',
      completedAt: null,
      counts: { total: 12, firstTry: 2, corrected: 1, notYet: 9 },
      rates: { firstTry: 17, completion: 25 },
    },
    {
      id: OLD_ID,
      status: 'completed',
      endedEarly: false,
      startedAt: '2026-11-10T03:00:00.000Z',
      completedAt: '2026-11-10T03:30:00.000Z',
      counts: { total: 12, firstTry: 10, corrected: 1, notYet: 1 },
      rates: { firstTry: 83, completion: 92 },
    },
  ],
});

/** 渲染前注册模拟路由：页面一渲染就会发请求 */
function open(path: string, routes: (api: ReturnType<typeof mockApi>) => void = () => {}) {
  storage.setLearnerId(LEARNER_ID);
  storage.setSessionId(SESSION_ID);
  window.history.replaceState(null, '', path);
  const api = mockApi().on('GET', /\/api\/learners\/[^/]+\/sessions$/, json(200, history()));
  routes(api);
  const store = new PracticeStore();
  render(<App store={store} />);
  return { api, store };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('练习记录', () => {
  it('列出每次练习：最近的在前，已结束的显示比率和"查看总结"，进行中的显示"继续练习"', async () => {
    const { api } = open('/history');
    const items = await screen.findAllByRole('listitem');
    expect(api.calls[0]!.path).toBe(`/api/learners/${LEARNER_ID}/sessions`);
    expect(items[0]).toHaveTextContent('第 2 次');
    expect(items[0]).toHaveTextContent('进行中 · 已做对 3 题');
    expect(items[1]).toHaveTextContent('第 1 次');
    expect(items[1]).toHaveTextContent('已完成 · 首次正确率 83% · 最终完成率 92%');
    await userEvent.click(within(items[1]!).getByRole('button', { name: '查看总结' }));
    expect(window.location.pathname).toBe(`/summary/${OLD_ID}`);
  });

  it('查看旧会话的总结：显示那次的数字；回看不改动当前会话', async () => {
    const { api, store } = open(`/summary/${OLD_ID}`, (api) =>
      api
        .on(
          'GET',
          /\/summary$/,
          json(200, summaryResponse({ 2: { outcome: 'corrected', facts: { wrongCount: 1 } } })),
        )
        .on('GET', /\/questions\/\d+$/, apiError(404, 'QUESTION_NOT_IN_SESSION'))
        .on('GET', /\/explanation$/, apiError(403, 'EXPLANATION_LOCKED')),
    );
    const stats = await screen.findByRole('region', { name: '统计' });
    expect(api.calls.find((c) => c.path.endsWith('/summary'))!.path).toBe(
      `/api/sessions/${OLD_ID}/summary`,
    );
    expect(stats).toHaveTextContent('一次做对 11 题，订正后做对 1 题');
    await userEvent.click(screen.getByRole('button', { name: '回看第 2 题' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === `/api/sessions/${OLD_ID}/questions/2`)).toBe(true),
    );
    expect(storage.getSessionId()).toBe(SESSION_ID);
    expect(store.getState().sessionId).not.toBe(OLD_ID);
    expect(window.location.pathname).toBe(`/summary/${OLD_ID}`);
  });

  it('旧会话不存在：回到练习记录，不清除当前会话', async () => {
    open(`/summary/${OLD_ID}`, (api) =>
      api.on('GET', /\/summary$/, apiError(404, 'SESSION_NOT_FOUND')),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/history'));
    expect(storage.getSessionId()).toBe(SESSION_ID);
  });

  it('总结页与首页都有"练习记录"入口', async () => {
    open('/summary', (api) => api.on('GET', /\/summary$/, json(200, summaryResponse())));
    await userEvent.click(await screen.findByRole('button', { name: '练习记录' }));
    expect(window.location.pathname).toBe('/history');
  });

  it('首页：有保存的学生时显示"练习记录"', async () => {
    open('/', (api) => api.on('GET', /\/api\/sessions\/[^/]+$/, json(200, summaryResponse())));
    expect(await screen.findByRole('button', { name: '练习记录' })).toBeInTheDocument();
  });

  it('学生已失效：清除并回首页', async () => {
    open('/history', (api) => api.on('GET', /\/sessions$/, apiError(404, 'LEARNER_NOT_FOUND')));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(storage.getLearnerId()).toBeNull();
  });

  it('读取失败：提示并可以重新读取', async () => {
    const { api } = open('/history', (api) => api.on('GET', /\/sessions$/, json(503, {})));
    expect(await screen.findByText(/暂时没能读取练习记录/)).toBeInTheDocument();
    api.on('GET', /\/sessions$/, json(200, history()));
    await userEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });
});
