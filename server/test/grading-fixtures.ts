import type { LearningEventType } from '../src/db/schema.js';
import {
  summarize,
  type AttemptRecord,
  type EventRecord,
  type SkipRecord,
  type SnapshotItem,
} from '../src/grading/progress.js';

/** 4 关 × 3 题的快照：题号 1–12，关卡 1–4 */
export const SNAPSHOT: SnapshotItem[] = Array.from({ length: 12 }, (_, i) => ({
  questionId: i + 1,
  position: i + 1,
  stageId: Math.floor(i / 3) + 1,
}));

/** 按调用顺序分配 seq，模拟数据库的写入序号 */
export class Log {
  private seq = 0;
  attempts: AttemptRecord[] = [];
  skips: SkipRecord[] = [];
  events: EventRecord[] = [];

  wrong(questionId: number, matchedMistake: string | null = null) {
    this.attempts.push({ questionId, isCorrect: false, matchedMistake, seq: ++this.seq });
    return this;
  }
  right(questionId: number) {
    this.attempts.push({ questionId, isCorrect: true, matchedMistake: null, seq: ++this.seq });
    return this;
  }
  skip(questionId: number) {
    this.skips.push({ questionId, seq: ++this.seq });
    return this;
  }
  event(questionId: number, type: LearningEventType) {
    this.events.push({ questionId, type, seq: ++this.seq });
    return this;
  }
  summarize(snapshot: SnapshotItem[] = SNAPSHOT) {
    return summarize(snapshot, this.attempts, this.skips, this.events);
  }
}

export const question = (s: ReturnType<Log['summarize']>, id: number) =>
  s.questions.find((q) => q.questionId === id)!;
