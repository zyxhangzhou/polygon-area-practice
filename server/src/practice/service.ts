import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type pg from 'pg';
import type { createDb } from '../db.js';
import {
  attempts,
  learners,
  learningEvents,
  practiceSessions,
  questions,
  questionSkips,
  sessionQuestions,
  stages,
  type LearningEventType,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { canonical } from '../grading/decimal.js';
import { gradeAnswer } from '../grading/grade.js';
import { summarize, type PracticeSummary, type QuestionOutcome } from '../grading/progress.js';
import { withTransaction, type Tx } from './tx.js';
import { sessionView, summaryView, type SessionView, type StageInfo } from './view.js';

type Db = ReturnType<typeof createDb>['db'];
const READ_ONLY = { readOnly: true };

// ---------- 错误 ----------

const sessionNotFound = () => new AppError(404, 'SESSION_NOT_FOUND', '找不到这次练习');
const questionNotInSession = () =>
  new AppError(404, 'QUESTION_NOT_IN_SESSION', '这次练习里没有这道题');
const sessionCompleted = () =>
  new AppError(409, 'SESSION_COMPLETED', '这次练习已经结束了，可以再练一次');
const stageLocked = () => new AppError(409, 'STAGE_LOCKED', '这一关还没有解锁，先完成前面的题吧');
const idempotencyConflict = () =>
  new AppError(409, 'IDEMPOTENCY_CONFLICT', '同一个请求编号对应了不同的内容');
const explanationLocked = () =>
  new AppError(403, 'EXPLANATION_LOCKED', '先试着做一做，答错或跳过后就能看解析');

// ---------- 读取 ----------

type SessionRecord = typeof practiceSessions.$inferSelect;

interface Records {
  session: SessionRecord;
  snapshot: { questionId: number; position: number; stageId: number }[];
  attempts: (typeof attempts.$inferSelect)[];
  skips: (typeof questionSkips.$inferSelect)[];
  events: (typeof learningEvents.$inferSelect)[];
}

/** 读会话行；lock 为 true 时加行锁，同一会话的写操作因此串行 */
async function findSession(tx: Tx, sessionId: string, lock: boolean): Promise<SessionRecord> {
  const query = tx.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw sessionNotFound();
  return row;
}

async function loadRecords(tx: Tx, session: SessionRecord): Promise<Records> {
  const sid = session.id;
  // 同一事务只有一条连接，依次查询（pg 不支持在一条连接上并发查询）
  const snapshot = await tx
    .select({
      questionId: sessionQuestions.questionId,
      position: sessionQuestions.position,
      stageId: sessionQuestions.stageId,
    })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.sessionId, sid));
  const attemptRows = await tx.select().from(attempts).where(eq(attempts.sessionId, sid));
  const skipRows = await tx.select().from(questionSkips).where(eq(questionSkips.sessionId, sid));
  const eventRows = await tx.select().from(learningEvents).where(eq(learningEvents.sessionId, sid));
  return { session, snapshot, attempts: attemptRows, skips: skipRows, events: eventRows };
}

/**
 * 用记录算进度。会话结束后写入的学习事件（seq ≥ completed_seq）不计入。
 * upToSeq 给出时只用 seq ≤ upToSeq 的记录，用于推出某次作答当时的结果。
 */
function computeSummary(r: Records, upToSeq = Number.POSITIVE_INFINITY): PracticeSummary {
  const within = (x: { seq: number }) => x.seq <= upToSeq;
  const completedSeq = r.session.completedSeq;
  return summarize(
    r.snapshot,
    r.attempts.filter(within),
    r.skips.filter(within),
    r.events.filter((e) => within(e) && (completedSeq === null || e.seq < completedSeq)),
  );
}

async function loadStageInfo(tx: Tx): Promise<Map<number, StageInfo>> {
  const rows = await tx
    .select({
      id: stages.id,
      name: stages.name,
      buildingName: stages.buildingName,
      intro: stages.intro,
    })
    .from(stages);
  return new Map(rows.map((s) => [s.id, s]));
}

async function buildView(tx: Tx, r: Records): Promise<SessionView> {
  return sessionView(r.session, computeSummary(r), await loadStageInfo(tx));
}

/** 在锁内重新读一遍记录并生成会话状态（写入之后调用） */
async function freshView(tx: Tx, sessionId: string): Promise<SessionView> {
  const session = await findSession(tx, sessionId, false);
  return buildView(tx, await loadRecords(tx, session));
}

