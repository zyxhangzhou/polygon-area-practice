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
  await c.start();
});

const ALL = Array.from({ length: 12 }, (_, i) => i + 1);

const sessionRow = async () =>
  (await app.pool.query('select * from practice_sessions where id = $1', [c.sessionId])).rows[0];

describe('POST complete', () => {
  it('做完后结束：endedEarly 为 false，记录结束时间和结束序号', async () => {
    await c.solve(...ALL.slice(0, 11));
    await c.skip(12);
    const res = await c.complete(false);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('completed');
    expect(res.body.session.endedEarly).toBe(false);
    expect(res.body.session.completedAt).toBeTruthy();
    const row = await sessionRow();
    expect(row.completed_seq).not.toBeNull();
  });

  it('做完后即使传 endedEarly: true，库中仍记为 false', async () => {
    await c.solve(...ALL);
    const res = await c.complete(true);
    expect(res.body.session.endedEarly).toBe(false);
  });

  it('没做完且未确认：409 NOT_FINISHED，会话仍在进行中', async () => {
    await c.solve(1);
    const res = await c.complete(false);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_FINISHED');
    expect((await sessionRow()).status).toBe('in_progress');
  });

  it('提前结束：endedEarly 为 true', async () => {
    await c.solve(1);
    const res = await c.complete(true);
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ status: 'completed', endedEarly: true });
  });

  it('重复结束：200，结束时间与结束序号不变', async () => {
    await c.complete(true);
    const first = await sessionRow();
    const again = await c.complete(false);
    expect(again.status).toBe(200);
    expect(again.body.session.status).toBe('completed');
    const second = await sessionRow();
    expect(second.completed_at).toEqual(first.completed_at);
    expect(second.completed_seq).toBe(first.completed_seq);
  });

  it('缺少 endedEarly：400；会话不存在：404', async () => {
    const res = await c.request('POST', `${c.base}/complete`, {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    c.sessionId = '00000000-0000-4000-8000-000000000000';
    expect((await c.complete(true)).status).toBe(404);
  });
});

describe('GET summary', () => {
  it('总结与会话状态的数字一致（进行中）', async () => {
    await c.solve(1);
    await c.wrong(2);
    await c.right(2);
    await c.skip(3);
    const [state, summary] = await Promise.all([c.state(), c.summary()]);
    expect(summary.status).toBe(200);
    expect(summary.body.counts).toEqual(state.body.counts);
    expect(summary.body.rates).toEqual(state.body.rates);
    expect(summary.body.counts).toEqual({ total: 12, firstTry: 1, corrected: 1, notYet: 10 });
    expect(summary.body.rates).toEqual({ firstTry: 8, completion: 17 });
  });

  it('每题附分类、原因、行为事实、题干和知识点', async () => {
    await c.wrong(1);
    const q = (await c.summary()).body.questions[0];
    expect(q).toMatchObject({ questionId: 1, status: 'wrong', outcome: 'not_yet' });
    expect(q.reviewReason).toBe('wrong');
    expect(q.facts.attemptCount).toBe(1);
    expect(q.prompt).toContain('平行四边形');
    expect(q.knowledgePoint).toBeTruthy();
    expect(q).not.toHaveProperty('answer');
  });

  it('只做 2 题就提前结束：总题数 12，未作答的 10 题原因为 unanswered', async () => {
    await c.solve(1, 2);
    await c.complete(true);
    const res = await c.summary();
    expect(res.body.session.status).toBe('completed');
    expect(res.body.counts).toEqual({ total: 12, firstTry: 2, corrected: 0, notYet: 10 });
    const reasons = res.body.questions
      .slice(2)
      .map((q: { reviewReason: string }) => q.reviewReason);
    expect(reasons).toEqual(Array(10).fill('unanswered'));
  });

  it('结束后上报的学习事件写入，但 seq 大于结束序号，不计入总结', async () => {
    await c.wrong(1);
    await c.complete(true);
    const before = (await c.summary()).body.questions[0].facts;
    const res = await c.event(1, 'explanation_text_opened');
    expect(res.status).toBe(201);

    const { rows } = await app.pool.query(
      'select e.seq, s.completed_seq from learning_events e join practice_sessions s on s.id = e.session_id where s.id = $1',
      [c.sessionId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].seq)).toBeGreaterThan(Number(rows[0].completed_seq));
    expect((await c.summary()).body.questions[0].facts).toEqual(before);
  });
});
