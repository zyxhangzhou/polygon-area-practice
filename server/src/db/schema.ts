import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CommonMistake, Explanation, Figure } from '../content/schema.js';

/** 答案与规范化后的作答：精确小数，Drizzle 映射为 string，避免浮点误差 */
const decimal = (name: string) => numeric(name, { precision: 10, scale: 2 });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const LEARNING_EVENT_TYPES = [
  'explanation_text_opened',
  'video_started',
  'video_completed',
] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

export const SESSION_STATUSES = ['in_progress', 'completed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

// ---------- 题库 ----------

// 注意：stages.position 与 questions(stage_id, position_in_stage) 两个唯一约束在数据库中是
// DEFERRABLE INITIALLY DEFERRED（迁移 0001_deferrable_positions.sql），以便种子在一个事务里
// 交换顺序。Drizzle 无法在此表达，drizzle-kit 也不会把它改回去。

export const stages = pgTable('stages', {
  id: integer('id').primaryKey(),
  position: integer('position').notNull().unique(),
  name: text('name').notNull(),
  buildingName: text('building_name').notNull(),
  intro: text('intro').notNull(),
});

export const questions = pgTable(
  'questions',
  {
    id: integer('id').primaryKey(),
    stageId: integer('stage_id')
      .notNull()
      .references(() => stages.id),
    positionInStage: integer('position_in_stage').notNull(),
    shapeType: text('shape_type').notNull(),
    prompt: text('prompt').notNull(),
    figure: jsonb('figure').$type<Figure>().notNull(),
    answer: decimal('answer').notNull(),
    unit: text('unit').notNull(),
    explanation: jsonb('explanation').$type<Explanation>().notNull(),
    videoUrl: text('video_url'),
    commonMistakes: jsonb('common_mistakes').$type<CommonMistake[]>().notNull(),
    knowledgePoint: text('knowledge_point').notNull(),
  },
  (t) => [
    unique('questions_stage_position_uq').on(t.stageId, t.positionInStage),
    check('questions_position_in_stage_ck', sql`${t.positionInStage} between 1 and 3`),
    check('questions_answer_ck', sql`${t.answer} >= 0`),
  ],
);

// ---------- 练习数据 ----------

export const learners = pgTable('learners', {
  id: uuid('id').primaryKey().defaultRandom(),
  nickname: text('nickname'),
  createdAt: createdAt(),
});

export const practiceSessions = pgTable(
  'practice_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    status: text('status', { enum: SESSION_STATUSES }).notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    endedEarly: boolean('ended_early'),
  },
  (t) => [
    check('practice_sessions_status_ck', sql`${t.status} in ('in_progress', 'completed')`),
    // completed ⇔ 有结束时间
    check(
      'practice_sessions_completed_at_ck',
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`,
    ),
    // 每个学生同时最多一个进行中的练习
    uniqueIndex('practice_sessions_one_in_progress_uq')
      .on(t.learnerId)
      .where(sql`status = 'in_progress'`),
  ],
);

export const sessionQuestions = pgTable(
  'session_questions',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id),
    position: integer('position').notNull(),
    stageId: integer('stage_id')
      .notNull()
      .references(() => stages.id),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.questionId] }),
    unique('session_questions_position_uq').on(t.sessionId, t.position),
  ],
);

/** 作答 / 跳过 / 学习事件只能指向本会话快照中的题 */
const snapshotFk = (name: string, sessionId: AnyPgColumn, questionId: AnyPgColumn) =>
  foreignKey({
    name,
    columns: [sessionId, questionId],
    foreignColumns: [sessionQuestions.sessionId, sessionQuestions.questionId],
  }).onDelete('cascade');

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    questionId: integer('question_id').notNull(),
    clientAttemptId: uuid('client_attempt_id').notNull(),
    rawInput: text('raw_input').notNull(),
    normalizedValue: decimal('normalized_value').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    matchedMistake: text('matched_mistake'),
    createdAt: createdAt(),
  },
  (t) => [
    snapshotFk('attempts_snapshot_fk', t.sessionId, t.questionId),
    unique('attempts_client_id_uq').on(t.sessionId, t.clientAttemptId),
    unique('attempts_attempt_no_uq').on(t.sessionId, t.questionId, t.attemptNo),
    check('attempts_attempt_no_ck', sql`${t.attemptNo} >= 1`),
  ],
);

export const questionSkips = pgTable(
  'question_skips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    questionId: integer('question_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    snapshotFk('question_skips_snapshot_fk', t.sessionId, t.questionId),
    unique('question_skips_client_id_uq').on(t.sessionId, t.clientRequestId),
  ],
);

export const learningEvents = pgTable(
  'learning_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    questionId: integer('question_id').notNull(),
    type: text('type', { enum: LEARNING_EVENT_TYPES }).notNull(),
    clientEventId: uuid('client_event_id').notNull(),
    payload: jsonb('payload'),
    createdAt: createdAt(),
  },
  (t) => [
    snapshotFk('learning_events_snapshot_fk', t.sessionId, t.questionId),
    unique('learning_events_client_id_uq').on(t.sessionId, t.clientEventId),
    check(
      'learning_events_type_ck',
      sql`${t.type} in ('explanation_text_opened', 'video_started', 'video_completed')`,
    ),
  ],
);