function snapshotItem(r: Records, questionId: number | null) {
  const item =
    questionId === null ? undefined : r.snapshot.find((s) => s.questionId === questionId);
  if (!item) throw questionNotInSession();
  return item;
}

/** 写入限制第 4–6 步：题目在快照中、关卡已解锁；返回该题是否已答对 */
function checkWritable(r: Records, questionId: number) {
  const item = snapshotItem(r, questionId);
  const summary = computeSummary(r);
  if (!summary.stages.find((s) => s.stageId === item.stageId)?.unlocked) throw stageLocked();
  const q = summary.questions.find((x) => x.questionId === questionId);
  return { alreadySolved: q?.status === 'solved' };
}

function explanationAccessible(r: Records, questionId: number): boolean {
  if (r.session.status === 'completed') return true;
  const status = computeSummary(r).questions.find((q) => q.questionId === questionId)?.status;
  return status === 'wrong' || status === 'skipped' || status === 'solved';
}

async function loadQuestion(tx: Tx, questionId: number) {
  const [q] = await tx.select().from(questions).where(eq(questions.id, questionId));
  if (!q) throw questionNotInSession();
  return q;
}

// ---------- 学生与会话 ----------

export async function createLearner(db: Db, nickname: string | null) {
  const [row] = await db.insert(learners).values({ nickname }).returning({ id: learners.id });
  return { learnerId: row!.id };
}

/** 开始或继续练习。锁住学生行，同一学生的并发请求排队，第二个能看到第一个建好的会话。 */
export async function startSession(pool: pg.Pool, learnerId: string) {
  return withTransaction(pool, async (tx) => {
    const [learner] = await tx
      .select({ id: learners.id })
      .from(learners)
      .where(eq(learners.id, learnerId))
      .for('update');
    if (!learner) throw new AppError(404, 'LEARNER_NOT_FOUND', '找不到这个学生');

    const [existing] = await tx
      .select()
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.learnerId, learnerId), eq(practiceSessions.status, 'in_progress')),
      );
    if (existing) {
      return { created: false, view: await buildView(tx, await loadRecords(tx, existing)) };
    }

    const [session] = await tx.insert(practiceSessions).values({ learnerId }).returning();
    const bank = await tx
      .select({ questionId: questions.id, stageId: questions.stageId })
      .from(questions)
      .innerJoin(stages, eq(questions.stageId, stages.id))
      .orderBy(asc(stages.position), asc(questions.positionInStage));
    await tx.insert(sessionQuestions).values(
      bank.map((q, i) => ({
        sessionId: session!.id,
        questionId: q.questionId,
        stageId: q.stageId,
        position: i + 1,
      })),
    );
    return { created: true, view: await freshView(tx, session!.id) };
  });
}

/** 练习记录最多返回最近的这么多次 */
export const HISTORY_LIMIT = 20;

/**
 * 一个学生的练习记录（最近的在前），每次附上统计。
 * 学生 ID 与会话 ID 一样是访问凭证：拿到它就能看到这个学生的记录。
 */
export async function listLearnerSessions(pool: pg.Pool, learnerId: string) {
  return withTransaction(
    pool,
    async (tx) => {
      const [learner] = await tx
        .select({ id: learners.id })
        .from(learners)
        .where(eq(learners.id, learnerId));
      if (!learner) throw new AppError(404, 'LEARNER_NOT_FOUND', '找不到这个学生');
      const sessions = await tx
        .select()
        .from(practiceSessions)
        .where(eq(practiceSessions.learnerId, learnerId))
        .orderBy(desc(practiceSessions.startedAt), desc(practiceSessions.id))
        .limit(HISTORY_LIMIT);
      const items = [];
      for (const session of sessions) {
        const summary = computeSummary(await loadRecords(tx, session));
        items.push({
          id: session.id,
          status: session.status,
          endedEarly: session.endedEarly,
          startedAt: session.startedAt.toISOString(),
          completedAt: session.completedAt?.toISOString() ?? null,
          counts: summary.counts,
          rates: summary.rates,
        });
      }
      return { sessions: items };
    },
    READ_ONLY,
  );
}

export async function getSession(pool: pg.Pool, sessionId: string) {
  return withTransaction(
    pool,
    async (tx) => {
      const session = await findSession(tx, sessionId, false);
      return buildView(tx, await loadRecords(tx, session));
    },
    READ_ONLY,
  );
}

