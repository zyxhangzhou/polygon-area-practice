import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, resetPracticeData } from './helpers.js';
import { PracticeClient } from './practice-client.js';

/** 大纲 §6 的 9 个接口集成测试场景，按大纲编号；细节见 api-*.test.ts */

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

const attemptRows = async () =>
  (
    await app.pool.query(
      'select question_id, attempt_no from attempts where session_id = $1 order by seq',
      [c.sessionId],
    )
  ).rows;

describe('大纲 §6 场景', () => {
  it('1. 正常流程：开始 → 逐题作答 → 完成 → 总结数字与预期一致', async () => {
    // 第 1 关：全部一次做对，点亮
    await c.solve(1, 2, 3);
    // 第 2 关：第 4 题先错（常见错误）再看视频后答对；第 5、6 题一次做对
    await c.answer(4, '60');
    await c.event(4, 'video_started');
    await c.event(4, 'video_completed');
    await c.solve(4, 5, 6);
    // 第 3 关：第 7 题答错未改对后跳过；第 8、9 题一次做对
    await c.wrong(7);
    await c.skip(7);
    await c.solve(8, 9);
    // 第 4 关：第 10 题跳过；第 11、12 题一次做对
    await c.skip(10);
    await c.solve(11, 12);

    const state = (await c.state()).body;
    expect(state.canFinish).toBe(true);
    expect(state.currentQuestionId).toBe(7);
    expect(state.stages.map((s: { lit: boolean }) => s.lit)).toEqual([true, true, false, false]);

    const done = await c.complete(false);
    expect(done.status).toBe(200);
    expect(done.body.session).toMatchObject({ status: 'completed', endedEarly: false });

    const summary = (await c.summary()).body;
    expect(summary.counts).toEqual({ total: 12, firstTry: 9, corrected: 1, notYet: 2 });
    expect(summary.rates).toEqual({ firstTry: 75, completion: 83 });
    expect(summary.skippedCount).toBe(2);
    const byId = (id: number) =>
      summary.questions.find((q: { questionId: number }) => q.questionId === id);
    expect(byId(4)).toMatchObject({ outcome: 'corrected', reviewReason: null });
    expect(byId(4).facts).toMatchObject({
      wrongCount: 1,
      commonMistakes: ['60'],
      videoCompletedBeforeSolved: true,
    });
    expect(byId(7)).toMatchObject({ outcome: 'not_yet', reviewReason: 'skipped' });
    expect(byId(10)).toMatchObject({ outcome: 'not_yet', reviewReason: 'skipped' });
  });

  it('2. 重复提交同一 clientAttemptId 只记一次，统计不变', async () => {
    const key = randomUUID();
    const first = await c.answer(1, '40', key);
    const again = await c.answer(1, '40', key);
    expect(again.body.replayed).toBe(true);
    expect(again.body.session.counts).toEqual(first.body.session.counts);
    expect(await attemptRows()).toHaveLength(1);
  });

  it('3. 先答错再订正：订正后做对，首次正确率不受影响', async () => {
    await c.solve(1);
    await c.wrong(2);
    const res = await c.right(2);
    expect(res.body.result.outcome).toBe('corrected');
    expect(res.body.session.counts).toMatchObject({ firstTry: 1, corrected: 1 });
    expect(res.body.session.rates.firstTry).toBe(8);
  });

  it('4. 非法输入不计尝试次数', async () => {
    expect((await c.answer(1, '-5')).status).toBe(400);
    expect((await c.answer(1, '12.345')).status).toBe(400);
    const res = await c.right(1);
    expect(res.body.result).toMatchObject({ attemptNo: 1, outcome: 'first_try' });
  });

  it('5. 未作答时请求解析被拒绝；答错或跳过后可获取', async () => {
    expect((await c.explanation(1)).status).toBe(403);
    await c.wrong(1);
    await c.skip(2);
    expect((await c.explanation(1)).status).toBe(200);
    expect((await c.explanation(2)).status).toBe(200);
  });

  it('6. 已答对的题再次提交不改变记录', async () => {
    await c.solve(1);
    const res = await c.wrong(1);
    expect(res.body.alreadySolved).toBe(true);
    expect(await attemptRows()).toEqual([{ question_id: 1, attempt_no: 1 }]);
  });

  it('7. 并发提交时尝试序号不重复', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => c.answer(1, String(200 + i))));
    expect((await attemptRows()).map((r) => r.attempt_no)).toEqual([1, 2, 3, 4, 5]);
  });

  it('8. 跳过后进入下一关；会话结束后提交返回 409；总题数包含未作答的题', async () => {
    await c.skip(1);
    await c.skip(2);
    const skipped = await c.skip(3);
    expect(skipped.body.session.stages[1].unlocked).toBe(true);
    expect(skipped.body.session.currentQuestionId).toBe(4);
    expect((await c.right(4)).status).toBe(201);

    await c.complete(true);
    expect((await c.right(5)).status).toBe(409);
    expect((await c.summary()).body.counts.total).toBe(12);
  });

  it('9. 先打开解析再答对：订正后做对', async () => {
    await c.wrong(1);
    await c.event(1, 'explanation_text_opened');
    const res = await c.right(1);
    expect(res.body.result.outcome).toBe('corrected');
  });
});
