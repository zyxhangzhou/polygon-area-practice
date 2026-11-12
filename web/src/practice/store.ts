import { request as defaultRequest, type ApiResult } from '../api/api';
import type {
  AttemptResponse,
  AttemptResult,
  CompleteResponse,
  Explanation,
  LearningEventType,
  QuestionDetail,
  SessionView,
  SkipResponse,
} from '../api/types';
import { navigate as defaultNavigate } from '../router';
import { storage } from '../storage';

/** 学生的写操作；幂等键在入队时生成，重试时沿用（design D4） */
export type WriteJob =
  | { type: 'attempt'; questionId: number; answer: string; key: string }
  | { type: 'skip'; questionId: number; key: string }
  | { type: 'event'; questionId: number; eventType: LearningEventType; key: string }
  | { type: 'complete'; endedEarly: boolean };

export type Feedback =
  | { kind: 'result'; questionId: number; result: AttemptResult }
  | { kind: 'already-solved'; questionId: number };

export interface PracticeState {
  sessionId: string | null;
  session: SessionView | null;
  /** 读取会话状态失败（结果不确定），页面显示"连不上"并可重试 */
  loadFailed: boolean;
  /** 队列中有作答、跳过或结束未完成；提交、跳过、结束按钮禁用 */
  busy: boolean;
  /** 作答、跳过或结束正排在一条未确认的学习事件后面；页面提示"正在保存解析记录" */
  waitingForEvent: boolean;
  /** 结果不确定、等待学生"再提交一次"的写操作 */
  pendingRetry: WriteJob | null;
  feedback: Feedback | null;
  /** 后端拒绝的不合法输入提示 */
  invalid: { questionId: number; message: string } | null;
  /** 其他需要告诉学生的提示 */
  notice: string | null;
}

export interface StoreDeps {
  request?: typeof defaultRequest;
  navigate?: typeof defaultNavigate;
  newKey?: () => string;
  /** 学习事件结果不确定时的重试间隔（毫秒）；长度即重试次数 */
  eventRetryDelays?: number[];
  /** 学习事件单次请求的超时（毫秒） */
  eventTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const INITIAL: PracticeState = {
  sessionId: null,
  session: null,
  loadFailed: false,
  busy: false,
  waitingForEvent: false,
  pendingRetry: null,
  feedback: null,
  invalid: null,
  notice: null,
};

export const RATE_LIMITED = 'RATE_LIMITED';

export const UNCERTAIN_MESSAGE = '暂时没法确认有没有提交成功，请再点一次（不会重复记录）';

/**
 * 练习状态：只保存后端最近一次返回的会话状态，不在前端推算进度（design D5）。
 * 写操作排队依次发送，前一个确认后再发下一个（design D4）。
 */
export class PracticeStore {
  private state: PracticeState = INITIAL;
  private listeners = new Set<() => void>();
  private queue: WriteJob[] = [];
  private running = false;
  /** 已上报的学习事件（题号 + 类型），同一题的每种事件在本页面只上报一次 */
  private reportedEvents = new Set<string>();
  private questions = new Map<number, QuestionDetail>();
  private explanations = new Map<number, Explanation>();
  private readonly request: typeof defaultRequest;
  private readonly navigate: typeof defaultNavigate;
  private readonly newKey: () => string;
  private readonly eventRetryDelays: number[];
  private readonly eventTimeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: StoreDeps = {}) {
    this.request = deps.request ?? defaultRequest;
    this.navigate = deps.navigate ?? defaultNavigate;
    this.newKey = deps.newKey ?? (() => crypto.randomUUID());
    // 学习事件不是核心记录：超时短、重试少，最坏约 10.5 秒后放弃（design D4）
    this.eventRetryDelays = deps.eventRetryDelays ?? [500, 1000];
    this.eventTimeoutMs = deps.eventTimeoutMs ?? 3000;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // ---------- 订阅 ----------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private set(patch: Partial<PracticeState>) {
    // 学习事件在后台排队，不锁按钮；学生可以照常提交，作答会排在事件后面发送
    const busy = this.queue.some((job) => job.type !== 'event');
    const waitingForEvent = this.queue[0]?.type === 'event' && busy;
    this.state = { ...this.state, ...patch, busy, waitingForEvent };
    this.listeners.forEach((l) => l());
  }

  // ---------- 读取 ----------

