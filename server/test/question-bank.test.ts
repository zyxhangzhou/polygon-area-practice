import { randomUUID } from 'node:crypto';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { QUESTIONS, STAGES } from '../src/content/questions.js';
import {
  attempts,
  learners,
  practiceSessions,
  questions,
  sessionQuestions,
  stages,
} from '../src/db/schema.js';
import { seed, SeedValidationError } from '../src/db/seed.js';
import { resetPracticeData, TEST_DATABASE_URL } from './helpers.js';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle(pool);

afterAll(async () => {
  // 恢复题库，避免影响其他测试文件
  await seed(db);
  await pool.end();
});

const EXPECTED = [
  ['40', 'cm²'],
  ['26', 'm²'],
  ['4', 'dm'],
  ['30', 'cm²'],
  ['6.3', 'm²'],
  ['54', 'cm²'],
  ['30', 'cm²'],
  ['20', 'm²'],
  ['30', 'm²'],
  ['80', 'cm²'],
  ['68', 'm²'],
  ['900', 'kg'],
] as const;

describe('题库组成', () => {
  it('4 个关卡、12 道题，每关关内序号为 1、2、3', async () => {
    const stageRows = await db.select().from(stages).orderBy(asc(stages.position));
    expect(stageRows.map((s) => s.name)).toEqual(['平行四边形', '三角形', '梯形', '组合图形']);
    const qs = await db.select().from(questions).orderBy(asc(questions.id));
    expect(qs).toHaveLength(12);
    for (const s of stageRows) {
      const positions = qs.filter((q) => q.stageId === s.id).map((q) => q.positionInStage);
      expect(positions.sort()).toEqual([1, 2, 3]);
    }
  });

  it('12 道题的答案与单位与大纲一致（按数值比较）', async () => {
    const qs = await db.select().from(questions).orderBy(asc(questions.id));
    expect(qs.map((q) => [Number(q.answer), q.unit])).toEqual(
      EXPECTED.map(([a, u]) => [Number(a), u]),
    );
  });

  it('第 5 题答案是精确小数，没有浮点误差', async () => {
    const [q5] = await db.select().from(questions).where(eq(questions.id, 5));
    expect(typeof q5!.answer).toBe('string');
    expect(q5!.answer).toBe('6.30');
  });
});

describe('解析内容覆盖', () => {
  it('每题至少 3 步解析，易错提醒非空，至少 1 个常见错误答案', async () => {
    const qs = await db.select().from(questions);
    for (const q of qs) {
      expect(q.explanation.steps.length, `第 ${q.id} 题`).toBeGreaterThanOrEqual(3);
      expect(q.explanation.tip.length, `第 ${q.id} 题`).toBeGreaterThan(0);
      expect(q.commonMistakes.length, `第 ${q.id} 题`).toBeGreaterThanOrEqual(1);
    }
  });

  it('第 1、4、7、10 题带视频地址，每关至少一题', async () => {
    const rows = await db
      .select({ id: questions.id, stageId: questions.stageId, videoUrl: questions.videoUrl })
      .from(questions)
      .where(isNotNull(questions.videoUrl));
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([1, 4, 7, 10]));
    expect(new Set(rows.map((r) => r.stageId))).toEqual(new Set([1, 2, 3, 4]));
    for (const r of rows) expect(r.videoUrl).toBe(`/videos/q${String(r.id).padStart(2, '0')}.mp4`);
  });

  it('第 4 题的常见错误答案包含 60 并附提示', async () => {
    const [q4] = await db.select().from(questions).where(eq(questions.id, 4));
    const m = q4!.commonMistakes.find((x) => x.answer === '60');
    expect(m?.hint).toMatch(/÷ ?2/);
  });
});

