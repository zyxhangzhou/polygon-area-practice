import { describe, expect, it } from 'vitest';
import { parseHighlights, stripHighlights } from '../src/content/highlight.js';
import { QUESTIONS, STAGES } from '../src/content/questions.js';
import { validateSeed } from '../src/db/seed.js';
import { INVALID_CASES, VALID_CASES } from './highlight-cases.js';

const marks = (text: string) => {
  const r = parseHighlights(text);
  if ('error' in r) throw new Error(r.error);
  return r.segments.filter((s) => s.kind !== null);
};

describe('重点标记的解析', () => {
  it.each(VALID_CASES)('合法：$text', ({ text, segments }) => {
    expect(parseHighlights(text)).toEqual({ segments });
  });

  it.each(INVALID_CASES)('不合法：%s', (text) => {
    expect(parseHighlights(text)).toHaveProperty('error');
  });

  it('去掉标记只留文字', () => {
    expect(stripHighlights('一定{k:别忘了 ÷ 2}！')).toBe('一定别忘了 ÷ 2！');
  });
});

describe('题库的重点标记', () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))(
    '第 %i 题：条件、公式、关键都有，且每处不超过 3 个',
    (_id, q) => {
      const stepMarks = q.explanation.steps.map(marks);
      const tipMarks = marks(q.explanation.tip);
      const all = stepMarks.flat();
      expect(all.some((m) => m.kind === 'c')).toBe(true);
      expect(all.some((m) => m.kind === 'f')).toBe(true);
      expect(tipMarks.some((m) => m.kind === 'k')).toBe(true);
      for (const list of [...stepMarks, tipMarks]) expect(list.length).toBeLessThanOrEqual(3);
    },
  );

  it('条件标记中的数字都来自题干', () => {
    for (const q of QUESTIONS) {
      for (const m of q.explanation.steps.flatMap(marks).filter((x) => x.kind === 'c')) {
        for (const n of m.text.match(/\d+(\.\d+)?/g) ?? [])
          expect(q.prompt, `第 ${q.id} 题的条件"${m.text}"`).toContain(n);
      }
    }
  });

  const withExplanation = (id: number, patch: { steps?: string[]; tip?: string }) =>
    QUESTIONS.map((q) => (q.id === id ? { ...q, explanation: { ...q.explanation, ...patch } } : q));

  it('标记不合法时种子被拒绝，并指出题目', () => {
    const q4 = QUESTIONS.find((q) => q.id === 4)!;
    const steps = [...q4.explanation.steps];
    steps[0] = '看图找条件：{x:底是 10 cm}，{c:高是 6 cm}。';
    expect(() =>
      validateSeed({ stages: STAGES, questions: withExplanation(4, { steps }) }),
    ).toThrow(/第 4 题[\s\S]*重点标记不合法/);
  });

  it('缺少条件或公式、提醒缺少关键、超过 3 个时种子被拒绝', () => {
    const q1 = QUESTIONS.find((q) => q.id === 1)!;
    const plain = q1.explanation.steps.map(stripHighlights);
    expect(() =>
      validateSeed({ stages: STAGES, questions: withExplanation(1, { steps: plain }) }),
    ).toThrow(/至少标出 1 处条件[\s\S]*至少标出 1 处公式/);
    expect(() =>
      validateSeed({
        stages: STAGES,
        questions: withExplanation(1, { tip: stripHighlights(q1.explanation.tip) }),
      }),
    ).toThrow(/易错提醒至少标出 1 处关键/);
    const crowded = [...q1.explanation.steps];
    crowded[0] = '{c:一}{c:二}{c:三}{c:四}';
    expect(() =>
      validateSeed({ stages: STAGES, questions: withExplanation(1, { steps: crowded }) }),
    ).toThrow(/4 处重点标记，最多 3 处/);
  });
});
