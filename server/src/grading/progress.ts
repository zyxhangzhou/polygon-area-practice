import type { LearningEventType } from '../db/schema.js';

/**
 * 练习进度与学习总结：同一个纯函数一次算出，会话状态接口和总结接口都调用它，保证同一口径。
 * 先后顺序一律按 seq（跨作答、跳过、学习事件三张表共用的写入序号），不按 created_at。
 */

export type QuestionStatus = 'unanswered' | 'wrong' | 'skipped' | 'solved';
export type QuestionOutcome = 'first_try' | 'corrected' | 'not_yet';
export type ReviewReason = 'wrong' | 'skipped' | 'unanswered';

export interface SnapshotItem {
  questionId: number;
  position: number;
  stageId: number;
}
export interface AttemptRecord {
  questionId: number;
  isCorrect: boolean;
  matchedMistake: string | null;
  seq: number;
}
export interface SkipRecord {
  questionId: number;
  seq: number;
}
export interface EventRecord {
  questionId: number;
  type: LearningEventType;
  seq: number;
}

export interface QuestionFacts {
  attemptCount: number;
  wrongCount: number;
  skipCount: number;
  /** 碰到过的常见错误答案（规范值），按首次出现顺序、去重 */
  commonMistakes: string[];
  textOpened: boolean;
  videoStarted: boolean;
  videoCompleted: boolean;
}

export interface QuestionProgress {
  questionId: number;
  stageId: number;
  position: number;
  status: QuestionStatus;
  outcome: QuestionOutcome;
  /** outcome 为 not_yet 时给出原因，否则为 null */
  reviewReason: ReviewReason | null;
  facts: QuestionFacts;
}

export interface StageProgress {
  stageId: number;
  total: number;
  solvedCount: number;
  /** 本关全部 solved */
  lit: boolean;
  /** 第 1 关始终解锁；之后的关卡在前面每道题都曾答对或跳过后解锁，不会撤回 */
  unlocked: boolean;
}

export interface PracticeSummary {
  questions: QuestionProgress[];
  stages: StageProgress[];
  currentQuestionId: number | null;
  canFinish: boolean;
  skippedCount: number;
  counts: { total: number; firstTry: number; corrected: number; notYet: number };
  /** 0–100 的整数百分数，四舍五入；总题数为 0 时为 0 */
  rates: { firstTry: number; completion: number };
}

const bySeq = <T extends { seq: number }>(a: T, b: T) => a.seq - b.seq;

function percent(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n * 100) / total);
}

export function summarize(
  snapshot: readonly SnapshotItem[],
  attempts: readonly AttemptRecord[],
  skips: readonly SkipRecord[],
  events: readonly EventRecord[],
): PracticeSummary {
  const items = [...snapshot].sort((a, b) => a.position - b.position);
  const ids = new Set(items.map((s) => s.questionId));
  if (ids.size !== items.length) throw new Error('题目快照中有重复的题');

  const group = <T extends { questionId: number; seq: number }>(
    records: readonly T[],
    kind: string,
  ) => {
    const map = new Map<number, T[]>();
    for (const r of records) {
      if (!ids.has(r.questionId)) throw new Error(`${kind}指向快照之外的题：${r.questionId}`);
      const list = map.get(r.questionId) ?? [];
      list.push(r);
      map.set(r.questionId, list);
    }
    for (const list of map.values()) list.sort(bySeq);
    return map;
  };
  const attemptsByQ = group(attempts, '作答');
  const skipsByQ = group(skips, '跳过');
  const eventsByQ = group(events, '学习事件');

  const questions: QuestionProgress[] = items.map((item) => {
    const qa = attemptsByQ.get(item.questionId) ?? [];
    const qs = skipsByQ.get(item.questionId) ?? [];
    const qe = eventsByQ.get(item.questionId) ?? [];

    const correct = qa.find((a) => a.isCorrect);
    let status: QuestionStatus;
    if (correct) status = 'solved';
    else {
      const lastAttempt = qa.at(-1);
      const lastSkip = qs.at(-1);
      if (!lastAttempt && !lastSkip) status = 'unanswered';
      else if (lastSkip && (!lastAttempt || lastSkip.seq > lastAttempt.seq)) status = 'skipped';
      else status = 'wrong';
    }

    let outcome: QuestionOutcome = 'not_yet';
    if (correct) {
      const firstAttemptCorrect = qa[0] === correct;
      const sawExplanationBefore = qe.some((e) => e.seq < correct.seq);
      outcome = firstAttemptCorrect && !sawExplanationBefore ? 'first_try' : 'corrected';
    }

    const mistakes: string[] = [];
    for (const a of qa) {
      if (a.matchedMistake !== null && !mistakes.includes(a.matchedMistake))
        mistakes.push(a.matchedMistake);
    }

    return {
      questionId: item.questionId,
      stageId: item.stageId,
      position: item.position,
      status,
      outcome,
      reviewReason: outcome === 'not_yet' ? (status as ReviewReason) : null,
      facts: {
        attemptCount: qa.length,
        wrongCount: qa.filter((a) => !a.isCorrect).length,
        skipCount: qs.length,
        commonMistakes: mistakes,
        textOpened: qe.some((e) => e.type === 'explanation_text_opened'),
        videoStarted: qe.some((e) => e.type === 'video_started'),
        videoCompleted: qe.some((e) => e.type === 'video_completed'),
      },
    };
  });

  // 关卡顺序取快照中该关题目的最小 position（快照在会话创建时冻结）
  const stageOrder: number[] = [];
  for (const q of questions) if (!stageOrder.includes(q.stageId)) stageOrder.push(q.stageId);

  const everHandled = (q: QuestionProgress) => q.status === 'solved' || q.facts.skipCount > 0;
  const stages: StageProgress[] = [];
  let unlocked = true;
  for (const stageId of stageOrder) {
    const qs = questions.filter((q) => q.stageId === stageId);
    const solvedCount = qs.filter((q) => q.status === 'solved').length;
    stages.push({
      stageId,
      total: qs.length,
      solvedCount,
      lit: solvedCount === qs.length,
      unlocked,
    });
    unlocked = unlocked && qs.every(everHandled);
  }

  const unlockedStages = new Set(stages.filter((s) => s.unlocked).map((s) => s.stageId));
  const reachable = questions.filter((q) => unlockedStages.has(q.stageId));
  const current =
    reachable.find((q) => q.status === 'unanswered' || q.status === 'wrong') ??
    reachable.find((q) => q.status === 'skipped');

  const firstTry = questions.filter((q) => q.outcome === 'first_try').length;
  const corrected = questions.filter((q) => q.outcome === 'corrected').length;
  const total = questions.length;
  const skippedCount = questions.filter((q) => q.status === 'skipped').length;

  return {
    questions,
    stages,
    currentQuestionId: current?.questionId ?? null,
    canFinish: questions.every((q) => q.status === 'solved' || q.status === 'skipped'),
    skippedCount,
    counts: { total, firstTry, corrected, notYet: total - firstTry - corrected },
    rates: { firstTry: percent(firstTry, total), completion: percent(firstTry + corrected, total) },
  };
}
