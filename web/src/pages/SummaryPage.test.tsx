import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SummaryResponse } from '../api/types';
import { App } from '../App';
import { PracticeStore } from '../practice/store';
import { storage } from '../storage';
import {
  explanation,
  LEARNER_ID,
  questionDetail,
  SESSION_ID,
  sessionView,
  summaryResponse,
} from '../test/fixtures';
import { apiError, json, mockApi } from '../test/mock-api';

const SUMMARY = /\/summary$/;

function open(summary: SummaryResponse | Response) {
  storage.setSessionId(SESSION_ID);
  storage.setLearnerId(LEARNER_ID);
  window.history.replaceState(null, '', '/summary');
  const api = mockApi().on(
    'GET',
    SUMMARY,
    summary instanceof Response ? summary : json(200, summary),
  );
  api.on('GET', /\/questions\/\d+$/, () =>
    json(200, questionDetail(Number(/questions\/(\d+)/.exec(api.calls.at(-1)!.path)![1]))),
  );
  api.on('GET', /\/explanation$/, () =>
    json(200, explanation(Number(/questions\/(\d+)/.exec(api.calls.at(-1)!.path)![1]))),
  );
  api.on('POST', /\/events$/, json(201, { replayed: false }));
  render(<App store={new PracticeStore()} />);
  return api;
}

/** E 实跑的结果：第 2 题订正，第 7 题跳过，其余一次做对 */
const realRun = () =>
  summaryResponse({
    2: {
      outcome: 'corrected',
      facts: {
        attemptCount: 2,
        wrongCount: 1,
        commonMistakes: ['13'],
        textOpened: true,
        textOpenedBeforeSolved: true,
      },
    },
    7: {
      outcome: 'not_yet',
      reason: 'skipped',
      facts: { attemptCount: 1, wrongCount: 1, commonMistakes: ['60'], skipCount: 1 },
    },
  });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('总结页', () => {
  it('统计数字与接口一致', async () => {
    open(realRun());
    const stats = await screen.findByRole('region', { name: '统计' });
    expect(within(stats).getByText('83%')).toBeInTheDocument();
    expect(within(stats).getByText('92%')).toBeInTheDocument();
    expect(stats).toHaveTextContent('共 12 题：一次做对 10 题，订正后做对 1 题，需回顾 1 题');
  });

  it('三组列表与需回顾的原因', async () => {
    open(
      summaryResponse({
        7: { outcome: 'not_yet', reason: 'skipped' },
        9: { outcome: 'not_yet', reason: 'wrong', facts: { wrongCount: 1 } },
        12: { outcome: 'not_yet', reason: 'unanswered' },
      }),
    );
    const review = await screen.findByRole('region', { name: '需回顾' });
    expect(within(review).getByRole('heading')).toHaveTextContent('需回顾（3 题）');
    const items = within(review).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.reason')?.textContent)).toEqual([
      '跳过了',
      '答错还没改对',
      '没有作答',
    ]);
    expect(items[0]).toHaveTextContent('第 7 题 · 梯形面积公式');
    const firstTry = screen.getByRole('region', { name: '一次做对' });
    expect(within(firstTry).getAllByRole('listitem')).toHaveLength(9);
  });

  it('空组：显示说明而不是空列表', async () => {
    open(summaryResponse());
    const review = await screen.findByRole('region', { name: '需回顾' });
    expect(review).toHaveTextContent('全部做对了，没有需要回顾的题！');
    expect(within(review).queryByRole('list')).not.toBeInTheDocument();
  });

  it('鼓励语与建议来自真实记录', async () => {
    open(realRun());
    expect(await screen.findByText(/这次做对了 11 道题/)).toBeInTheDocument();
    const advice = screen.getByRole('region', { name: '建议' });
    expect(advice).toHaveTextContent('第 2 题打开了图文解析后做对了');
    expect(advice).toHaveTextContent('第 7 题跳过了');
  });

  it('提前结束：页面说明', async () => {
    open(summaryResponse({ 3: { outcome: 'not_yet' } }, { endedEarly: true }));
    expect(await screen.findByText(/这次练习提前结束了/)).toBeInTheDocument();
  });

  it('回看：图形、题干、作答概况和解析，并上报打开图文解析；没有作答入口', async () => {
    const api = open(realRun());
    await userEvent.click(await screen.findByRole('button', { name: '回看第 2 题' }));
    const panel = await screen.findByRole('region', { name: '第 2 题回看' });
    expect(await within(panel).findByRole('img', { name: '题目图形' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('作答 2 次，答错 1 次，写过 13');
    expect(await within(panel).findByRole('region', { name: '图文解析' })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.writes().map((c) => c.body)).toEqual([
        expect.objectContaining({ questionId: 2, type: 'explanation_text_opened' }),
      ]),
    );
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '提交' })).not.toBeInTheDocument();
  });

  it('回看没作答的题：显示"没有作答"', async () => {
    open(
      summaryResponse({ 12: { outcome: 'not_yet', reason: 'unanswered' } }, { endedEarly: true }),
    );
    await userEvent.click(await screen.findByRole('button', { name: '回看第 12 题' }));
    const panel = await screen.findByRole('region', { name: '第 12 题回看' });
    expect(panel).toHaveTextContent('没有作答');
  });

  it('一次只展开一题', async () => {
    open(realRun());
    await userEvent.click(await screen.findByRole('button', { name: '回看第 2 题' }));
    await userEvent.click(screen.getByRole('button', { name: '回看第 7 题' }));
    expect(screen.queryByRole('region', { name: '第 2 题回看' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '第 7 题回看' })).toBeInTheDocument();
  });

  it('再练一次：创建新会话并进入第 1 题', async () => {
    const api = open(realRun());
    const fresh = sessionView();
    fresh.session.id = '33333333-3333-4333-8333-333333333333';
    api.on('POST', /\/api\/sessions$/, json(201, fresh));
    await userEvent.click(await screen.findByRole('button', { name: '再练一次' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/1'));
    expect(api.writes().at(-1)).toMatchObject({
      path: '/api/sessions',
      body: { learnerId: LEARNER_ID },
    });
    expect(storage.getSessionId()).toBe(fresh.session.id);
  });

  it('会话还在进行中：转到当前题', async () => {
    const inProgress = {
      ...realRun(),
      session: { ...realRun().session, status: 'in_progress' as const },
      currentQuestionId: 7,
    };
    open(inProgress);
    await waitFor(() => expect(window.location.pathname).toBe('/practice/7'));
  });

  it('会话已失效：清除并回首页', async () => {
    open(apiError(404, 'SESSION_NOT_FOUND'));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(storage.getSessionId()).toBeNull();
  });

  it('没有保存会话：回首页', async () => {
    window.history.replaceState(null, '', '/summary');
    mockApi();
    render(<App store={new PracticeStore()} />);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('读取失败：提示并可以重新读取', async () => {
    const api = open(json(503, {}));
    expect(await screen.findByText(/暂时没能读取学习总结/)).toBeInTheDocument();
    api.on('GET', SUMMARY, json(200, realRun()));
    await userEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByRole('region', { name: '统计' })).toBeInTheDocument();
  });
});
