import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../api/api';
import { storage } from '../storage';
import { attemptResponse, SESSION_ID, sessionView } from '../test/fixtures';
import { attemptFeedback, PracticeStore, UNCERTAIN_MESSAGE } from './store';

type Call = { method: string; path: string; body: unknown };

/** 按顺序返回预设结果的 request；记录每次调用 */
function fakeRequest(...results: ApiResult<unknown>[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const next = results.shift();
    if (!next) throw new Error(`没有为 ${method} ${path} 准备结果`);
    return next;
  });
  return { fn, calls };
}

const ok = (data: unknown, status = 200): ApiResult<unknown> => ({ kind: 'ok', status, data });
const rejected = (code: string, message = code): ApiResult<unknown> => ({
  kind: 'rejected',
  status: 409,
  code,
  message,
});
const uncertain: ApiResult<unknown> = { kind: 'uncertain' };

function setup(...results: ApiResult<unknown>[]) {
  const { fn, calls } = fakeRequest(...results);
  const navigate = vi.fn();
  let n = 0;
  const store = new PracticeStore({
    request: fn as never,
    navigate,
    newKey: () => `key-${++n}`,
    eventRetryDelays: [1, 2],
    sleep: () => Promise.resolve(),
  });
  store.useSession(SESSION_ID, sessionView());
  return { store, calls, navigate };
}

