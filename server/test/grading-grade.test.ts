import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/content/questions.js';
import { gradeAnswer } from '../src/grading/grade.js';

const q4 = QUESTIONS.find((q) => q.id === 4)!;

describe('判题', () => {
  it('30、30.0、30.00 都判对', () => {
    const q = { answer: '30', commonMistakes: [] };
    for (const raw of ['30', '30.0', '30.00']) {
      expect(gradeAnswer(raw, q)).toMatchObject({
        kind: 'graded',
        correct: true,
        normalizedValue: '30',
      });
    }
  });

  it('数据库形式的标准答案', () => {
    expect(gradeAnswer('6.5', { answer: '6.50', commonMistakes: [] })).toMatchObject({
      correct: true,
    });
  });

  it('没有浮点误差', () => {
    expect(gradeAnswer('0.30', { answer: '0.3', commonMistakes: [] })).toMatchObject({
      correct: true,
    });
  });

  it('第 4 题输入 60.0 匹配常见错误 60', () => {
    const hint = q4.commonMistakes.find((m) => m.answer === '60')!.hint;
    expect(gradeAnswer('60.0', q4)).toEqual({
      kind: 'graded',
      counted: true,
      correct: false,
      normalizedValue: '60',
      matchedMistake: { answer: '60', hint },
    });
  });

  it('普通错误答案没有匹配', () => {
    expect(gradeAnswer('31', q4)).toMatchObject({ correct: false, matchedMistake: null });
  });

  it('答对不返回常见错误', () => {
    expect(gradeAnswer(q4.answer, q4)).toMatchObject({ correct: true, matchedMistake: null });
  });

  it('不合法输入不计次', () => {
    expect(gradeAnswer('1e3', q4)).toMatchObject({
      kind: 'invalid',
      counted: false,
      reason: 'invalid_format',
    });
  });
});

describe('题库回归：12 道题都能正确判题', () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))('第 %i 题', (_id, q) => {
    expect(gradeAnswer(q.answer, q)).toMatchObject({ correct: true });
    // 数据库读出的 numeric 形如 "48.00"
    const dbForm = { answer: Number(q.answer).toFixed(2), commonMistakes: q.commonMistakes };
    expect(gradeAnswer(q.answer, dbForm)).toMatchObject({ correct: true });
    for (const m of q.commonMistakes) {
      const r = gradeAnswer(m.answer, dbForm);
      expect(r).toMatchObject({ correct: false, matchedMistake: { hint: m.hint } });
    }
  });
});
