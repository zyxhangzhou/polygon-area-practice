import { notInArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { QUESTIONS, STAGES } from '../content/questions.js';
import {
  type QuestionSeed,
  QuestionSeedSchema,
  type StageSeed,
  StageSeedSchema,
} from '../content/schema.js';
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
  const valid = {
    stages: parsedStages.filter((s) => s !== undefined),
    questions: parsedQuestions.filter((q) => q !== undefined),
  };
  checkConsistency(valid, issues);
  if (issues.length > 0) throw new SeedValidationError(issues);
  return valid;
}

/** 数据自身的一致性：在写库前发现，避免只拿到数据库的唯一约束名 */
function checkConsistency(
  data: { stages: StageSeed[]; questions: QuestionSeed[] },
  issues: string[],
) {
  const firstSeen = <T>(items: T[], key: (t: T) => string, describe: (t: T, prev: T) => string) => {
    const seen = new Map<string, T>();
    for (const item of items) {
      const k = key(item);
      const prev = seen.get(k);
      if (prev) issues.push(describe(item, prev));
      else seen.set(k, item);
    }
  };
  firstSeen(
    data.stages,
    (s) => String(s.id),
    (s) => `关卡 ${s.id}：ID 重复`,
  );
  firstSeen(
    data.stages,
    (s) => String(s.position),
    (s, prev) => `关卡 ${s.id}：顺序 ${s.position} 与关卡 ${prev.id} 重复`,
  );
  firstSeen(
    data.questions,
    (q) => String(q.id),
    (q) => `第 ${q.id} 题：ID 重复`,
  );
  firstSeen(
    data.questions,
    (q) => `${q.stageId}/${q.positionInStage}`,
    (q, prev) =>
      `第 ${q.id} 题：关卡 ${q.stageId} 的关内序号 ${q.positionInStage} 与第 ${prev.id} 题重复`,
  );
  const stageIds = new Set(data.stages.map((s) => s.id));
  for (const q of data.questions) {
    if (!stageIds.has(q.stageId)) issues.push(`第 ${q.id} 题：所属关卡 ${q.stageId} 不存在`);
  }
  for (const s of data.stages) {
    const n = data.questions.filter((q) => q.stageId === s.id).length;
    if (n !== 3) issues.push(`关卡 ${s.id}：应恰好 3 道题，实际 ${n} 道`);
  }
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
    // 题目 ID 永久有效：已有快照引用它，不能因为从种子中移除而删除
    const orphans = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(
        notInArray(
          questions.id,
          valid.questions.map((q) => q.id),
        ),
      );
    const orphanStages = await tx
      .select({ id: stages.id })
      .from(stages)
      .where(
        notInArray(
          stages.id,
          valid.stages.map((s) => s.id),
        ),
      );
    const orphanIssues = [
      ...orphans.map(
        (o) =>
          `题目 ${o.id} 在数据库中但不在种子中：题目 ID 不能删除，替换题目请在原 ID 上修改内容`,
      ),
      ...orphanStages.map(
        (o) =>
          `关卡 ${o.id} 在数据库中但不在种子中：关卡 ID 不能删除，替换关卡请在原 ID 上修改内容`,
      ),
    ];
    if (orphanIssues.length > 0) throw new SeedValidationError(orphanIssues);
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
