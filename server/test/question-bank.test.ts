import { asc, eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { QUESTIONS, STAGES } from '../src/content/questions.js';
import { questions, stages } from '../src/db/schema.js';
import { seed, SeedValidationError } from '../src/db/seed.js';
import { TEST_DATABASE_URL } from './helpers.js';

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

  it('第 4、10 题带视频地址', async () => {
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(isNotNull(questions.videoUrl));
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([4, 10]));
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
});
