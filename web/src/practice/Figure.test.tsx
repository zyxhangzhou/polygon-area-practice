import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../../../server/src/content/questions';
import { Figure } from './Figure';

const numbersIn = (text: string) => text.match(/\d+(\.\d+)?/g) ?? [];

describe('Figure', () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))('第 %i 题能画出来且不显示答案', (_id, q) => {
    const { container } = render(<Figure figure={q.figure} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector('polygon')).toBeInTheDocument();
    // 坐标里不能有 NaN 或无穷大
    expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.flatMap(numbersIn)).not.toContain(q.answer);
  });

  it('逆运算题：所求的高标"?"，并标出面积', () => {
    const q3 = QUESTIONS.find((q) => q.id === 3)!;
    const { container } = render(<Figure figure={q3.figure} />);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toContain('?');
    expect(labels).toContain('面积 48 dm²');
    expect(labels).toContain('12 dm');
  });

  it('第 1 题标出底 8 cm 和高 5 cm', () => {
    const { container } = render(<Figure figure={QUESTIONS[0]!.figure} />);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['8 cm', '5 cm']));
  });
});
