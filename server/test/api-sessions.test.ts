import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, resetPracticeData } from './helpers.js';
import { PracticeClient } from './practice-client.js';

let app: FastifyInstance;
let c: PracticeClient;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetPracticeData(app.pool);
  c = new PracticeClient(app);
});

const countRows = async (sql: string, params: unknown[] = []) =>
  Number((await app.pool.query(sql, params)).rows[0].n);

describe('POST /api/learners', () => {
  it('创建匿名学生：201 + learnerId', async () => {
    const res = await c.request('POST', '/api/learners');
    expect(res.status).toBe(201);
    expect(res.body.learnerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('可以带昵称；昵称过长 400', async () => {
    expect((await c.request('POST', '/api/learners', { nickname: '小明' })).status).toBe(201);
    const res = await c.request('POST', '/api/learners', { nickname: 'x'.repeat(21) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/sessions', () => {
  it('新学生开始练习：201，快照 12 题，第 1 题是第 1 关第 1 题', async () => {
    const res = await c.start();
    expect(res.status).toBe(201);
    const view = res.body;
    expect(view.session.status).toBe('in_progress');
    expect(view.session.endedEarly).toBeNull();
    expect(view.questions).toHaveLength(12);
    expect(view.questions[0]).toEqual({
      questionId: 1,
      stageId: 1,
      position: 1,
      status: 'unanswered',
    });
    expect(view.questions.map((q: { position: number }) => q.position)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(view.stages.map((s: { stageId: number }) => s.stageId)).toEqual([1, 2, 3, 4]);
    expect(view.stages[0]).toMatchObject({
      name: '平行四边形',
      buildingName: '面包店',
      lit: false,
      unlocked: true,
      solvedCount: 0,
      total: 3,
    });
    expect(view.stages[1].unlocked).toBe(false);
    expect(view.currentQuestionId).toBe(1);
    expect(view.canFinish).toBe(false);
    expect(view.counts).toEqual({ total: 12, firstTry: 0, corrected: 0, notYet: 12 });
    expect(view.rates).toEqual({ firstTry: 0, completion: 0 });
  });

  it('继续练习：200 + 同一个会话，进度不变', async () => {
    await c.start();
    await c.solve(1);
    const res = await c.startSession();
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(c.sessionId);
    expect(res.body.questions[0].status).toBe('solved');
  });

  it('再练一次：上一个会话结束后返回 201 新会话，旧会话和记录保留', async () => {
    await c.start();
    await c.solve(1);
    const old = c.sessionId;
    expect((await c.complete(true)).status).toBe(200);

    const res = await c.startSession();
    expect(res.status).toBe(201);
    expect(res.body.session.id).not.toBe(old);
    expect(res.body.questions[0].status).toBe('unanswered');
    expect(await countRows('select count(*) n from practice_sessions')).toBe(2);
    expect(await countRows('select count(*) n from attempts where session_id = $1', [old])).toBe(1);
  });

  it('5 个并发开始：返回同一个会话，库中只有一个', async () => {
    const learner = await c.request('POST', '/api/learners');
    c.learnerId = learner.body.learnerId;
    const results = await Promise.all(Array.from({ length: 5 }, () => c.startSession()));
    const ids = new Set(results.map((r) => r.body.session.id));
    expect(ids.size).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(await countRows('select count(*) n from practice_sessions')).toBe(1);
    expect(await countRows('select count(*) n from session_questions')).toBe(12);
  });

  it('学生不存在：404 LEARNER_NOT_FOUND', async () => {
    const res = await c.request('POST', '/api/sessions', {
      learnerId: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LEARNER_NOT_FOUND');
  });

  it('缺少 learnerId 或格式不对：400 VALIDATION_ERROR', async () => {
    for (const payload of [{}, { learnerId: 'abc' }]) {
      const res = await c.request('POST', '/api/sessions', payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /api/sessions/:id', () => {
  it('刷新后恢复：答对第 1 题、答错第 2 题', async () => {
    await c.start();
    await c.solve(1);
    await c.wrong(2);
    const res = await c.state();
    expect(res.status).toBe(200);
    expect(res.body.questions[0].status).toBe('solved');
    expect(res.body.questions[1].status).toBe('wrong');
    expect(res.body.currentQuestionId).toBe(2);
  });

  it('ID 不是 UUID 或不存在：404 SESSION_NOT_FOUND', async () => {
    for (const id of ['not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
      const res = await c.request('GET', `/api/sessions/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    }
  });
});

describe('GET /api/sessions/:id/questions/:qid', () => {
  it('返回题干、图形、单位、状态，不含答案、常见错误和解析', async () => {
    await c.start();
    const res = await c.question(4);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      questionId: 4,
      stageId: 2,
      position: 4,
      unit: 'cm²',
      hasVideo: true,
      status: 'unanswered',
    });
    expect(res.body.prompt).toBeTruthy();
    expect(res.body.figure.shape).toBeTruthy();
    const text = JSON.stringify(res.body);
    for (const key of ['answer', 'commonMistakes', 'explanation', 'steps', 'tip', 'videoUrl'])
      expect(res.body).not.toHaveProperty(key);
    expect(text).not.toContain('"30"');
    expect(text).not.toContain('60');
  });

  it('快照外的题或题号格式不对：404 QUESTION_NOT_IN_SESSION', async () => {
    await c.start();
    for (const qid of ['99', 'abc', '99999999999']) {
      const res = await c.question(qid);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_IN_SESSION');
    }
  });
});
