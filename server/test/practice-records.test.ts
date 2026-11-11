import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attempts,
  learners,
  learningEvents,
  practiceSessions,
  sessionQuestions,
} from '../src/db/schema.js';
import { resetPracticeData, TEST_DATABASE_URL } from './helpers.js';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle(pool);

afterAll(() => pool.end());
beforeEach(() => resetPracticeData(pool));

/** 断言写入因指定约束失败（drizzle 把 pg 错误包在 cause 里） */
async function expectViolation(write: Promise<unknown>, constraint: string) {
  const err = await write.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, `应因 ${constraint} 失败`).toBeDefined();
  const pgErr = ((err as { cause?: unknown }).cause ?? err) as { constraint?: string };
  expect(pgErr.constraint).toBe(constraint);
}

async function newLearner() {
  const [l] = await db.insert(learners).values({}).returning();
  return l!;
}

/** 新建一个进行中的会话，快照包含指定题目（默认第 1–3 题） */
async function newSession(questionIds = [1, 2, 3]) {
  const learner = await newLearner();
  const [s] = await db.insert(practiceSessions).values({ learnerId: learner.id }).returning();
  await db.insert(sessionQuestions).values(
    questionIds.map((qid, i) => ({
      sessionId: s!.id,
      questionId: qid,
      position: i + 1,
      stageId: Math.ceil(qid / 3),
    })),
  );
  return s!;
}

const attempt = (sessionId: string, questionId: number, overrides = {}) => ({
  sessionId,
  questionId,
  clientAttemptId: randomUUID(),
  rawInput: '40',
  normalizedValue: '40',
  isCorrect: true,
  attemptNo: 1,
  ...overrides,
});

describe('每个学生最多一个进行中的练习', () => {
  it('第二个 in_progress 会话被拒绝', async () => {
    const l = await newLearner();
    await db.insert(practiceSessions).values({ learnerId: l.id });
    await expectViolation(
      db.insert(practiceSessions).values({ learnerId: l.id }),
      'practice_sessions_one_in_progress_uq',
    );
  });

  it('已完成的会话不占名额', async () => {
    const l = await newLearner();
    const done = { learnerId: l.id, status: 'completed' as const, completedAt: new Date() };
    await db.insert(practiceSessions).values([done, done]);
    await expect(db.insert(practiceSessions).values({ learnerId: l.id })).resolves.toBeDefined();
  });
});

describe('会话状态一致', () => {
  it('completed 但没有结束时间被拒绝', async () => {
    const l = await newLearner();
    await expectViolation(
      db.insert(practiceSessions).values({ learnerId: l.id, status: 'completed' }),
      'practice_sessions_completed_at_ck',
    );
  });

  it('in_progress 却有结束时间被拒绝', async () => {
    const l = await newLearner();
    await expectViolation(
      db.insert(practiceSessions).values({ learnerId: l.id, completedAt: new Date() }),
      'practice_sessions_completed_at_ck',
    );
  });
});

describe('题目快照', () => {
  it('同一会话快照中题目重复被拒绝', async () => {
    const s = await newSession([1]);
    await expectViolation(
      db
        .insert(sessionQuestions)
        .values({ sessionId: s.id, questionId: 1, position: 2, stageId: 1 }),
      'session_questions_session_id_question_id_pk',
    );
  });
});

describe('记录只能指向快照中的题', () => {
  it('为快照外的题写作答被拒绝', async () => {
    const s = await newSession([1, 2, 3]);
    await expectViolation(db.insert(attempts).values(attempt(s.id, 5)), 'attempts_snapshot_fk');
  });
});

describe('幂等键在会话内唯一', () => {
  it('同一会话重复的 client_attempt_id：ON CONFLICT DO NOTHING 后只有一行', async () => {
    const s = await newSession();
    const a = attempt(s.id, 1);
    await db.insert(attempts).values(a);
    const second = await db
      .insert(attempts)
      .values({ ...a, attemptNo: 2 })
      .onConflictDoNothing({ target: [attempts.sessionId, attempts.clientAttemptId] })
      .returning();
    expect(second).toHaveLength(0);
    expect(await db.$count(attempts, eq(attempts.clientAttemptId, a.clientAttemptId))).toBe(1);
  });

  it('不同会话可以使用相同的 client_attempt_id', async () => {
    const s1 = await newSession();
    const s2 = await newSession();
    const key = randomUUID();
    await db.insert(attempts).values(attempt(s1.id, 1, { clientAttemptId: key }));
    await db.insert(attempts).values(attempt(s2.id, 1, { clientAttemptId: key }));
    expect(await db.$count(attempts, eq(attempts.clientAttemptId, key))).toBe(2);
  });
});

describe('尝试序号唯一', () => {
  it('同一会话同一题两条 attempt_no = 1 被拒绝', async () => {
    const s = await newSession();
    await db.insert(attempts).values(attempt(s.id, 1));
    await expectViolation(db.insert(attempts).values(attempt(s.id, 1)), 'attempts_attempt_no_uq');
  });
});

describe('学习事件类型合法', () => {
  it('未知事件类型被拒绝', async () => {
    const s = await newSession();
    await expectViolation(
      db.insert(learningEvents).values({
        sessionId: s.id,
        questionId: 1,
        // 绕过 TS 枚举，模拟应用逻辑写错
        type: 'explanation_viewed' as 'video_started',
        clientEventId: randomUUID(),
      }),
      'learning_events_type_ck',
    );
  });
});

describe('级联删除', () => {
  it('删除学生时其会话、快照、作答一并删除', async () => {
    const s = await newSession();
    await db.insert(attempts).values(attempt(s.id, 1));
    await db.delete(learners).where(eq(learners.id, s.learnerId));
    expect(await db.$count(practiceSessions)).toBe(0);
    expect(await db.$count(sessionQuestions)).toBe(0);
    expect(await db.$count(attempts)).toBe(0);
  });
});
