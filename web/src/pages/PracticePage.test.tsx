import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionView } from '../api/types';
import { App } from '../App';
import { PracticeStore } from '../practice/store';
import { storage } from '../storage';
import {
  attemptResponse,
  explanation,
  questionDetail,
  SESSION_ID,
  sessionView,
} from '../test/fixtures';
import { apiError, json, mockApi } from '../test/mock-api';

const SESSION = /\/api\/sessions\/[^/]+$/;
const QUESTION = /\/questions\/(\d+)$/;
const qidOf = (path: string) => Number(/\/questions\/(\d+)/.exec(path)![1]);

/** 打开 /practice/:qid；会话状态与题目详情按给定的状态返回 */
function open(qid: number | string, view: SessionView = sessionView()) {
  storage.setSessionId(SESSION_ID);
  window.history.replaceState(null, '', `/practice/${qid}`);
  const api = mockApi().on('GET', SESSION, json(200, view));
  // 题目详情按请求路径里的题号返回
  api.on('GET', QUESTION, () => {
    const path = api.calls.at(-1)!.path;
    return json(200, questionDetail(qidOf(path)));
  });
  const store = new PracticeStore({ eventRetryDelays: [], sleep: () => Promise.resolve() });
  render(<App store={store} />);
  return { api, store };
}

