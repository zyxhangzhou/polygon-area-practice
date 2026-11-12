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

describe('答错后的辅助提示', () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))(
    '第 %i 题：有提示图形或辅助线、文字说明，且不含答案',
    (_id, q) => {
      const { container, getByRole } = render(<Figure figure={q.figure} hint />);
      const svg = container.querySelector('svg')!;
      expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
      const marks = svg.querySelectorAll(
        '.figure-hint-shape, .figure-hint-line, .figure-hint-mark',
      );
      expect(marks.length).toBeGreaterThan(0);
      const note = container.querySelector('figcaption')!.textContent ?? '';
      expect(note.length).toBeGreaterThan(0);
      expect(getByRole('img').getAttribute('aria-label')).toContain(note);
      // 原有标注不变，提示文字里没有数字（不会泄露答案或算式结果）
      const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
      expect(labels.flatMap(numbersIn)).not.toContain(q.answer);
      expect(numbersIn(note)).toEqual([]);
    },
  );

  it('三角形：补出的三角形与原图拼成平行四边形', () => {
    const q4 = QUESTIONS.find((q) => q.id === 4)!;
    const { container } = render(<Figure figure={q4.figure} hint />);
    expect(container.querySelectorAll('.figure-hint-shape')).toHaveLength(1);
    expect(container.textContent).toContain('拼上，就成了平行四边形');
  });

  it('不传 hint 时没有提示', () => {
    const { container } = render(<Figure figure={QUESTIONS[3]!.figure} />);
    expect(container.querySelector('.figure-hint-shape, figcaption')).toBeNull();
  });
});
