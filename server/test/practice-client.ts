import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { QUESTIONS } from '../src/content/questions.js';
import type { LearningEventType } from '../src/db/schema.js';

/** 各题正确答案，直接取自题库 */
export const ANSWERS: Record<number, string> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q.answer]),
);

// 测试按字段断言 JSON 响应，响应体默认用 any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** 练习接口的简写：自动创建学生与会话，作答、跳过等自动生成幂等键 */
export class PracticeClient {
  learnerId = '';
  sessionId = '';

  constructor(readonly app: FastifyInstance) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
  ): Promise<ApiResponse<T>> {
    const res = await this.app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: res.statusCode, body: res.json() as T };
  }

  /** 新建学生并开始练习 */
  async start() {
    const learner = await this.request('POST', '/api/learners');
    this.learnerId = learner.body.learnerId;
    const res = await this.startSession();
    this.sessionId = res.body.session.id;
    return res;
  }

  startSession() {
    return this.request('POST', '/api/sessions', { learnerId: this.learnerId });
  }

  get base() {
    return `/api/sessions/${this.sessionId}`;
  }

  state() {
    return this.request('GET', this.base);
  }

  question(qid: number | string) {
    return this.request('GET', `${this.base}/questions/${qid}`);
  }

  answer(questionId: number, answer: string, clientAttemptId: string = randomUUID()) {
    return this.request('POST', `${this.base}/attempts`, { questionId, clientAttemptId, answer });
  }

  right(questionId: number) {
    return this.answer(questionId, ANSWERS[questionId]!);
  }

  /** 一个不是正确答案、也不是常见错误的数 */
  wrong(questionId: number) {
    return this.answer(questionId, '9999');
  }

  skip(questionId: number, clientRequestId: string = randomUUID()) {
    return this.request('POST', `${this.base}/questions/${questionId}/skip`, { clientRequestId });
  }

  explanation(questionId: number) {
    return this.request('GET', `${this.base}/questions/${questionId}/explanation`);
  }

  event(
    questionId: number,
    type: LearningEventType,
    clientEventId: string = randomUUID(),
    payload?: Record<string, unknown>,
  ) {
    return this.request('POST', `${this.base}/events`, {
      questionId,
      type,
      clientEventId,
      ...(payload ? { payload } : {}),
    });
  }

  complete(endedEarly = false) {
    return this.request('POST', `${this.base}/complete`, { endedEarly });
  }

  summary() {
    return this.request('GET', `${this.base}/summary`);
  }

  /** 按顺序答对指定的题 */
  async solve(...questionIds: number[]) {
    for (const qid of questionIds) {
      const res = await this.right(qid);
      if (res.status !== 201) throw new Error(`第 ${qid} 题答对失败：${JSON.stringify(res.body)}`);
    }
  }
}