/** 题目详情：不含答案、常见错误和解析 */
export async function getQuestion(pool: pg.Pool, sessionId: string, questionId: number | null) {
  return withTransaction(
    pool,
    async (tx) => {
      const session = await findSession(tx, sessionId, false);
      const r = await loadRecords(tx, session);
      const item = snapshotItem(r, questionId);
      const q = await loadQuestion(tx, item.questionId);
      const status = computeSummary(r).questions.find((x) => x.questionId === q.id)?.status;
      return {
        questionId: q.id,
        stageId: item.stageId,
        position: item.position,
        shapeType: q.shapeType,
        prompt: q.prompt,
        figure: q.figure,
        unit: q.unit,
        hasVideo: q.videoUrl !== null,
        status,
      };
    },
    READ_ONLY,
  );
}

// ---------- 作答 ----------

export interface AttemptInput {
  questionId: number;
  clientAttemptId: string;
  answer: string;
}

export interface AttemptResult {
  questionId: number;
  correct: boolean;
  attemptNo: number;
  normalizedValue: string;
  outcome: QuestionOutcome;
  mistakeHint: string | null;
  stageLit: boolean;
}

/**
 * 由记录推出一次作答的结果：比较这条作答之前与到这条为止的进度。
 * 首次请求和重放都走这里，所以结果必然一致，也不受之后的作答影响。
 */
async function deriveResult(
  tx: Tx,
  r: Records,
  attempt: typeof attempts.$inferSelect,
): Promise<AttemptResult> {
  const before = computeSummary(r, attempt.seq - 1);
  const after = computeSummary(r, attempt.seq);
  const q = after.questions.find((x) => x.questionId === attempt.questionId)!;
  const lit = (s: PracticeSummary) => s.stages.find((x) => x.stageId === q.stageId)?.lit ?? false;

  let mistakeHint: string | null = null;
  if (attempt.matchedMistake !== null) {
    const bank = await loadQuestion(tx, attempt.questionId);
    mistakeHint =
      bank.commonMistakes.find((m) => canonical(m.answer) === attempt.matchedMistake)?.hint ?? null;
  }
  return {
    questionId: attempt.questionId,
    correct: attempt.isCorrect,
    attemptNo: attempt.attemptNo,
    normalizedValue: canonical(attempt.normalizedValue),
    outcome: q.outcome,
    mistakeHint,
    stageLit: lit(after) && !lit(before),
  };
}

export async function submitAttempt(pool: pg.Pool, sessionId: string, input: AttemptInput) {
  return withTransaction(pool, async (tx) => {
    const session = await findSession(tx, sessionId, true);

    const [existing] = await tx
      .select()
      .from(attempts)
      .where(
        and(eq(attempts.sessionId, sessionId), eq(attempts.clientAttemptId, input.clientAttemptId)),
      );
    if (existing) {
      if (existing.questionId !== input.questionId || existing.rawInput !== input.answer)
        throw idempotencyConflict();
      const r = await loadRecords(tx, session);
      return {
        status: 200,
        body: {
          replayed: true,
          alreadySolved: false,
          result: await deriveResult(tx, r, existing),
          session: await buildView(tx, r),
        },
      };
    }

    if (session.status === 'completed') throw sessionCompleted();
    const r = await loadRecords(tx, session);
    const { alreadySolved } = checkWritable(r, input.questionId);
    if (alreadySolved) {
      return {
        status: 200,
        body: {
          replayed: false,
          alreadySolved: true,
          result: null,
          session: await buildView(tx, r),
        },
      };
    }

    const q = await loadQuestion(tx, input.questionId);
    const graded = gradeAnswer(input.answer, q);
    if (graded.kind === 'invalid') {
      throw new AppError(400, 'INVALID_ANSWER', graded.message, { reason: graded.reason });
    }

    const [{ n }] = (await tx
      .select({ n: count() })
      .from(attempts)
      .where(
        and(eq(attempts.sessionId, sessionId), eq(attempts.questionId, input.questionId)),
      )) as [{ n: number }];
    const [inserted] = await tx
      .insert(attempts)
      .values({
        sessionId,
        questionId: input.questionId,
        clientAttemptId: input.clientAttemptId,
        rawInput: input.answer,
        normalizedValue: graded.normalizedValue,
        isCorrect: graded.correct,
        attemptNo: n + 1,
        matchedMistake: graded.matchedMistake?.answer ?? null,
      })
      .returning();

    const after = await loadRecords(tx, session);
    return {
      status: 201,
      body: {
        replayed: false,
        alreadySolved: false,
        result: await deriveResult(tx, after, inserted!),
        session: await buildView(tx, after),
      },
    };
  });
}

// ---------- 跳过 ----------

