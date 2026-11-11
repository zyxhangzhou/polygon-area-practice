import type { CommonMistake } from '../content/schema.js';
import { canonical, parseDecimal } from './decimal.js';
import { parseAnswerInput, type InvalidReason } from './input.js';

export type GradeResult =
  /** 不合法输入：不计入作答次数，不写 attempts */
  | { kind: 'invalid'; counted: false; reason: InvalidReason; message: string }
  | {
      kind: 'graded';
      counted: true;
      correct: boolean;
      /** 写入 attempts.normalized_value */
      normalizedValue: string;
      /** 答错且匹配到常见错误时给出；answer 为规范值，写入 attempts.matched_mistake */
      matchedMistake: { answer: string; hint: string } | null;
    };

export interface GradableQuestion {
  /** 种子形式 "48" 或数据库读出的 "48.00" 都可以 */
  answer: string;
  commonMistakes: readonly CommonMistake[];
}

export function gradeAnswer(raw: string, question: GradableQuestion): GradeResult {
  const input = parseAnswerInput(raw);
  if (!input.ok)
    return { kind: 'invalid', counted: false, reason: input.reason, message: input.message };

  const value = parseDecimal(input.value);
  const correct = value === parseDecimal(question.answer);
  let matchedMistake: { answer: string; hint: string } | null = null;
  if (!correct) {
    const m = question.commonMistakes.find((x) => parseDecimal(x.answer) === value);
    if (m) matchedMistake = { answer: canonical(m.answer), hint: m.hint };
  }
  return { kind: 'graded', counted: true, correct, normalizedValue: input.value, matchedMistake };
}
