/**
 * 接口响应类型直接取自后端（只导入类型，构建时会被删掉）。
 * 后端改了响应结构，前端类型检查会直接报错。
 */
import type {
  completeSession,
  getExplanation,
  getQuestion,
  getSummary,
  recordEvent,
  skipQuestion,
  submitAttempt,
} from '../../../server/src/practice/service';
import type { SessionView } from '../../../server/src/practice/view';
import type { LearningEventType } from '../../../server/src/db/schema';

export type { SessionView, LearningEventType };
export type { AttemptResult } from '../../../server/src/practice/service';

type Data<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;
type Body<F extends (...args: never[]) => Promise<{ body: unknown }>> = Data<F>['body'];

export type QuestionDetail = Data<typeof getQuestion>;
export type Explanation = Data<typeof getExplanation>;
export type AttemptResponse = Body<typeof submitAttempt>;
export type SkipResponse = Body<typeof skipQuestion>;
export type EventResponse = Body<typeof recordEvent>;
export type CompleteResponse = Data<typeof completeSession>;
export type SummaryResponse = Data<typeof getSummary>;
export type QuestionStatus = SessionView['questions'][number]['status'];
export type LearnerResponse = { learnerId: string };