export async function skipQuestion(
  pool: pg.Pool,
  sessionId: string,
  questionId: number | null,
  clientRequestId: string,
) {
  return withTransaction(pool, async (tx) => {
    const session = await findSession(tx, sessionId, true);

    const [existing] = await tx
      .select()
      .from(questionSkips)
      .where(
        and(
          eq(questionSkips.sessionId, sessionId),
          eq(questionSkips.clientRequestId, clientRequestId),
        ),
      );
    if (existing) {
      if (existing.questionId !== questionId) throw idempotencyConflict();
      return {
        status: 200,
        body: { replayed: true, alreadySolved: false, session: await freshView(tx, sessionId) },
      };
    }

    if (session.status === 'completed') throw sessionCompleted();
    const r = await loadRecords(tx, session);
    const item = snapshotItem(r, questionId);
    const { alreadySolved } = checkWritable(r, item.questionId);
    if (alreadySolved) {
      return {
        status: 200,
        body: { replayed: false, alreadySolved: true, session: await buildView(tx, r) },
      };
    }

    await tx
      .insert(questionSkips)
      .values({ sessionId, questionId: item.questionId, clientRequestId });
    return {
      status: 201,
      body: { replayed: false, alreadySolved: false, session: await freshView(tx, sessionId) },
    };
  });
}

// ---------- 解析与学习事件 ----------

export async function getExplanation(pool: pg.Pool, sessionId: string, questionId: number | null) {
  return withTransaction(
    pool,
    async (tx) => {
      const session = await findSession(tx, sessionId, false);
      const r = await loadRecords(tx, session);
      const item = snapshotItem(r, questionId);
      if (!explanationAccessible(r, item.questionId)) throw explanationLocked();
      const q = await loadQuestion(tx, item.questionId);
      return {
        questionId: q.id,
        steps: q.explanation.steps,
        tip: q.explanation.tip,
        videoUrl: q.videoUrl,
      };
    },
    READ_ONLY,
  );
}

export interface EventInput {
  questionId: number;
  type: LearningEventType;
  clientEventId: string;
  payload?: Record<string, unknown>;
}

export async function recordEvent(pool: pg.Pool, sessionId: string, input: EventInput) {
  return withTransaction(pool, async (tx) => {
    const session = await findSession(tx, sessionId, true);

    const [existing] = await tx
      .select()
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.sessionId, sessionId),
          eq(learningEvents.clientEventId, input.clientEventId),
        ),
      );
    if (existing) {
      if (existing.questionId !== input.questionId || existing.type !== input.type)
        throw idempotencyConflict();
      return { status: 200, body: { replayed: true } };
    }

    const r = await loadRecords(tx, session);
    const item = snapshotItem(r, input.questionId);
    if (!explanationAccessible(r, item.questionId)) throw explanationLocked();
    await tx.insert(learningEvents).values({
      sessionId,
      questionId: item.questionId,
      type: input.type,
      clientEventId: input.clientEventId,
      payload: input.payload ?? null,
    });
    return { status: 201, body: { replayed: false } };
  });
}

// ---------- 结束与总结 ----------

export async function completeSession(pool: pg.Pool, sessionId: string, endedEarly: boolean) {
  return withTransaction(pool, async (tx) => {
    const session = await findSession(tx, sessionId, true);
    const r = await loadRecords(tx, session);
    if (session.status === 'completed') return buildView(tx, r);

    const { canFinish } = computeSummary(r);
    if (!canFinish && !endedEarly) {
      throw new AppError(409, 'NOT_FINISHED', '还有题没有完成，确认要提前结束吗？');
    }
    await tx
      .update(practiceSessions)
      .set({
        status: 'completed',
        completedAt: sql`now()`,
        completedSeq: sql`nextval('practice_record_seq')`,
        endedEarly: !canFinish,
      })
      .where(eq(practiceSessions.id, sessionId));
    return freshView(tx, sessionId);
  });
}

export async function getSummary(pool: pg.Pool, sessionId: string) {
  return withTransaction(
    pool,
    async (tx) => {
      const session = await findSession(tx, sessionId, false);
      const r = await loadRecords(tx, session);
      const ids = r.snapshot.map((s) => s.questionId);
      const texts = ids.length
        ? await tx
            .select({
              id: questions.id,
              prompt: questions.prompt,
              knowledgePoint: questions.knowledgePoint,
            })
            .from(questions)
            .where(inArray(questions.id, ids))
        : [];
      return summaryView(
        session,
        computeSummary(r),
        await loadStageInfo(tx),
        new Map(texts.map((t) => [t.id, t])),
      );
    },
    READ_ONLY,
  );
}
