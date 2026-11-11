import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HISTORY_LIMIT } from '../src/practice/service.js';
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

const history = (learnerId = c.learnerId) =>
  c.request('GET', `/api/learners/${learnerId}/sessions`);

describe('GET /api/learners/:id/sessions', () => {
  it('列出学生的练习，最近的在前，附统计；与总结接口一致', async () => {
    const first = c.sessionId;
    await c.solve(1);
    await c.complete(true);
    const firstSummary = (await c.summary()).body;
    const again = await c.startSession();
    c.sessionId = again.body.session.id;
    await c.wrong(1);

    const res = await history();
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { id: string }) => s.id)).toEqual([c.sessionId, first]);
    const [current, old] = res.body.sessions;
    expect(current).toMatchObject({ status: 'in_progress', endedEarly: null, completedAt: null });
    expect(old).toMatchObject({
      status: 'completed',
      endedEarly: true,
      counts: firstSummary.counts,
      rates: firstSummary.rates,
    });
    expect(old.completedAt).toBeTruthy();
  });

  it('只列出这个学生的练习', async () => {
    const other = new PracticeClient(app);
    await other.start();
    const res = await history();
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].id).toBe(c.sessionId);
  });

  it(`最多返回最近 ${HISTORY_LIMIT} 次`, async () => {
    // 直接写入已结束的会话，避免逐次走完整流程
    await app.pool.query(
      `insert into practice_sessions (learner_id, status, completed_at, completed_seq, ended_early, started_at)
       select $1, 'completed', now(), nextval('practice_record_seq'), true, now() - (g || ' minutes')::interval
       from generate_series(1, $2) g`,
      [c.learnerId, HISTORY_LIMIT + 5],
    );
    const res = await history();
    expect(res.body.sessions).toHaveLength(HISTORY_LIMIT);
    expect(res.body.sessions[0].id).toBe(c.sessionId);
  });

  it('学生不存在或 ID 格式不对：404 LEARNER_NOT_FOUND', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const res = await history(id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LEARNER_NOT_FOUND');
    }
  });
});
