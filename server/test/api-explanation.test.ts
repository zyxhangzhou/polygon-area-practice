import { randomUUID } from 'node:crypto';
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

const eventCount = async () =>
  Number(
    (
      await app.pool.query('select count(*) n from learning_events where session_id = $1', [
        c.sessionId,
      ])
    ).rows[0].n,
  );

const summaryOf = async (qid: number) =>
  (await c.summary()).body.questions.find((q: { questionId: number }) => q.questionId === qid);

describe('GET explanation', () => {
  it('未作答：403 EXPLANATION_LOCKED', async () => {
    const res = await c.explanation(1);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EXPLANATION_LOCKED');
  });

  it('答错、跳过后都可获取：分步讲解、易错提醒、视频地址', async () => {
    await c.wrong(2);
    await c.skip(3);
    for (const qid of [2, 3]) {
      const res = await c.explanation(qid);
      expect(res.status).toBe(200);
      expect(res.body.questionId).toBe(qid);
      expect(res.body.steps.length).toBeGreaterThanOrEqual(3);
      expect(res.body.tip).toBeTruthy();
      expect(res.body.videoUrl).toBeNull();
    }
  });

  it('答对后可获取', async () => {
    await c.solve(1);
    expect((await c.explanation(1)).status).toBe(200);
  });

  it('会话结束后可回看未作答的题；第 4 题有视频地址', async () => {
    await c.complete(true);
    const res = await c.explanation(4);
    expect(res.status).toBe(200);
    expect(res.body.videoUrl).toBe('/videos/q04.mp4');
    // 解析文字带重点标记，由前端显示（explanation-highlights）
    expect(res.body.steps[0]).toContain('{c:底是 10 cm}');
  });

  it('每关第 1 题有视频地址：第 1 题答错后返回 q01', async () => {
    await c.wrong(1);
    const res = await c.explanation(1);
    expect(res.status).toBe(200);
    expect(res.body.videoUrl).toBe('/videos/q01.mp4');
  });

  it('获取解析不产生记录，也不算看过', async () => {
    await c.wrong(1);
    await c.explanation(1);
    expect(await eventCount()).toBe(0);
    await c.solve(1);
    const q = await summaryOf(1);
    expect(q.outcome).toBe('corrected');
    expect(q.facts.textOpened).toBe(false);
  });

  it('快照外的题：404；会话不存在：404', async () => {
    expect((await c.explanation(99)).body.error.code).toBe('QUESTION_NOT_IN_SESSION');
    c.sessionId = 'nope';
    expect((await c.explanation(1)).body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('POST events', () => {
  it('答错后上报打开图文解析，再答对：订正后做对，行为事实在答对之前', async () => {
    await c.wrong(1);
    const res = await c.event(1, 'explanation_text_opened');
    expect(res.status).toBe(201);
    await c.solve(1);
    const q = await summaryOf(1);
    expect(q.outcome).toBe('corrected');
    expect(q.facts).toMatchObject({ textOpened: true, textOpenedBeforeSolved: true });
  });

  it('跳过后看解析，回来第一次就答对：订正后做对', async () => {
    await c.skip(1);
    await c.event(1, 'explanation_text_opened');
    const res = await c.right(1);
    expect(res.body.result).toMatchObject({ attemptNo: 1, outcome: 'corrected' });
  });

  it('同一 clientEventId 上报两次：只一条，第二次 200', async () => {
    await c.wrong(1);
    const key = randomUUID();
    expect((await c.event(1, 'video_started', key)).status).toBe(201);
    const again = await c.event(1, 'video_started', key);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(await eventCount()).toBe(1);
  });

  it('同一 clientEventId 换了类型：409 IDEMPOTENCY_CONFLICT', async () => {
    await c.wrong(1);
    const key = randomUUID();
    await c.event(1, 'video_started', key);
    const res = await c.event(1, 'video_completed', key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('未知类型：400 VALIDATION_ERROR', async () => {
    await c.wrong(1);
    const res = await c.event(1, 'video_paused' as never);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('解析不可获取时上报：403，不写入', async () => {
    const res = await c.event(1, 'explanation_text_opened');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EXPLANATION_LOCKED');
    expect(await eventCount()).toBe(0);
  });

  it('payload：1 KB 以内接受，超过 400', async () => {
    await c.wrong(1);
    const ok = await c.event(1, 'video_completed', randomUUID(), { position: 42.5 });
    expect(ok.status).toBe(201);
    const big = await c.event(1, 'video_completed', randomUUID(), { s: 'x'.repeat(1100) });
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('VALIDATION_ERROR');
    const notObject = await c.request('POST', `${c.base}/events`, {
      questionId: 1,
      type: 'video_started',
      clientEventId: randomUUID(),
      payload: [1, 2],
    });
    expect(notObject.status).toBe(400);
  });

  it('payload 含 NUL 字符：400，不是 500', async () => {
    await c.wrong(1);
    for (const payload of [{ s: 'a\u0000' }, { ['k\u0000']: 1 }]) {
      const res = await c.event(1, 'video_started', randomUUID(), payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await eventCount()).toBe(0);
  });

  it('请求体超过 16 KB：413', async () => {
    await c.wrong(1);
    const res = await c.event(1, 'video_completed', randomUUID(), { s: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
  });
});
