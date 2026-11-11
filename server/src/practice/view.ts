import type { PracticeSummary } from '../grading/progress.js';
import type { SessionStatus } from '../db/schema.js';

/** 会话行中视图需要的字段 */
export interface SessionRow {
  id: string;
  status: SessionStatus;
  endedEarly: boolean | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface StageInfo {
  id: number;
  name: string;
  buildingName: string;
  intro: string;
}

/** 会话状态：GET /sessions/:id 返回它，每个写接口也附带它 */
export function sessionView(
  session: SessionRow,
  summary: PracticeSummary,
  stageInfo: ReadonlyMap<number, StageInfo>,
) {
  return {
    session: {
      id: session.id,
      status: session.status,
      endedEarly: session.endedEarly,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
    },
    stages: summary.stages.map((s) => {
      const info = stageInfo.get(s.stageId);
      return {
        stageId: s.stageId,
        name: info?.name ?? '',
        buildingName: info?.buildingName ?? '',
        intro: info?.intro ?? '',
        lit: s.lit,
        unlocked: s.unlocked,
        solvedCount: s.solvedCount,
        total: s.total,
      };
    }),
    questions: summary.questions.map((q) => ({
      questionId: q.questionId,
      stageId: q.stageId,
      position: q.position,
      status: q.status,
    })),
    currentQuestionId: summary.currentQuestionId,
    canFinish: summary.canFinish,
    skippedCount: summary.skippedCount,
    counts: summary.counts,
    rates: summary.rates,
  };
}

export type SessionView = ReturnType<typeof sessionView>;

export interface QuestionText {
  id: number;
  prompt: string;
  knowledgePoint: string;
}

/** 学习总结：会话状态 + 每题的分类、原因、行为事实、题干与知识点 */
export function summaryView(
  session: SessionRow,
  summary: PracticeSummary,
  stageInfo: ReadonlyMap<number, StageInfo>,
  questionText: ReadonlyMap<number, QuestionText>,
) {
  const base = sessionView(session, summary, stageInfo);
  return {
    ...base,
    questions: summary.questions.map((q) => ({
      questionId: q.questionId,
      stageId: q.stageId,
      position: q.position,
      status: q.status,
      outcome: q.outcome,
      reviewReason: q.reviewReason,
      facts: q.facts,
      prompt: questionText.get(q.questionId)?.prompt ?? '',
      knowledgePoint: questionText.get(q.questionId)?.knowledgePoint ?? '',
    })),
  };
}