/** 等队列跑完 */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('写队列', () => {
  it('按操作顺序依次发送：解析上报确认后才发作答', async () => {
    let releaseEvent!: (r: ApiResult<unknown>) => void;
    const order: string[] = [];
    const store = new PracticeStore({
      request: (async (_m: string, path: string) => {
        order.push(path.split('/').pop()!);
        if (path.endsWith('/events')) return new Promise((r) => (releaseEvent = r));
        return ok(attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' })));
      }) as never,
      navigate: vi.fn(),
    });
    store.useSession(SESSION_ID, sessionView({ 1: 'wrong' }));
    store.reportTextOpened(1);
    // 只有学习事件在排队时不锁按钮
    expect(store.getState().busy).toBe(false);
    store.submitAnswer(1, '40');
    await settle();
    expect(order).toEqual(['events']);
    expect(store.getState().busy).toBe(true);
    expect(store.getState().waitingForEvent).toBe(true);
    releaseEvent(ok({ replayed: false }, 201));
    await settle();
    expect(order).toEqual(['events', 'attempts']);
    expect(store.getState().busy).toBe(false);
    expect(store.getState().waitingForEvent).toBe(false);
  });

  it('作答结果不确定：停止并等待；"再提交一次"用同一个键和内容', async () => {
    const solved = sessionView({ 1: 'solved' });
    const { store, calls } = setup(
      uncertain,
      ok(attemptResponse({ questionId: 1, correct: true }, solved, { replayed: true })),
    );
    store.submitAnswer(1, '４０');
    await settle();
    const s = store.getState();
    expect(s.pendingRetry).toMatchObject({ type: 'attempt', key: 'key-1', answer: '４０' });
    expect(s.notice).toBe(UNCERTAIN_MESSAGE);
    expect(s.feedback).toBeNull();
    expect(s.session?.questions[0]!.status).toBe('unanswered');

    store.retry();
    await settle();
    expect(calls.map((c) => c.body)).toEqual([
      { questionId: 1, clientAttemptId: 'key-1', answer: '４０' },
      { questionId: 1, clientAttemptId: 'key-1', answer: '４０' },
    ]);
    expect(store.getState().pendingRetry).toBeNull();
    expect(store.getState().feedback).toMatchObject({ kind: 'result', result: { correct: true } });
  });

  it('等待重试时，后面入队的请求不会先发出', async () => {
    const { store, calls } = setup(uncertain);
    store.submitAnswer(1, '40');
    await settle();
    store.reportTextOpened(1);
    await settle();
    expect(calls).toHaveLength(1);
  });

  it('学习事件：结果不确定时用同一个键重试 2 次，仍失败就放弃并继续', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, calls } = setup(
      uncertain,
      uncertain,
      uncertain,
      ok(attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' }))),
    );
    store.reportTextOpened(1);
    store.submitAnswer(1, '40');
    await settle();
    await settle();
    const eventKeys = calls
      .filter((c) => c.path.endsWith('/events'))
      .map((c) => (c.body as { clientEventId: string }).clientEventId);
    expect(eventKeys).toEqual(['key-1', 'key-1', 'key-1']);
    expect(calls.at(-1)!.path).toMatch(/attempts$/);
    expect(store.getState().pendingRetry).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('同一题的图文解析只上报一次', async () => {
    const { store, calls } = setup(ok({ replayed: false }, 201));
    store.reportTextOpened(1);
    store.reportTextOpened(1);
    await settle();
    expect(calls).toHaveLength(1);
  });
});

describe('换会话', () => {
  it('等待响应期间换了会话：旧结果不影响新会话，新会话的请求照常发送', async () => {
    let releaseOld!: (r: ApiResult<unknown>) => void;
    const paths: string[] = [];
    const store = new PracticeStore({
      request: (async (_m: string, path: string) => {
        paths.push(path);
        if (path.includes('old')) return new Promise((r) => (releaseOld = r));
        return ok(
          attemptResponse({ questionId: 1, correct: true }, sessionView({ 1: 'solved' })),
          201,
        );
      }) as never,
      navigate: vi.fn(),
    });
    store.useSession('old', sessionView({ 1: 'wrong' }));
    store.submitAnswer(1, '40');
    await settle();
    store.useSession('new', sessionView());
    store.submitAnswer(1, '40');
    releaseOld(uncertain);
    await settle();
    await settle();
    expect(paths).toEqual(['/api/sessions/old/attempts', '/api/sessions/new/attempts']);
    expect(store.getState().pendingRetry).toBeNull();
    expect(store.getState().session?.questions[0]!.status).toBe('solved');
  });
});

describe('错误码处理', () => {
  it('INVALID_ANSWER：在该题显示后端提示', async () => {
    const { store } = setup({
      kind: 'rejected',
      status: 400,
      code: 'INVALID_ANSWER',
      message: '不要带单位',
      reason: 'has_unit',
    });
    store.submitAnswer(1, '40cm');
    await settle();
    expect(store.getState().invalid).toEqual({ questionId: 1, message: '不要带单位' });
  });

  it('SESSION_COMPLETED：转到总结页', async () => {
    const { store, navigate } = setup(rejected('SESSION_COMPLETED'));
    store.submitAnswer(1, '40');
    await settle();
    expect(navigate).toHaveBeenCalledWith('/summary');
  });

  it('SESSION_NOT_FOUND：清除保存的会话，回首页', async () => {
    storage.setSessionId(SESSION_ID);
    storage.setLearnerId('l');
    const { store, navigate } = setup(rejected('SESSION_NOT_FOUND'));
    store.skip(1);
    await settle();
    expect(storage.getSessionId()).toBeNull();
    expect(storage.getLearnerId()).toBe('l');
    expect(navigate).toHaveBeenCalledWith('/');
    expect(store.getState().session).toBeNull();
  });

  it('LEARNER_NOT_FOUND：清除学生和会话', async () => {
    storage.setSessionId(SESSION_ID);
    storage.setLearnerId('l');
    const { store } = setup(rejected('LEARNER_NOT_FOUND'));
    store.skip(1);
    await settle();
    expect([storage.getLearnerId(), storage.getSessionId()]).toEqual([null, null]);
  });

  it('STAGE_LOCKED：重新获取会话状态，转到当前题', async () => {
    const fresh = sessionView({ 1: 'solved', 2: 'solved' });
    const { store, navigate, calls } = setup(rejected('STAGE_LOCKED'), ok(fresh));
    store.submitAnswer(4, '30');
    await settle();
    expect(calls[1]).toMatchObject({ method: 'GET', path: `/api/sessions/${SESSION_ID}` });
    expect(navigate).toHaveBeenCalledWith('/practice/3', { replace: true });
  });

  it('NOT_FINISHED：重新获取会话状态并显示提示', async () => {
    const { store, calls } = setup(rejected('NOT_FINISHED', '还有题没有完成'), ok(sessionView()));
    store.complete(false);
    await settle();
    expect(calls).toHaveLength(2);
    expect(store.getState().notice).toBe('还有题没有完成');
  });

  it('RATE_LIMITED：作答保留为待重试，显示后端提示；"再提交一次"用同一个键', async () => {
    const solved = sessionView({ 1: 'solved' });
    const limited: ApiResult<unknown> = {
      kind: 'rejected',
      status: 429,
      code: 'RATE_LIMITED',
      message: '操作太频繁了，请等一会儿再试',
    };
    const { store, calls } = setup(
      limited,
      ok(attemptResponse({ questionId: 1, correct: true }, solved)),
    );
    store.submitAnswer(1, '40');
    await settle();
    expect(store.getState().pendingRetry).toMatchObject({ type: 'attempt', key: 'key-1' });
    expect(store.getState().notice).toBe('操作太频繁了，请等一会儿再试');
    expect(store.getState().feedback).toBeNull();

    store.retry();
    await settle();
    expect(calls.map((c) => c.body)).toEqual([
      { questionId: 1, clientAttemptId: 'key-1', answer: '40' },
      { questionId: 1, clientAttemptId: 'key-1', answer: '40' },
    ]);
    expect(store.getState().pendingRetry).toBeNull();
    expect(store.getState().feedback).toMatchObject({ kind: 'result', result: { correct: true } });
  });

  it('RATE_LIMITED：跳过同样保留为待重试', async () => {
    const { store } = setup(rejected('RATE_LIMITED', '太频繁'));
    store.skip(1);
    await settle();
    expect(store.getState().pendingRetry).toMatchObject({ type: 'skip', key: 'key-1' });
    expect(store.getState().notice).toBe('太频繁');
  });

  it('RATE_LIMITED：学习事件直接放弃，不提示，后面的作答照常发送', async () => {
    const { store, calls } = setup(
      rejected('RATE_LIMITED'),
      ok(attemptResponse({ questionId: 1, correct: false }, sessionView())),
    );
    store.reportTextOpened(1);
    store.submitAnswer(1, '9');
    await settle();
    expect(store.getState().pendingRetry).toBeNull();
    expect(store.getState().notice).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('学习事件被拒绝：放弃，不显示提示', async () => {
    const { store } = setup(rejected('IDEMPOTENCY_CONFLICT'));
    store.reportTextOpened(1);
    await settle();
    expect(store.getState().notice).toBeNull();
  });
});

describe('跳过与结束', () => {
  it('跳过成功：更新状态并进入当前题（新增历史记录）', async () => {
    const after = sessionView({ 1: 'skipped' });
    const { store, navigate } = setup(
      ok({ replayed: false, alreadySolved: false, session: after }, 201),
    );
    store.skip(1);
    await settle();
    expect(store.getState().session).toBe(after);
    expect(navigate).toHaveBeenCalledWith('/practice/2', { replace: false });
  });

  it('结束成功：转到总结页', async () => {
    const { store, navigate, calls } = setup(ok(sessionView()));
    store.complete(true);
    await settle();
    expect(calls[0]!.body).toEqual({ endedEarly: true });
    expect(navigate).toHaveBeenCalledWith('/summary');
  });
});

describe('作答响应的显示规则', () => {
  it('alreadySolved：显示"已经做对了"', () => {
    const body = {
      replayed: false,
      alreadySolved: true,
      result: null,
      session: sessionView({ 1: 'solved' }),
    };
    expect(attemptFeedback(1, body)).toEqual({ kind: 'already-solved', questionId: 1 });
  });

  it('重放结果与当前状态矛盾（答错但该题已答对）：不显示', () => {
    const body = attemptResponse({ questionId: 1, correct: false }, sessionView({ 1: 'solved' }), {
      replayed: true,
    });
    expect(attemptFeedback(1, body)).toBeNull();
  });

  it('正常重放：显示结果', () => {
    const body = attemptResponse({ questionId: 1, correct: false }, sessionView({ 1: 'wrong' }), {
      replayed: true,
    });
    expect(attemptFeedback(1, body)).toMatchObject({ kind: 'result', result: { correct: false } });
  });
});

describe('学习事件的等待预算', () => {
  it('默认：单次超时 3 秒，重试 2 次，间隔 0.5 秒和 1 秒', async () => {
    const calls: unknown[] = [];
    const delays: number[] = [];
    const store = new PracticeStore({
      request: (async (...args: unknown[]) => {
        calls.push(args[3]);
        return uncertain;
      }) as never,
      navigate: vi.fn(),
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.useSession(SESSION_ID, sessionView({ 1: 'wrong' }));
    store.reportTextOpened(1);
    await settle();
    expect(calls).toEqual([{ timeoutMs: 3000 }, { timeoutMs: 3000 }, { timeoutMs: 3000 }]);
    expect(delays).toEqual([500, 1000]);
  });
});