  /** 换了会话（首页新建、刷新后从存储读取）时调用 */
  useSession(sessionId: string, session: SessionView | null = null) {
    if (this.state.sessionId !== sessionId) {
      this.queue = [];
      this.reportedEvents.clear();
      this.questions.clear();
      this.explanations.clear();
      this.state = { ...INITIAL, sessionId };
    }
    if (session) this.set({ session, loadFailed: false });
  }

  private get base() {
    return `/api/sessions/${this.state.sessionId}`;
  }

  /** 重新获取会话状态；成功返回最新的会话状态 */
  async refresh(): Promise<SessionView | null> {
    if (!this.state.sessionId) return null;
    const res = await this.request<SessionView>('GET', this.base);
    if (res.kind === 'ok') {
      this.set({ session: res.data, loadFailed: false });
      return res.data;
    }
    if (res.kind === 'rejected') await this.handleRejected(res.code, res.message);
    else this.set({ loadFailed: true });
    return null;
  }

  /** 题目详情（不含答案）；题干不会变，按题号缓存。失败时返回 null（被拒绝时已按错误码处理） */
  async fetchQuestion(questionId: number): Promise<QuestionDetail | null> {
    const cached = this.questions.get(questionId);
    if (cached) return cached;
    const res = await this.request<QuestionDetail>('GET', `${this.base}/questions/${questionId}`);
    if (res.kind === 'ok') {
      this.questions.set(questionId, res.data);
      return res.data;
    }
    // 结果不确定时由页面显示"重新读取"
    if (res.kind === 'rejected') await this.handleRejected(res.code, res.message);
    return null;
  }

  /** 图文解析；获取不算看过，显示出来后由页面调用 reportTextOpened */
  async fetchExplanation(questionId: number): Promise<Explanation | null> {
    const cached = this.explanations.get(questionId);
    if (cached) return cached;
    const res = await this.request<Explanation>(
      'GET',
      `${this.base}/questions/${questionId}/explanation`,
    );
    if (res.kind === 'ok') {
      this.explanations.set(questionId, res.data);
      return res.data;
    }
    // 结果不确定时由页面显示"重新读取"
    if (res.kind === 'rejected') await this.handleRejected(res.code, res.message);
    return null;
  }

  // ---------- 写操作 ----------

  submitAnswer(questionId: number, answer: string) {
    this.set({ feedback: null, invalid: null, notice: null });
    this.enqueue({ type: 'attempt', questionId, answer, key: this.newKey() });
  }

  skip(questionId: number) {
    this.set({ feedback: null, invalid: null, notice: null });
    this.enqueue({ type: 'skip', questionId, key: this.newKey() });
  }

  /** 图文解析真正显示出来时调用；同一题在本页面只上报一次 */
  reportTextOpened(questionId: number) {
    this.reportEvent(questionId, 'explanation_text_opened');
  }

  /** 视频真正开始播放时调用（video-explanations） */
  reportVideoStarted(questionId: number) {
    this.reportEvent(questionId, 'video_started');
  }

  /** 视频播放到结尾时调用 */
  reportVideoCompleted(questionId: number) {
    this.reportEvent(questionId, 'video_completed');
  }

  private reportEvent(questionId: number, eventType: LearningEventType) {
    const key = `${questionId}:${eventType}`;
    if (this.reportedEvents.has(key)) return;
    this.reportedEvents.add(key);
    this.enqueue({ type: 'event', questionId, eventType, key: this.newKey() });
  }

  complete(endedEarly: boolean) {
    this.set({ notice: null });
    this.enqueue({ type: 'complete', endedEarly });
  }

  /** "再提交一次"：沿用同一个幂等键和完全相同的内容 */
  retry() {
    if (!this.state.pendingRetry) return;
    this.set({ pendingRetry: null, notice: null });
    void this.run();
  }

  /** 清掉反馈与提示；等待重试时保留"结果不确定"的提示 */
  clearFeedback() {
    this.set({
      feedback: null,
      invalid: null,
      notice: this.state.pendingRetry ? this.state.notice : null,
    });
  }

