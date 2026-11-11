import { QUESTIONS } from '../../../server/src/content/questions';
import type { Explanation, QuestionDetail, SummaryResponse } from '../api/types';
import type { AttemptResponse, AttemptResult, QuestionStatus, SessionView } from '../api/types';

export const SESSION_ID = '11111111-1111-4111-8111-111111111111';
export const LEARNER_ID = '22222222-2222-4222-8222-222222222222';

const STAGES = [
  { stageId: 1, name: '平行四边形', buildingName: '面包店' },
  { stageId: 2, name: '三角形', buildingName: '帐篷营地' },
  { stageId: 3, name: '梯形', buildingName: '小桥' },
  { stageId: 4, name: '组合图形', buildingName: '小镇广场' },
];

/**
 * 造一个会话状态。只给出题目状态，其余字段按 practice-progress 的规则粗略推出，
 * 足够页面测试使用（前端代码本身不做这种推算）。
 */
export function sessionView(
  statuses: Partial<Record<number, QuestionStatus>> = {},
  overrides: Partial<SessionView> = {},
): SessionView {
  const questions = Array.from({ length: 12 }, (_, i) => ({
    questionId: i + 1,
    stageId: Math.floor(i / 3) + 1,
    position: i + 1,
    status: statuses[i + 1] ?? ('unanswered' as QuestionStatus),
  }));
  let unlocked = true;
  const stages = STAGES.map((s) => {
    const qs = questions.filter((q) => q.stageId === s.stageId);
    const solvedCount = qs.filter((q) => q.status === 'solved').length;
    const stage = {
      ...s,
      intro: `${s.name}简介`,
      lit: solvedCount === 3,
      unlocked,
      solvedCount,
      total: 3,
    };
    unlocked = unlocked && qs.every((q) => q.status === 'solved' || q.status === 'skipped');
    return stage;
  });
  const reachable = questions.filter((q) => stages[q.stageId - 1]!.unlocked);
  const current =
    reachable.find((q) => q.status === 'unanswered' || q.status === 'wrong') ??
    reachable.find((q) => q.status === 'skipped');
  const solved = questions.filter((q) => q.status === 'solved').length;
  return {
    session: {
      id: SESSION_ID,
      status: 'in_progress',
      endedEarly: null,
      startedAt: '2026-11-11T00:00:00.000Z',
      completedAt: null,
    },
    stages,
    questions,
    currentQuestionId: current?.questionId ?? null,
    canFinish: questions.every((q) => q.status === 'solved' || q.status === 'skipped'),
    skippedCount: questions.filter((q) => q.status === 'skipped').length,
    counts: { total: 12, firstTry: solved, corrected: 0, notYet: 12 - solved },
    rates: { firstTry: 0, completion: 0 },
    ...overrides,
  };
}

export function attemptResponse(
  result: Partial<AttemptResult> & { questionId: number; correct: boolean },
  session: SessionView,
  extra: Partial<AttemptResponse> = {},
): AttemptResponse {
  return {
    replayed: false,
    alreadySolved: false,
    result: {
      attemptNo: 1,
      normalizedValue: '0',
      outcome: result.correct ? 'first_try' : 'not_yet',
      mistakeHint: null,
      stageLit: false,
      ...result,
    },
    session,
    ...extra,
  };
}

/** 题目详情（与后端一样不含答案） */
export function questionDetail(qid: number, status: QuestionStatus = 'unanswered'): QuestionDetail {
  const q = QUESTIONS.find((x) => x.id === qid)!;
  return {
    questionId: q.id,
    stageId: q.stageId,
    position: q.id,
    shapeType: q.figure.shape,
    prompt: q.prompt,
    figure: q.figure,
    unit: q.unit,
    hasVideo: q.videoUrl !== null,
    status,
  };
}

export function explanation(qid: number): Explanation {
  const q = QUESTIONS.find((x) => x.id === qid)!;
  return {
    questionId: qid,
    steps: q.explanation.steps,
    tip: q.explanation.tip,
    videoUrl: q.videoUrl,
  };
}

type Outcome = SummaryResponse['questions'][number]['outcome'];
type Reason = SummaryResponse['questions'][number]['reviewReason'];
type Facts = SummaryResponse['questions'][number]['facts'];

/** 已结束会话的学习总结；每题给出分类、原因与行为事实，未指定的题为一次做对 */
export function summaryResponse(
  items: Partial<
    Record<number, { outcome: Outcome; reason?: Reason; facts?: Partial<Facts> }>
  > = {},
  { endedEarly = false } = {},
): SummaryResponse {
  const questions = QUESTIONS.map((q, i) => {
    const item = items[q.id] ?? { outcome: 'first_try' as Outcome };
    const reason = item.outcome === 'not_yet' ? (item.reason ?? 'unanswered') : null;
    const status: QuestionStatus =
      item.outcome !== 'not_yet'
        ? 'solved'
        : reason === 'wrong'
          ? 'wrong'
          : (reason ?? 'unanswered');
    return {
      questionId: q.id,
      stageId: q.stageId,
      position: i + 1,
      status,
      outcome: item.outcome,
      reviewReason: reason,
      facts: {
        attemptCount: item.outcome === 'not_yet' && reason !== 'wrong' ? 0 : 1,
        wrongCount: 0,
        skipCount: reason === 'skipped' ? 1 : 0,
        commonMistakes: [],
        textOpened: false,
        videoStarted: false,
        videoCompleted: false,
        textOpenedBeforeSolved: false,
        videoStartedBeforeSolved: false,
        videoCompletedBeforeSolved: false,
        ...item.facts,
      },
      prompt: q.prompt,
      knowledgePoint: q.knowledgePoint,
    };
  });
  const count = (o: Outcome) => questions.filter((q) => q.outcome === o).length;
  const firstTry = count('first_try');
  const corrected = count('corrected');
  const base = sessionView(Object.fromEntries(questions.map((q) => [q.questionId, q.status])));
  return {
    ...base,
    session: {
      ...base.session,
      status: 'completed',
      endedEarly,
      completedAt: '2026-11-11T01:00:00.000Z',
    },
    counts: { total: 12, firstTry, corrected, notYet: 12 - firstTry - corrected },
    rates: {
      firstTry: Math.round((firstTry * 100) / 12),
      completion: Math.round(((firstTry + corrected) * 100) / 12),
    },
    questions,
  };
}
