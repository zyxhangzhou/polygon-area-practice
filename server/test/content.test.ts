import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/content/questions.js';
import type { Figure } from '../src/content/schema.js';
import { validateSeed } from '../src/db/seed.js';
import { STAGES } from '../src/content/questions.js';

/** 按图形参数用公式计算面积 */
function area(f: Figure): number {
  switch (f.shape) {
    case 'parallelogram':
      return f.area ?? f.base! * f.height!;
    case 'triangle':
      return (f.base * f.height) / 2;
    case 'right-triangle':
      return (f.legA * f.legB) / 2;
    case 'trapezoid':
      return ((f.top + f.bottom) * f.height) / 2;
    case 'house':
      return f.width * f.wallHeight + (f.width * f.roofHeight) / 2;
    case 'l-shape':
      return f.width * f.height - f.cutWidth * f.cutHeight;
  }
}

/** 不是直接求面积的题：给出由面积换算答案的方式 */
const DERIVED: Record<number, (f: Figure) => number> = {
  3: (f) => (f.shape === 'parallelogram' ? f.area! / f.base! : NaN), // 已知面积和底求高
  12: (f) => area(f) * 3, // 每平方米 3 kg
};

describe('题目自洽性：图形参数按公式算出的结果等于答案', () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))('第 %i 题', (_id, q) => {
    const computed = (DERIVED[q.id] ?? area)(q.figure);
    expect(computed.toFixed(2)).toBe(Number(q.answer).toFixed(2));
  });

  it('逆运算题的图形参数不包含所求的边', () => {
    const inverse = QUESTIONS.filter((q) => q.figure.shape === 'parallelogram' && q.figure.unknown);
    expect(inverse.map((q) => q.id)).toEqual([3]);
    for (const q of inverse) {
      const f = q.figure as Extract<Figure, { shape: 'parallelogram' }>;
      expect(f[f.unknown!], `第 ${q.id} 题`).toBeUndefined();
      expect(JSON.stringify(f)).not.toContain(`:${Number(q.answer)},`);
    }
  });

  it('图形参数里带上所求的边会被结构校验拒绝', () => {
    const q3 = QUESTIONS.find((q) => q.id === 3)!;
    const leaked = { ...q3, figure: { ...q3.figure, height: 4 } };
    expect(() =>
      validateSeed({ stages: STAGES, questions: [...QUESTIONS.filter((q) => q.id !== 3), leaked] }),
    ).toThrow(/不能出现在图形参数中/);
  });

  it('第 3 题题干中的面积与图形参数一致', () => {
    const q3 = QUESTIONS.find((q) => q.id === 3)!;
    expect(q3.prompt).toContain(`${area(q3.figure)} dm²`);
  });

  it('常见错误答案不等于正确答案', () => {
    for (const q of QUESTIONS) {
      for (const m of q.commonMistakes)
        expect(Number(m.answer), `第 ${q.id} 题`).not.toBe(Number(q.answer));
    }
  });

  it('全部种子数据通过结构校验', () => {
    expect(() => validateSeed({ stages: STAGES, questions: QUESTIONS })).not.toThrow();
  });
});