const input = () => screen.getByRole('textbox');
async function answer(value: string) {
  await userEvent.clear(input());
  await userEvent.type(input(), value);
  await userEvent.click(screen.getByRole('button', { name: '提交' }));
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('答题页', () => {
  it('显示进度、图形、题干和单位', async () => {
    open(1);
    expect(await screen.findByText('第 1 关 · 第 1/12 题')).toBeInTheDocument();
    expect(screen.getByText(/招牌是一个平行四边形/)).toBeInTheDocument();
    expect(screen.getByText('cm²')).toBeInTheDocument();
    const figure = screen.getByRole('img', { name: '题目图形' });
    expect(within(figure).getByText('8 cm')).toBeInTheDocument();
    expect(input()).toHaveAttribute('inputmode', 'decimal');
    expect(screen.queryByRole('button', { name: '看图文解析' })).not.toBeInTheDocument();
  });

  it('逆运算题：高的位置标"?"', async () => {
    open(3, sessionView({ 1: 'solved', 2: 'solved' }));
    const figure = await screen.findByRole('img', { name: '题目图形' });
    expect(within(figure).getByText('?')).toBeInTheDocument();
  });

  it('空输入：提示先填写，不发请求', async () => {
    const { api } = open(1);
    await screen.findByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(screen.getByRole('alert')).toHaveTextContent('先填写答案');
    expect(api.writes()).toEqual([]);
  });

  it('不合法输入：显示后端提示，保留输入内容', async () => {
    const { api } = open(1);
    api.on(
      'POST',
      /\/attempts$/,
      apiError(400, 'INVALID_ANSWER', '只填数字就好，单位已经写好了', { reason: 'has_unit' }),
    );
    await screen.findByRole('textbox');
    await answer('40平方厘米');
    expect(await screen.findByText('只填数字就好，单位已经写好了')).toBeInTheDocument();
    expect(input()).toHaveValue('40平方厘米');
    expect(api.writes()[0]!.body).toMatchObject({ questionId: 1, answer: '40平方厘米' });
  });

  it('一次做对：鼓励语，"下一题"进入当前题', async () => {
    const { api } = open(1);
    api.on(
      'POST',
      /\/attempts$/,
      json(201, attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' }))),
    );
    await screen.findByRole('textbox');
    await answer('40');
    expect(await screen.findByText(/一次就做对/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 题，已答对' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(window.location.pathname).toBe('/practice/2');
  });

  it('常见错误：显示提示和"再试一次 / 看图文解析 / 先跳过"', async () => {
    const before = sessionView({ 1: 'solved', 2: 'solved', 3: 'solved' });
    const { api } = open(4, before);
    api.on(
      'POST',
      /\/attempts$/,
      json(
        201,
        attemptResponse(
          { questionId: 4, correct: false, mistakeHint: '别忘了 ÷ 2' },
          sessionView({ 1: 'solved', 2: 'solved', 3: 'solved', 4: 'wrong' }),
        ),
      ),
    );
    await screen.findByRole('textbox');
    await answer('60');
    expect(await screen.findByText('别忘了 ÷ 2')).toBeInTheDocument();
    for (const name of ['再试一次', '看图文解析', '先跳过'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '再试一次' }));
    expect(input()).toHaveValue('');
    expect(screen.queryByText('别忘了 ÷ 2')).not.toBeInTheDocument();
  });

  it('订正后做对与点亮关卡：不同的鼓励语', async () => {
    const { api } = open(3, sessionView({ 1: 'solved', 2: 'solved', 3: 'wrong' }));
    api.on(
      'POST',
      /\/attempts$/,
      json(
        201,
        attemptResponse(
          { questionId: 3, correct: true, attemptNo: 2, outcome: 'corrected', stageLit: true },
          sessionView({ 1: 'solved', 2: 'solved', 3: 'solved' }),
        ),
      ),
    );
    await screen.findByRole('textbox');
    await answer('4');
    // 圆圆举手庆祝，话里同时肯定改正与点亮（companion-feedback）
    expect(await screen.findByText('面包店点亮了')).toBeInTheDocument();
    expect(screen.getByText(/改正之后/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '圆圆：举手庆祝' })).toBeInTheDocument();
  });

  it('连点提交：只发出一次请求', async () => {
    const { api } = open(1);
    let release!: () => void;
    api.on(
      'POST',
      /\/attempts$/,
      () =>
        new Promise((r) => {
          release = () =>
            r(
              json(
                201,
                attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' })),
              ),
            );
        }),
    );
    await screen.findByRole('textbox');
    await userEvent.type(input(), '40');
    const submit = screen.getByRole('button', { name: '提交' });
    await userEvent.click(submit);
    await userEvent.click(submit);
    await userEvent.keyboard('{Enter}');
    expect(submit).toBeDisabled();
    release();
    await screen.findByText(/一次就做对/);
    expect(api.writes()).toHaveLength(1);
  });

  it('结果不确定：不显示对错，"再提交一次"用同一个键，拿到首次结果后显示', async () => {
    const { api } = open(1);
    api.on('POST', /\/attempts$/, (_body, n) =>
      n === 0
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } })
        : json(
            200,
            attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' }), {
              replayed: true,
            }),
          ),
    );
    await screen.findByRole('textbox');
    await answer('40');
    expect(await screen.findByText(/暂时没法确认有没有提交成功/)).toBeInTheDocument();
    expect(screen.queryByText(/一次就做对/)).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: '先跳过' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '再提交一次' }));
    expect(await screen.findByText(/一次就做对/)).toBeInTheDocument();
    const [first, second] = api.writes();
    expect(second!.body).toEqual(first!.body);
  });

  it('重放结果已过时（答错但该题已答对）：不显示答错', async () => {
    const { api } = open(1);
    api.on(
      'POST',
      /\/attempts$/,
      json(
        200,
        attemptResponse(
          { questionId: 1, correct: false, mistakeHint: '不用 ÷ 2' },
          sessionView({ 1: 'solved' }),
          { replayed: true },
        ),
      ),
    );
    await screen.findByRole('textbox');
    await answer('20');
    expect(await screen.findByText('这道题已经做对了')).toBeInTheDocument();
    expect(screen.queryByText('不用 ÷ 2')).not.toBeInTheDocument();
  });

  it('看解析后再答对：解析显示后上报，作答在上报确认后发送', async () => {
    const { api } = open(1, sessionView({ 1: 'wrong' }));
    let releaseEvent!: () => void;
    api
      .on('GET', /\/explanation$/, json(200, explanation(1)))
      .on(
        'POST',
        /\/events$/,
        () => new Promise((r) => (releaseEvent = () => r(json(201, { replayed: false })))),
      )
      .on(
        'POST',
        /\/attempts$/,
        json(
          201,
          attemptResponse(
            { questionId: 1, correct: true, attemptNo: 2, outcome: 'corrected' },
            sessionView({ 1: 'solved' }),
          ),
        ),
      );
    expect(await screen.findByText('这道题上次没答对，再试试吧。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '看图文解析' }));
    expect(await screen.findByRole('region', { name: '图文解析' })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.writes().map((c) => c.path)).toEqual([expect.stringMatching(/events$/)]),
    );
    expect(api.writes()[0]!.body).toMatchObject({ questionId: 1, type: 'explanation_text_opened' });

    await userEvent.type(input(), '40');
    await userEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(api.writes()).toHaveLength(1);
    expect(screen.getByText(/正在保存解析记录，请稍等/)).toBeInTheDocument();
    releaseEvent();
    expect(await screen.findByText(/改正成功/)).toBeInTheDocument();
    expect(api.writes().map((c) => c.path.split('/').pop())).toEqual(['events', 'attempts']);
    expect(screen.queryByText(/正在保存解析记录/)).not.toBeInTheDocument();
  });

  it('跳过：进入后端返回的当前题', async () => {
    const { api } = open(3, sessionView({ 1: 'solved', 2: 'solved' }));
    api.on(
      'POST',
      /\/skip$/,
      json(201, {
        replayed: false,
        alreadySolved: false,
        session: sessionView({ 1: 'solved', 2: 'solved', 3: 'skipped' }),
      }),
    );
    await screen.findByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: '先跳过' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/4'));
    expect(await screen.findByText('第 2 关 · 第 4/12 题')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 3 题，跳过' })).toBeEnabled();
  });

  it('地址中的题未解锁：转到当前题；未解锁关卡的题不可点击', async () => {
    open(10, sessionView({ 1: 'solved' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/2'));
    expect(screen.getByRole('button', { name: '第 10 题，未作答' })).toBeDisabled();
  });

  it('地址中的题号不合法：转到当前题', async () => {
    open('abc');
    await waitFor(() => expect(window.location.pathname).toBe('/practice/1'));
  });

  it('已答对的题：显示"已经做对了"，没有输入框，可以看解析', async () => {
    open(1, sessionView({ 1: 'solved' }));
    expect(await screen.findByText('这道题已经做对了')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '看图文解析' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去当前题' })).toBeInTheDocument();
  });

  it('会话已在别处结束：作答返回 SESSION_COMPLETED 后转到总结页', async () => {
    const { api } = open(1);
    api.on('POST', /\/attempts$/, apiError(409, 'SESSION_COMPLETED', '这次练习已经结束了'));
    await screen.findByRole('textbox');
    await answer('40');
    await waitFor(() => expect(window.location.pathname).toBe('/summary'));
  });

  it('没有保存会话：回首页', async () => {
    window.history.replaceState(null, '', '/practice/1');
    mockApi();
    render(<App store={new PracticeStore()} />);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('后端连不上：提示，不显示题目', async () => {
    storage.setSessionId(SESSION_ID);
    window.history.replaceState(null, '', '/practice/1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<App store={new PracticeStore()} />);
    expect(await screen.findByText('暂时连不上服务器，请稍后再试')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('结束练习', () => {
  const allDone = () =>
    sessionView(
      Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [i + 1, i === 6 ? 'skipped' : 'solved']),
      ),
    );

  it('全部处理过：提示跳过的题数，"完成练习"后进入总结页', async () => {
    const { api } = open(7, allDone());
    api.on('POST', /\/complete$/, json(200, allDone()));
    expect(await screen.findByText(/还有 1 道题跳过了/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '完成练习' }));
    await waitFor(() => expect(window.location.pathname).toBe('/summary'));
    expect(api.writes()[0]!.body).toEqual({ endedEarly: false });
  });

  it('提前结束：取消时不发请求，确认后 endedEarly 为 true', async () => {
    const { api } = open(1);
    api.on('POST', /\/complete$/, json(200, sessionView()));
    await screen.findByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: '提前结束' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.writes()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: '提前结束' }));
    await userEvent.click(screen.getByRole('button', { name: '确定结束' }));
    await waitFor(() => expect(window.location.pathname).toBe('/summary'));
    expect(api.writes()[0]!.body).toEqual({ endedEarly: true });
  });

  it('会话已结束时打开答题页：转到总结页', async () => {
    const view = sessionView();
    view.session.status = 'completed';
    open(1, view);
    await waitFor(() => expect(window.location.pathname).toBe('/summary'));
  });
});

describe('读取失败与等待重试', () => {
  it('题目读取失败：提示并可以重新读取', async () => {
    const { api } = open(1);
    let fail = true;
    api.on('GET', QUESTION, () =>
      fail ? Promise.reject(new TypeError('Failed to fetch')) : json(200, questionDetail(1)),
    );
    expect(await screen.findByText(/暂时没能读取题目/)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('解析读取失败：提示并可以重新读取', async () => {
    const { api } = open(1, sessionView({ 1: 'wrong' }));
    let fail = true;
    api
      .on('GET', /\/explanation$/, () =>
        fail ? json(503, { status: 'error' }) : json(200, explanation(1)),
      )
      .on('POST', /\/events$/, json(201, { replayed: false }));
    await userEvent.click(await screen.findByRole('button', { name: '看图文解析' }));
    expect(await screen.findByText(/暂时没能读取解析/)).toBeInTheDocument();
    expect(api.writes()).toEqual([]);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByRole('region', { name: '图文解析' })).toBeInTheDocument();
  });

  it('跳过结果不确定：显示"再提交一次"，题目导航被锁住', async () => {
    const { api } = open(1);
    api.on('POST', /\/skip$/, (_body, n) =>
      n === 0
        ? Promise.reject(new TypeError('Failed to fetch'))
        : json(200, {
            replayed: true,
            alreadySolved: false,
            session: sessionView({ 1: 'skipped' }),
          }),
    );
    await screen.findByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: '先跳过' }));
    expect(await screen.findByText(/暂时没法确认/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 2 题，未作答' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '再提交一次' }));
    await waitFor(() => expect(window.location.pathname).toBe('/practice/2'));
    const [first, second] = api.writes();
    expect(second!.body).toEqual(first!.body);
  });

  it('等待重试时浏览器后退：提示和"再提交一次"仍在，别的题不显示待重试的答案', async () => {
    const { api } = open(2, sessionView({ 1: 'solved' }));
    window.history.replaceState(null, '', '/practice/1');
    window.history.pushState(null, '', '/practice/2');
    api.on('POST', /\/attempts$/, () => Promise.reject(new TypeError('Failed to fetch')));
    await screen.findByRole('textbox');
    await answer('48');
    expect(await screen.findByText(/暂时没法确认/)).toBeInTheDocument();
    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    await waitFor(() => expect(window.location.pathname).toBe('/practice/1'));
    expect(await screen.findByText('这道题已经做对了')).toBeInTheDocument();
    expect(screen.getByText(/暂时没法确认/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再提交一次' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '看图文解析' })).toBeDisabled();
  });

  it('全部做对后"完成练习"结果不确定：没有题目时也能"再提交一次"', async () => {
    const done = sessionView(
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 'solved'])),
    );
    const { api } = open('', done);
    api.on('POST', /\/complete$/, (_body, n) => (n === 0 ? json(502, {}) : json(200, done)));
    await userEvent.click(await screen.findByRole('button', { name: '完成练习' }));
    expect(await screen.findByText(/暂时没法确认/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '再提交一次' }));
    await waitFor(() => expect(window.location.pathname).toBe('/summary'));
    expect(api.writes().map((c) => c.body)).toEqual([{ endedEarly: false }, { endedEarly: false }]);
  });
});

describe('图形小镇与圆圆（H）', () => {
  const stage2 = (extra: Record<number, 'solved' | 'wrong'> = {}) =>
    sessionView({ 1: 'solved', 2: 'solved', 3: 'solved', ...extra });

  it('答错：圆圆歪头思考，说常见错误提示；图形上出现辅助提示，改答案后仍保留', async () => {
    const { api } = open(4, stage2());
    api.on(
      'POST',
      /\/attempts$/,
      json(
        201,
        attemptResponse(
          { questionId: 4, correct: false, mistakeHint: '别忘了 ÷ 2' },
          stage2({ 4: 'wrong' }),
        ),
      ),
    );
    await screen.findByRole('textbox');
    expect(screen.getByRole('img', { name: '圆圆' })).toBeInTheDocument();
    await answer('60');
    expect(await screen.findByText('别忘了 ÷ 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '圆圆：歪头思考' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^题目图形。提示：/ })).toBeInTheDocument();
    // 直接改答案：回到"提交"，提示保留
    await userEvent.type(input(), '0');
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^题目图形。提示：/ })).toBeInTheDocument();
  });

  it('做对后提示消失；建筑面板长出一层（只有新的一层带动画）', async () => {
    const { api } = open(4, stage2({ 4: 'wrong' }));
    api.on('POST', /\/attempts$/, (_b, n) =>
      n === 0
        ? json(201, attemptResponse({ questionId: 4, correct: false }, stage2({ 4: 'wrong' })))
        : json(
            201,
            attemptResponse(
              { questionId: 4, correct: true, outcome: 'corrected', attemptNo: 2 },
              stage2({ 4: 'solved' }),
            ),
          ),
    );
    await screen.findByRole('textbox');
    const panel = screen.getByRole('region', { name: '帐篷营地的进度' });
    // 进入页面：直接显示当前阶段，没有动画
    expect(within(panel).getByRole('img', { name: '帐篷营地：施工中 0/3' })).toBeInTheDocument();
    expect(panel.querySelector('.entering')).toBeNull();

    await answer('60');
    await screen.findByRole('img', { name: /^题目图形。提示：/ });
    await answer('30');
    expect(await screen.findByText('改正成功')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '圆圆：竖起大拇指' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^题目图形。提示：/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole('img', { name: '帐篷营地：施工中 1/3' })).toBeInTheDocument();
    expect(
      [...panel.querySelectorAll('.entering')].map((g) => g.getAttribute('data-layer')),
    ).toEqual(['layer1']);
  });

  it('已点亮的关卡：打开页面直接显示点亮，不播放动画', async () => {
    open(2, sessionView({ 1: 'solved', 2: 'solved', 3: 'solved' }));
    await screen.findByText('这道题已经做对了');
    const panel = screen.getByRole('region', { name: '面包店的进度' });
    expect(within(panel).getByRole('img', { name: '面包店：已点亮' })).toBeInTheDocument();
    expect(panel.querySelector('.entering, .lighting')).toBeNull();
  });
});

describe('视频讲解（I）', () => {
  const stage2Wrong4 = () => sessionView({ 1: 'solved', 2: 'solved', 3: 'solved', 4: 'wrong' });
  const events = (api: ReturnType<typeof mockApi>) =>
    api
      .writes()
      .filter((c) => c.path.endsWith('/events'))
      .map((c) => (c.body as { type: string }).type);

  const VTT = [
    'WEBVTT',
    '',
    '1',
    '00:00:00.000 --> 00:00:08.088',
    '这是营地里的一顶帐篷，正面是一个三角形。',
    '',
    '2',
    '00:00:08.088 --> 00:00:14.856',
    '三角形的面积怎么算呢？我们先复制一个完全一样的三角形。',
    '',
  ].join('\n');

  function openQ4({ vtt = true } = {}) {
    const { api } = open(4, stage2Wrong4());
    api
      .on('GET', /\/explanation$/, json(200, explanation(4)))
      .on('POST', /\/events$/, json(201, { replayed: false }));
    if (vtt) api.on('GET', /\/videos\/q04\.vtt$/, new Response(VTT, { status: 200 }));
    return api;
  }

  const seekTo = (video: HTMLVideoElement, t: number) => {
    Object.defineProperty(video, 'currentTime', { value: t, configurable: true });
    fireEvent.timeUpdate(video);
  };

  it('字幕显示在视频下方，随播放进度切换，不叠在画面上', async () => {
    openQ4();
    await screen.findByText('这道题上次没答对，再试试吧。');
    await userEvent.click(screen.getByRole('button', { name: '看视频讲解' }));
    const region = await screen.findByRole('region', { name: '视频讲解' });
    const caption = await within(region).findByTestId('video-caption');
    const video = region.querySelector('video')!;
    // 字幕行在视频之后（下方），不是视频内部的叠加层
    expect(video.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    seekTo(video, 3);
    expect(caption).toHaveTextContent('这是营地里的一顶帐篷，正面是一个三角形。');
    seekTo(video, 13);
    expect(caption).toHaveTextContent('三角形的面积怎么算呢？我们先复制一个完全一样的三角形。');
    seekTo(video, 30);
    expect(caption.textContent?.trim()).toBe('');
  });

  it('字幕读取失败：不显示字幕行，视频照常可以播放', async () => {
    openQ4({ vtt: false });
    await screen.findByText('这道题上次没答对，再试试吧。');
    await userEvent.click(screen.getByRole('button', { name: '看视频讲解' }));
    const region = await screen.findByRole('region', { name: '视频讲解' });
    await waitFor(() => expect(region.querySelector('video')).toBeInTheDocument());
    expect(within(region).queryByTestId('video-caption')).not.toBeInTheDocument();
  });

  it('有视频的题：同时提供"看图文解析"和"看视频讲解"；没有视频的题只有图文', async () => {
    openQ4();
    await screen.findByText('这道题上次没答对，再试试吧。');
    expect(screen.getByRole('button', { name: '看图文解析' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '看视频讲解' })).toBeInTheDocument();
  });

  it('没有视频的题只显示"看图文解析"', async () => {
    open(2, sessionView({ 2: 'wrong' }));
    await screen.findByText('这道题上次没答对，再试试吧。');
    expect(screen.queryByRole('button', { name: '看视频讲解' })).not.toBeInTheDocument();
  });

  it('只打开不播放不上报；播放与看完各上报一次，不上报"打开图文解析"', async () => {
    const api = openQ4();
    await screen.findByText('这道题上次没答对，再试试吧。');
    await userEvent.click(screen.getByRole('button', { name: '看视频讲解' }));
    const region = await screen.findByRole('region', { name: '视频讲解' });
    const video = region.querySelector('video')!;
    // 浏览器字幕平时不显示（只在全屏时打开），不自动播放，有封面
    const track = video.querySelector('track')!;
    expect(track).toHaveAttribute('kind', 'captions');
    expect(track).toHaveAttribute('src', '/videos/q04.vtt');
    expect(track).not.toHaveAttribute('default');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('poster', '/videos/q04.jpg');
    expect(video.querySelector('source')).toHaveAttribute('src', '/videos/q04.mp4');
    expect(events(api)).toEqual([]);

    fireEvent.playing(video);
    fireEvent.pause(video);
    fireEvent.playing(video);
    await waitFor(() => expect(events(api)).toEqual(['video_started']));
    fireEvent.ended(video);
    fireEvent.playing(video);
    fireEvent.ended(video);
    await waitFor(() => expect(events(api)).toEqual(['video_started', 'video_completed']));
    expect(screen.queryByRole('region', { name: '图文解析' })).not.toBeInTheDocument();
  });

  it('视频加载失败：提示改看图文解析，点击后打开图文解析', async () => {
    const api = openQ4();
    await screen.findByText('这道题上次没答对，再试试吧。');
    await userEvent.click(screen.getByRole('button', { name: '看视频讲解' }));
    const region = await screen.findByRole('region', { name: '视频讲解' });
    fireEvent.error(region.querySelector('source')!);
    expect(await screen.findByText('视频暂时无法播放，可以先看图文解析')).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: '看图文解析' }));
    expect(await screen.findByRole('region', { name: '图文解析' })).toBeInTheDocument();
    await waitFor(() => expect(events(api)).toEqual(['explanation_text_opened']));
  });
});
