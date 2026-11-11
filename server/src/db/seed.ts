import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { QUESTIONS, STAGES } from '../content/questions.js';
import { QuestionSeedSchema, StageSeedSchema } from '../content/schema.js';
import { questions, stages } from './schema.js';

export class SeedValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`题库数据不合法：\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'SeedValidationError';
  }
}

export type SeedData = { stages: unknown[]; questions: unknown[] };

/** 校验全部种子数据；有任何错误都不写库，并指出出错的题 */
export function validateSeed(data: SeedData) {
  const issues: string[] = [];
  const parsedStages = data.stages.map((s, i) => {
    const r = StageSeedSchema.safeParse(s);
    if (!r.success) issues.push(`关卡 #${i + 1}：${z.prettifyError(r.error)}`);
    return r.data;
  });
  const parsedQuestions = data.questions.map((q, i) => {
    const r = QuestionSeedSchema.safeParse(q);
    if (!r.success) {
      const id = (q as { id?: unknown })?.id ?? `#${i + 1}`;
      issues.push(`第 ${String(id)} 题：${z.prettifyError(r.error)}`);
    }
    return r.data;
  });
  if (issues.length > 0) throw new SeedValidationError(issues);
  return {
    stages: parsedStages.filter((s) => s !== undefined),
    questions: parsedQuestions.filter((q) => q !== undefined),
  };
}

/**
 * 写入题库：按固定 ID upsert，可重复执行。
 * 只更新种子中的关卡与题目，不删除其他行，不碰练习数据。
 */
export async function seed(
  db: NodePgDatabase,
  data: SeedData = { stages: STAGES, questions: QUESTIONS },
) {
  const valid = validateSeed(data);
  await db.transaction(async (tx) => {
    for (const s of valid.stages) {
      await tx
        .insert(stages)
        .values(s)
        .onConflictDoUpdate({
          target: stages.id,
          set: {
            position: s.position,
            name: s.name,
            buildingName: s.buildingName,
            intro: s.intro,
          },
        });
    }
    for (const q of valid.questions) {
      const row = { ...q, shapeType: q.figure.shape };
      await tx
        .insert(questions)
        .values(row)
        .onConflictDoUpdate({ target: questions.id, set: { ...row, id: sql`excluded.id` } });
    }
  });
  return { stages: valid.stages.length, questions: valid.questions.length };
}
