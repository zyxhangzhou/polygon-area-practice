import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, resetPracticeData } from './helpers.js';
import { ANSWERS, PracticeClient } from './practice-client.js';

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

const rows = async (table: string) =>
  (await app.pool.query(`select * from ${table} where session_id = $1 order by seq`, [c.sessionId]))
    .rows;

describe('提交作答', () => {
  it('第一次答对：201，第 1 次，一次做对，题目 solved', async () => {
    const res = await c.right(1);
    expect(res.status).toBe(201);
    expect(res.body.replayed).toBe(false);
    expect(res.body.alreadySolved).toBe(false);
    expect(res.body.result).toEqual({
      questionId: 1,
      correct: true,
      attemptNo: 1,
      normalizedValue: '40',
      outcome: 'first_try',
      mistakeHint: null,
      stageLit: false,
    });
    expect(res.body.session.questions[0].status).toBe('solved');
    expect(res.body.session.currentQuestionId).toBe(2);
  });

  it('规范值：全角数字与前导零按规范值保存与返回', async () => {
    const res = await c.answer(1, '０４０．００');
    expect(res.body.result).toMatchObject({ correct: true, normalizedValue: '40' });
    const [row] = await rows('attempts');
    expect(row.raw_input).toBe('０４０．００');
  });

  it('常见错误：第 4 题提交 60，带"忘了除以 2"的提示', async () => {
    await c.solve(1, 2, 3);
    const res = await c.answer(4, '60');
    expect(res.status).toBe(201);
    expect(res.body.result.correct).toBe(false);
    expect(res.body.result.outcome).toBe('not_yet');
    expect(res.body.result.mistakeHint).toContain('÷ 2');
    expect(res.body.session.questions[3].status).toBe('wrong');
    const [, , , row] = await rows('attempts');
    expect(row.matched_mistake).toBe('60');
  });

  it('先错后对：第 2 次，订正后做对，不计入首次正确率', async () => {
    await c.wrong(1);
    const res = await c.right(1);
    expect(res.body.result).toMatchObject({ correct: true, attemptNo: 2, outcome: 'corrected' });
    expect(res.body.session.counts).toMatchObject({ firstTry: 0, corrected: 1 });
  });

  it('点亮关卡：第 1 关第 3 道题答对时 stageLit 为 true', async () => {
    await c.solve(1, 2);
    const res = await c.right(3);
    expect(res.body.result.stageLit).toBe(true);
    expect(res.body.session.stages[0].lit).toBe(true);
    expect(res.body.session.stages[1].unlocked).toBe(true);
  });

  it('不合法输入：400 INVALID_ANSWER 带原因，不写入、不占序号', async () => {
    const bad = await c.answer(1, 'abc');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'INVALID_ANSWER', reason: 'invalid_format' });
    expect(bad.body.error.message).toBeTruthy();
    expect(await rows('attempts')).toHaveLength(0);

    const next = await c.wrong(1);
    expect(next.body.result.attemptNo).toBe(1);
  });

  it('带单位：400 INVALID_ANSWER，原因 has_unit', async () => {
    const res = await c.answer(1, '40平方厘米');
    expect(res.status).toBe(400);
    expect(res.body.error.reason).toBe('has_unit');
  });

  it('请求体不对：400 VALIDATION_ERROR', async () => {
    for (const payload of [
      { questionId: 1, answer: '40' },
      { questionId: 1, clientAttemptId: 'x', answer: '40' },
      { questionId: '1', clientAttemptId: randomUUID(), answer: '40' },
      { questionId: 1, clientAttemptId: randomUUID(), answer: 'x'.repeat(201) },
    ]) {
      const res = await c.request('POST', `${c.base}/attempts`, payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('已答对再提交：200 alreadySolved，不写入，统计不变', async () => {
    await c.solve(1);
    const res = await c.wrong(1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ alreadySolved: true, replayed: false, result: null });
    expect(res.body.session.counts.firstTry).toBe(1);
    expect(await rows('attempts')).toHaveLength(1);
  });

  it('会话已结束：409 SESSION_COMPLETED，不写入', async () => {
    await c.complete(true);
    const res = await c.right(1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_COMPLETED');
    expect(await rows('attempts')).toHaveLength(0);
  });

  it('关卡未解锁：409 STAGE_LOCKED，不写入', async () => {
    const res = await c.right(4);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STAGE_LOCKED');
    expect(await rows('attempts')).toHaveLength(0);
  });

  it('快照外的题：404 QUESTION_NOT_IN_SESSION', async () => {
    const res = await c.answer(99, '1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('QUESTION_NOT_IN_SESSION');
  });

  it('会话不存在：404 SESSION_NOT_FOUND', async () => {
    c.sessionId = '00000000-0000-4000-8000-000000000000';
    const res = await c.right(1);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('幂等与并发', () => {
  it('同键重复提交：只一条记录，200 replayed，结果相同，统计不变', async () => {
    const key = randomUUID();
    const first = await c.answer(1, '40', key);
    const again = await c.answer(1, '40', key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.result).toEqual(first.body.result);
    expect(again.body.session.counts).toEqual(first.body.session.counts);
    expect(await rows('attempts')).toHaveLength(1);
  });

  it('同键不同内容：409 IDEMPOTENCY_CONFLICT，不写入', async () => {
    const key = randomUUID();
    await c.answer(1, '20', key);
    for (const [qid, value] of [
      [1, '40'],
      [2, '20'],
    ] as const) {
      const res = await c.answer(qid, value, key);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    }
    expect(await rows('attempts')).toHaveLength(1);
  });

  it('结束后重放：返回首次结果，不是 409', async () => {
    const key = randomUUID();
    const first = await c.answer(1, '20', key);
    await c.complete(true);
    const again = await c.answer(1, '20', key);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.result).toEqual(first.body.result);
    expect(again.body.session.session.status).toBe('completed');
  });

  it('先错后对之后重放第一次：result 仍为错误、第 1 次，session 中该题 solved', async () => {
    const key = randomUUID();
    const first = await c.answer(1, '20', key);
    await c.right(1);
    const again = await c.answer(1, '20', key);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.result).toEqual(first.body.result);
    expect(again.body.result).toMatchObject({ correct: false, attemptNo: 1, outcome: 'not_yet' });
    expect(again.body.session.questions[0].status).toBe('solved');
    expect(again.body.session.counts).toMatchObject({ corrected: 1 });
    expect(await rows('attempts')).toHaveLength(2);
  });

  it('同题 5 个不同键并发提交错误答案：全部成功，序号恰为 1–5', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => c.answer(1, String(100 + i))),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const saved = await rows('attempts');
    expect(saved.map((r) => r.attempt_no)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((r) => r.body.result.attemptNo).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('同键 5 个并发：只一条记录，5 个结果相同', async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => c.answer(1, '20', key)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    for (const r of results) expect(r.body.result).toEqual(results[0]!.body.result);
    expect(await rows('attempts')).toHaveLength(1);
  });

  it('并发答对同一题（不同键）：只有一条答对记录，其余 alreadySolved', async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => c.answer(1, ANSWERS[1]!)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await rows('attempts')).toHaveLength(1);
  });
});

describe('跳过', () => {
  it('第 1 关答对两题、跳过一题：第 1 关未点亮，第 2 关已解锁', async () => {
    await c.solve(1, 2);
    const res = await c.skip(3);
    expect(res.status).toBe(201);
    expect(res.body.session.questions[2].status).toBe('skipped');
    expect(res.body.session.stages[0].lit).toBe(false);
    expect(res.body.session.stages[1].unlocked).toBe(true);
    expect(res.body.session.skippedCount).toBe(1);
    expect(res.body.session.currentQuestionId).toBe(4);
  });

  it('同一 clientRequestId 跳过两次：只一条，第二次 200 replayed', async () => {
    const key = randomUUID();
    expect((await c.skip(1, key)).status).toBe(201);
    const again = await c.skip(1, key);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(await rows('question_skips')).toHaveLength(1);
  });

  it('同一 clientRequestId 跳过另一题：409 IDEMPOTENCY_CONFLICT', async () => {
    const key = randomUUID();
    await c.skip(1, key);
    const res = await c.skip(2, key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('已答对的题跳过：200 alreadySolved，不写入', async () => {
    await c.solve(1);
    const res = await c.skip(1);
    expect(res.status).toBe(200);
    expect(res.body.alreadySolved).toBe(true);
    expect(await rows('question_skips')).toHaveLength(0);
  });

  it('结束后跳过：409 SESSION_COMPLETED', async () => {
    await c.complete(true);
    const res = await c.skip(1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_COMPLETED');
  });

  it('关卡未解锁：409 STAGE_LOCKED；快照外：404', async () => {
    expect((await c.skip(4)).body.error.code).toBe('STAGE_LOCKED');
    expect((await c.skip(99)).body.error.code).toBe('QUESTION_NOT_IN_SESSION');
  });

  it('跳过后直接答对（没看解析）：归为一次做对', async () => {
    await c.skip(1);
    const res = await c.right(1);
    expect(res.body.result).toMatchObject({ attemptNo: 1, outcome: 'first_try' });
  });
});

describe('等锁超时', () => {
  it('会话行被占住超过 2 秒：500；释放后用同一个键重试，只写入一条', async () => {
    const holder = await app.pool.connect();
    const key = randomUUID();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM practice_sessions WHERE id = $1 FOR UPDATE', [c.sessionId]);
      const timedOut = await c.answer(1, '20', key);
      expect(timedOut.status).toBe(500);
      expect(timedOut.body.error.code).toBe('INTERNAL_ERROR');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    const retry = await c.answer(1, '20', key);
    expect(retry.status).toBe(201);
    expect(retry.body.result.attemptNo).toBe(1);
    expect(await rows('attempts')).toHaveLength(1);
  });
});
