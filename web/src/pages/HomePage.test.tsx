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

  it('其他拒绝（如请求过多）：不清除保存的会话', async () => {
    storage.setSessionId(SESSION_ID);
    mockApi().on('GET', /\/api\/sessions\//, apiError(429, 'RATE_LIMITED'));
    renderApp();
    expect(await screen.findByText('暂时连不上服务器，请稍后再试')).toBeInTheDocument();
    expect(storage.getSessionId()).toBe(SESSION_ID);
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

describe('首页的小镇地图（H）', () => {
  it('没有会话：四块空地，第 1 关标"从这里开始"', async () => {
    mockApi();
    renderApp();
    const map = await screen.findByRole('region', { name: '小镇地图' });
    expect(map).toHaveTextContent('面包店 · 从这里开始');
    expect(screen.getByRole('img', { name: '帐篷营地：未解锁' })).toBeInTheDocument();
    expect(map.querySelectorAll('[data-layer="plot"]')).toHaveLength(4);
  });

  it('有会话：按后端返回的各关状态显示，不播放动画', async () => {
    storage.setSessionId(SESSION_ID);
    storage.setLearnerId(LEARNER_ID);
    mockApi().on(
      'GET',
      /\/api\/sessions\/[^/]+$/,
      json(200, sessionView({ 1: 'solved', 2: 'solved', 3: 'solved', 4: 'solved', 5: 'solved' })),
    );
    renderApp();
    expect(await screen.findByRole('img', { name: '面包店：已点亮' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '帐篷营地：施工中 2/3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '小桥：未解锁' })).toBeInTheDocument();
    expect(screen.getByText(/面包店已经点亮了/)).toBeInTheDocument();
    expect(screen.getByText(/帐篷营地还差 1 道三角形的题/)).toBeInTheDocument();
    expect(document.querySelector('.entering, .lighting')).toBeNull();
  });
});

describe('首次进入引导（H）', () => {
  const freshVisitor = () => localStorage.removeItem('polygon.guideSeen');

  it('第一次来：自动出现，焦点在"下一步"；走完 4 步后关闭并记住', async () => {
    freshVisitor();
    mockApi();
    renderApp();
    const dialog = await screen.findByRole('dialog', { name: '欢迎来到图形小镇' });
    expect(screen.getByRole('button', { name: '下一步' })).toHaveFocus();
    for (const title of ['这里将盖起面包店', '一关一关往前走', '准备好了吗']) {
      await userEvent.click(screen.getByRole('button', { name: '下一步' }));
      expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: '开始吧' }));
    expect(dialog).not.toBeInTheDocument();
    expect(storage.getGuideSeen()).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: '开始练习' })).toHaveFocus());
  });

  it('跳过后刷新不再出现；"玩法介绍"可以再看', async () => {
    freshVisitor();
    mockApi();
    const first = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: '跳过引导' }));
    first.unmount();
    renderApp();
    await screen.findByRole('button', { name: '开始练习' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '玩法介绍' }));
    expect(screen.getByRole('dialog', { name: '欢迎来到图形小镇' })).toBeInTheDocument();
  });

  it('按 Esc：关闭并记住，焦点回到主按钮', async () => {
    freshVisitor();
    mockApi();
    renderApp();
    await screen.findByRole('dialog');
    // 焦点移到对话框外面后，Esc 仍然有效
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(storage.getGuideSeen()).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: '开始练习' })).toHaveFocus());
  });

  it('已经有学生（升级前就在练习）：不自动出现', async () => {
    freshVisitor();
    storage.setLearnerId(LEARNER_ID);
    mockApi();
    renderApp();
    await screen.findByRole('button', { name: '开始练习' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