describe('种子', () => {
  it('结构不合法时拒绝写入，指出题号，库中题库不变', async () => {
    const [before] = await db.select().from(questions).where(eq(questions.id, 2));
    const bad = QUESTIONS.map((q) => {
      if (q.id === 1)
        return { ...q, figure: { shape: 'parallelogram', base: 8, lengthUnit: 'cm' } };
      if (q.id === 2) return { ...q, prompt: '这条修改不应该写入' };
      return q;
    });
    const run = seed(db, { stages: STAGES, questions: bad });
    await expect(run).rejects.toThrow(SeedValidationError);
    await expect(run).rejects.toThrow(/第 1 题/);
    const [after] = await db.select().from(questions).where(eq(questions.id, 2));
    expect(after!.prompt).toBe(before!.prompt);
  });

  it('连续执行两次，仍是 4 个关卡、12 道题', async () => {
    await seed(db);
    await seed(db);
    expect(await db.$count(stages)).toBe(4);
    expect(await db.$count(questions)).toBe(12);
  });

  it('题干被改动后重新执行种子，恢复为种子内容', async () => {
    await db.update(questions).set({ prompt: '被改坏的题干' }).where(eq(questions.id, 7));
    await seed(db);
    const [q7] = await db.select().from(questions).where(eq(questions.id, 7));
    expect(q7!.prompt).toBe(QUESTIONS.find((q) => q.id === 7)!.prompt);
  });

  it('关内交换题目顺序、交换关卡顺序后重新执行种子成功', async () => {
    const swappedQuestions = QUESTIONS.map((q) =>
      q.id === 1 ? { ...q, positionInStage: 2 } : q.id === 2 ? { ...q, positionInStage: 1 } : q,
    );
    const swappedStages = STAGES.map((s) =>
      s.id === 3 ? { ...s, position: 4 } : s.id === 4 ? { ...s, position: 3 } : s,
    );
    await seed(db, { stages: swappedStages, questions: swappedQuestions });

    const qs = await db.select().from(questions).orderBy(asc(questions.id));
    expect(qs.slice(0, 2).map((q) => q.positionInStage)).toEqual([2, 1]);
    const ss = await db.select().from(stages).orderBy(asc(stages.id));
    expect(ss.map((s) => s.position)).toEqual([1, 2, 4, 3]);

    // 换回来也一样能成功
    await seed(db);
    const restored = await db.select().from(stages).orderBy(asc(stages.id));
    expect(restored.map((s) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it('种子内关内序号重复：拒绝并指出题号，题库不变', async () => {
    const before = await db.select().from(questions).orderBy(asc(questions.id));
    const dup = QUESTIONS.map((q) => (q.id === 2 ? { ...q, positionInStage: 1 } : q));
    const run = seed(db, { stages: STAGES, questions: dup });
    await expect(run).rejects.toThrow(SeedValidationError);
    await expect(run).rejects.toThrow(/第 2 题.*与第 1 题重复/);
    expect(await db.select().from(questions).orderBy(asc(questions.id))).toEqual(before);
  });

  it('库中有种子之外的题目：拒绝并提示题目 ID 不能删除，题库不变', async () => {
    const before = await db.select().from(questions).orderBy(asc(questions.id));
    const replaced = [...QUESTIONS.filter((q) => q.id !== 3), { ...QUESTIONS[2]!, id: 13 }];
    const run = seed(db, { stages: STAGES, questions: replaced });
    await expect(run).rejects.toThrow(SeedValidationError);
    await expect(run).rejects.toThrow(/题目 3 .*题目 ID 不能删除/);
    expect(await db.select().from(questions).orderBy(asc(questions.id))).toEqual(before);
  });

  it('已有练习记录时重新执行种子：会话、快照、作答不变', async () => {
    await resetPracticeData(pool);
    const [l] = await db.insert(learners).values({}).returning();
    const [ses] = await db.insert(practiceSessions).values({ learnerId: l!.id }).returning();
    await db.insert(sessionQuestions).values([
      { sessionId: ses!.id, questionId: 1, position: 1, stageId: 1 },
      { sessionId: ses!.id, questionId: 2, position: 2, stageId: 1 },
    ]);
    await db.insert(attempts).values({
      sessionId: ses!.id,
      questionId: 1,
      clientAttemptId: randomUUID(),
      rawInput: '40',
      normalizedValue: '40',
      isCorrect: true,
      attemptNo: 1,
    });
    const snapshot = async () => ({
      sessions: await db.select().from(practiceSessions),
      snapshot: await db.select().from(sessionQuestions),
      attempts: await db.select().from(attempts),
    });
    const before = await snapshot();
    await seed(db);
    expect(await snapshot()).toEqual(before);
    await resetPracticeData(pool);
  });

  it('库中有种子之外的关卡：拒绝并提示关卡 ID 不能删除', async () => {
    const run = seed(db, {
      stages: STAGES.filter((s) => s.id !== 4),
      questions: QUESTIONS.filter((q) => q.stageId !== 4),
    });
    await expect(run).rejects.toThrow(/关卡 4 在数据库中但不在种子中/);
  });
});
