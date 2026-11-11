import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { storage } from '../storage';
import { LEARNER_ID, SESSION_ID, sessionView } from '../test/fixtures';
import { apiError, json, mockApi } from '../test/mock-api';

const renderApp = () =>
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

afterEach(() => vi.unstubAllGlobals());

describe('首页', () => {
  it('第一次打开：显示"开始练习"，不发任何写请求（StrictMode 下也一样）', async () => {
    const api = mockApi();
    renderApp();
    expect(await screen.findByRole('button', { name: '开始练习' })).toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('开始练习：创建学生和会话，保存标识，进入第 1 题', async () => {
    const api = mockApi()
      .on('POST', /\/api\/learners$/, json(201, { learnerId: LEARNER_ID }))
      .on('POST', /\/api\/sessions$/, json(201, sessionView()))
      .on('GET', /\/questions\/1$/, apiError(404, 'QUESTION_NOT_IN_SESSION'));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: '开始练习' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/1'));
    expect(api.writes().map((c) => c.path)).toEqual(['/api/learners', '/api/sessions']);
    expect(api.writes()[1]!.body).toEqual({ learnerId: LEARNER_ID });
    expect([storage.getLearnerId(), storage.getSessionId()]).toEqual([LEARNER_ID, SESSION_ID]);
  });

  it('继续练习：显示已答对题数，点击进入当前题', async () => {
    storage.setSessionId(SESSION_ID);
    const view = sessionView({ 1: 'solved', 2: 'solved', 3: 'solved' });
    mockApi()
      .on('GET', /\/api\/sessions\/[^/]+$/, json(200, view))
      .on('GET', /\/questions\/4$/, apiError(404, 'QUESTION_NOT_IN_SESSION'));
    renderApp();
    expect(await screen.findByText(/已经做对 3 道题/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '继续练习' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/4'));
  });

  it('会话已结束：显示"再练一次"和"查看总结"', async () => {
    storage.setSessionId(SESSION_ID);
    const view = sessionView({}, {});
    view.session.status = 'completed';
    mockApi().on('GET', /\/api\/sessions\/[^/]+$/, json(200, view));
    renderApp();
    expect(await screen.findByRole('button', { name: '再练一次' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '查看总结' }));
    expect(window.location.pathname).toBe('/summary');
  });

  it('保存的会话已失效：清除并显示"开始练习"', async () => {
    storage.setSessionId(SESSION_ID);
    mockApi().on('GET', /\/api\/sessions\//, apiError(404, 'SESSION_NOT_FOUND'));
    renderApp();
    expect(await screen.findByRole('button', { name: '开始练习' })).toBeInTheDocument();
    expect(storage.getSessionId()).toBeNull();
  });

  it('保存的学生已失效：开始练习时重新创建学生', async () => {
    storage.setLearnerId('stale');
    const api = mockApi()
      .on('POST', /\/api\/learners$/, json(201, { learnerId: LEARNER_ID }))
      .on('POST', /\/api\/sessions$/, (body) =>
        (body as { learnerId: string }).learnerId === 'stale'
          ? apiError(404, 'LEARNER_NOT_FOUND')
          : json(201, sessionView()),
      )
      .on('GET', /\/questions\/1$/, apiError(404, 'QUESTION_NOT_IN_SESSION'));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: '开始练习' }));
    await waitFor(() => expect(storage.getSessionId()).toBe(SESSION_ID));
    expect(api.writes().map((c) => c.path)).toEqual([
      '/api/sessions',
      '/api/learners',
      '/api/sessions',
    ]);
  });

  it('后端连不上：提示并可重新连接', async () => {
    storage.setSessionId(SESSION_ID);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderApp();
    expect(await screen.findByText('暂时连不上服务器，请稍后再试')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新连接' })).toBeInTheDocument();
  });
});