  private enqueue(job: WriteJob) {
    if (!this.state.sessionId) return;
    this.queue.push(job);
    this.set({});
    void this.run();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.state.pendingRetry) {
        const job = this.queue[0]!;
        const res = await this.send(job);
        // 等待响应期间换了会话（队列被替换）：这个结果已与当前会话无关
        if (this.queue[0] !== job) continue;
        if (res.kind === 'uncertain') {
          if (job.type === 'event') {
            // 重试后仍不确定：放弃这条事件，继续后面的请求
            console.warn('学习事件上报失败，已放弃', job);
            this.queue.shift();
            continue;
          }
          this.set({ pendingRetry: job, notice: UNCERTAIN_MESSAGE });
          break;
        }
        // 被限流：请求一定没有被处理。写请求留在队首，等学生"再提交一次"（同一个键）
        if (res.kind === 'rejected' && res.code === RATE_LIMITED && job.type !== 'event') {
          this.set({ pendingRetry: job, notice: res.message });
          break;
        }
        this.queue.shift();
        if (res.kind === 'ok') this.handleOk(job, res.data);
        else await this.handleRejected(res.code, res.message, job);
      }
    } finally {
      this.running = false;
      this.set({});
    }
  }

  private async send(job: WriteJob): Promise<ApiResult<unknown>> {
    switch (job.type) {
      case 'attempt':
        return this.request('POST', `${this.base}/attempts`, {
          questionId: job.questionId,
          clientAttemptId: job.key,
          answer: job.answer,
        });
      case 'skip':
        return this.request('POST', `${this.base}/questions/${job.questionId}/skip`, {
          clientRequestId: job.key,
        });
      case 'complete':
        return this.request('POST', `${this.base}/complete`, { endedEarly: job.endedEarly });
      case 'event': {
        const body = { questionId: job.questionId, type: job.eventType, clientEventId: job.key };
        const opts = { timeoutMs: this.eventTimeoutMs };
        let res = await this.request('POST', `${this.base}/events`, body, opts);
        for (const delay of this.eventRetryDelays) {
          if (res.kind !== 'uncertain') break;
          await this.sleep(delay);
          res = await this.request('POST', `${this.base}/events`, body, opts);
        }
        return res;
      }
    }
  }

  private handleOk(job: WriteJob, data: unknown) {
    switch (job.type) {
      case 'attempt': {
        const body = data as AttemptResponse;
        this.set({ session: body.session, feedback: attemptFeedback(job.questionId, body) });
        return;
      }
      case 'skip': {
        const body = data as SkipResponse;
        if (body.alreadySolved) {
          this.set({
            session: body.session,
            feedback: { kind: 'already-solved', questionId: job.questionId },
          });
          return;
        }
        this.set({ session: body.session });
        this.goToCurrent(body.session, false);
        return;
      }
      case 'complete':
        this.set({ session: data as CompleteResponse });
        this.navigate('/summary');
        return;
      case 'event':
        return;
    }
  }

  /** 按错误码处理（design D5） */
  private async handleRejected(code: string, message: string, job?: WriteJob) {
    switch (code) {
      case 'SESSION_NOT_FOUND':
        this.queue = [];
        storage.setSessionId(null);
        this.state = { ...INITIAL };
        this.set({});
        this.navigate('/');
        return;
      case 'LEARNER_NOT_FOUND':
        this.queue = [];
        storage.clearAll();
        this.state = { ...INITIAL };
        this.set({});
        this.navigate('/');
        return;
      case 'SESSION_COMPLETED':
        this.queue = [];
        this.set({});
        this.navigate('/summary');
        return;
      case 'STAGE_LOCKED':
      case 'QUESTION_NOT_IN_SESSION': {
        const session = await this.refresh();
        if (session) this.goToCurrent(session);
        return;
      }
      case 'NOT_FINISHED':
      case 'EXPLANATION_LOCKED':
        await this.refresh();
        if (code === 'NOT_FINISHED') this.set({ notice: message });
        return;
      case 'INVALID_ANSWER':
        if (job?.type === 'attempt') {
          this.set({ invalid: { questionId: job.questionId, message } });
          return;
        }
        this.set({ notice: message });
        return;
      default:
        // 学习事件被拒绝时直接放弃，不打扰学生
        if (job?.type !== 'event') this.set({ notice: message });
    }
  }

  /** 转到当前题；replace 为 true 时替换历史记录（纠正地址时用） */
  private goToCurrent(session: SessionView, replace = true) {
    const qid = session.currentQuestionId;
    this.navigate(qid === null ? '/practice' : `/practice/${qid}`, { replace });
  }
}

/**
 * 作答响应的显示规则（design D6）：
 * 已答对 → "已经做对了"；结果是答错但该题现在已答对（重放结果已过时）→ 不显示；其余按结果显示。
 */
export function attemptFeedback(questionId: number, body: AttemptResponse): Feedback | null {
  if (body.alreadySolved || !body.result) return { kind: 'already-solved', questionId };
  const status = body.session.questions.find((q) => q.questionId === questionId)?.status;
  if (!body.result.correct && status === 'solved') return null;
  return { kind: 'result', questionId, result: body.result };
}
