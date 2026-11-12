import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { attemptResponse, sessionView } from '../test/fixtures';
import { Bear, type Mood } from './Bear';
import { feedbackLine, GENERIC_WRONG } from './lines';

const result = (r: Parameters<typeof attemptResponse>[0]) =>
  attemptResponse(r, sessionView()).result!;

const CASES = {
  一次做对: result({ questionId: 1, correct: true }),
  订正后做对: result({ questionId: 1, correct: true, outcome: 'corrected' }),
  答错并命中常见错误: result({
    questionId: 4,
    correct: false,
    mistakeHint: '10 × 6 = 60 是两个三角形拼成的平行四边形的面积，别忘了 ÷ 2。',
  }),
  答错没有提示: result({ questionId: 4, correct: false }),
  点亮: result({ questionId: 6, correct: true, stageLit: true }),
};

describe('feedbackLine', () => {
  it('一次做对：开心', () => {
    expect(feedbackLine(CASES.一次做对, '面包店')).toMatchObject({
      mood: 'happy',
      title: '一次就做对了',
    });
  });

  it('订正后做对：竖起大拇指，措辞不同于一次做对', () => {
    const line = feedbackLine(CASES.订正后做对, '面包店');
    expect(line.mood).toBe('proud');
    expect(line.title).not.toBe(feedbackLine(CASES.一次做对, '面包店').title);
    expect(line.kicker).toBe('改对了');
  });

  it('答错：歪头思考，说后端的常见错误提示；没有时用通用提示', () => {
    expect(feedbackLine(CASES.答错并命中常见错误, '帐篷营地')).toMatchObject({
      mood: 'think',
      text: '10 × 6 = 60 是两个三角形拼成的平行四边形的面积，别忘了 ÷ 2。',
    });
    expect(feedbackLine(CASES.答错没有提示, '帐篷营地').text).toBe(GENERIC_WRONG);
  });

  it('点亮：举手庆祝，说出建筑名', () => {
    expect(feedbackLine(CASES.点亮, '帐篷营地')).toMatchObject({
      mood: 'cheer',
      title: '帐篷营地点亮了',
    });
  });

  it.each(Object.entries(CASES))('%s：不说"看懂""掌握"，不堆叠感叹号', (_name, r) => {
    const line = feedbackLine(r, '面包店');
    const all = `${line.kicker}${line.title}${line.text}`;
    expect(all).not.toMatch(/看懂|掌握/);
    expect(all).not.toMatch(/！！|!!/);
  });
});

describe('Bear', () => {
  it.each<[Mood, string]>([
    ['idle', '圆圆'],
    ['happy', '圆圆：开心'],
    ['proud', '圆圆：竖起大拇指'],
    ['think', '圆圆：歪头思考'],
    ['cheer', '圆圆：举手庆祝'],
  ])('%s 有文字替代', (mood, label) => {
    const { getByRole } = render(<Bear mood={mood} />);
    expect(getByRole('img', { name: label })).toHaveAttribute('data-mood', mood);
  });
});
