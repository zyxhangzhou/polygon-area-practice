import { describe, expect, it } from 'vitest';
import { buildAdvice } from './advice';

type Q = Parameters<typeof buildAdvice>[0]['questions'][number];
const facts = (f: Partial<Q['facts']> = {}): Q['facts'] => ({
  attemptCount: 1,
  wrongCount: 0,
  skipCount: 0,
  commonMistakes: [],
  textOpened: false,
  videoStarted: false,
  videoCompleted: false,
  textOpenedBeforeSolved: false,
  videoStartedBeforeSolved: false,
  videoCompletedBeforeSolved: false,
  ...f,
});
const first = (position: number): Q => ({
  position,
  outcome: 'first_try',
  reviewReason: null,
  facts: facts(),
  knowledgePoint: `知识点${position}`,
});
const corrected = (position: number, f: Partial<Q['facts']> = {}): Q => ({
  ...first(position),
  outcome: 'corrected',
  facts: facts({ attemptCount: 2, wrongCount: 1, ...f }),
});
const notYet = (position: number, reason: 'wrong' | 'skipped' | 'unanswered', f = {}): Q => ({
  ...first(position),
  outcome: 'not_yet',
  reviewReason: reason,
  facts: facts(f),
});

/** 用 12 题构造总结；未指定的题都是一次做对 */
function summary(overrides: Q[]) {
  const questions = Array.from({ length: 12 }, (_, i) => first(i + 1)).map(
    (q) => overrides.find((o) => o.position === q.position) ?? q,
  );
  const count = (o: Q['outcome']) => questions.filter((q) => q.outcome === o).length;
  return {
    counts: {
      total: 12,
      firstTry: count('first_try'),
      corrected: count('corrected'),
      notYet: count('not_yet'),
    },
    questions,
  };
}

const all = (a: ReturnType<typeof buildAdvice>) => [a.encouragement, ...a.suggestions].join('\n');

describe('鼓励语', () => {
  it('全部一次做对', () => {
    expect(buildAdvice(summary([])).encouragement).toContain('全部一次做对');
  });

  it('有订正的全部做对：提到订正的题数', () => {
    const a = buildAdvice(summary([corrected(2), corrected(5)]));
    expect(a.encouragement).toContain('2 道题是改正后做对的');
  });

  it('做对不少于一半：说出做对的题数', () => {
    const a = buildAdvice(summary([7, 8, 9, 10, 11, 12].map((p) => notYet(p, 'unanswered'))));
    expect(a.encouragement).toContain('做对了 6 道题');
  });

  it('做对不到一半：鼓励回看解析后再练一次', () => {
    const a = buildAdvice(
      summary([4, 5, 6, 7, 8, 9, 10, 11, 12].map((p) => notYet(p, 'unanswered'))),
    );
    expect(a.encouragement).toContain('再练一次');
  });
});

describe('建议', () => {
  it('看完视频后做对', () => {
    const a = buildAdvice(
      summary([
        corrected(4, {
          commonMistakes: ['60'],
          videoStarted: true,
          videoCompleted: true,
          videoStartedBeforeSolved: true,
          videoCompletedBeforeSolved: true,
        }),
      ]),
    );
    expect(a.suggestions[0]).toBe('第 4 题看完了视频解析后做对了，遇到难题先看解析是个好办法。');
  });

  it('答对之后才看视频：不说看了视频后做对，只说自己改正', () => {
    const a = buildAdvice(summary([corrected(4, { videoStarted: true, videoCompleted: true })]));
    expect(all(a)).not.toContain('视频');
    expect(a.suggestions).toContain('第 4 题答错后自己改正了，很棒！');
  });

  it('行为优先级：看完视频 > 播放视频 > 打开图文解析；不同行为合成一句', () => {
    const a = buildAdvice(
      summary([
        corrected(2, { textOpenedBeforeSolved: true, videoStartedBeforeSolved: true }),
        corrected(4, {
          textOpenedBeforeSolved: true,
          videoStartedBeforeSolved: true,
          videoCompletedBeforeSolved: true,
        }),
        corrected(6, { textOpenedBeforeSolved: true }),
      ]),
    );
    expect(a.suggestions[0]).toBe(
      '第 4 题看完了视频解析，第 2 题播放了视频解析，第 6 题打开了图文解析后做对了，遇到难题先看解析是个好办法。',
    );
  });

  it('同类合并：两道自己改正的题只有一条建议', () => {
    const a = buildAdvice(summary([corrected(5), corrected(2)]));
    expect(a.suggestions.filter((s) => s.includes('自己改正'))).toEqual([
      '第 2、5 题答错后自己改正了，很棒！',
    ]);
  });

  it('还没改对：附上写过的常见错误答案，建议先打开图文解析', () => {
    const a = buildAdvice(
      summary([
        notYet(9, 'wrong', { wrongCount: 2, commonMistakes: ['60'] }),
        notYet(10, 'wrong', { wrongCount: 1 }),
      ]),
    );
    expect(a.suggestions).toContain(
      '第 9、10 题还没改对（第 9 题写过 60），建议先打开图文解析，再做一次。',
    );
  });

  it('跳过了', () => {
    const a = buildAdvice(summary([notYet(7, 'skipped', { skipCount: 1 })]));
    expect(a.suggestions).toContain('第 7 题跳过了，可以先从图文解析开始。');
  });

  it('提前结束：没作答的题单独一句，不列它们的知识点', () => {
    const rest = Array.from({ length: 10 }, (_, i) =>
      notYet(i + 3, 'unanswered', { attemptCount: 0 }),
    );
    const a = buildAdvice(summary(rest));
    expect(a.suggestions).toContain('还有 10 题没练，下次可以继续挑战。');
    expect(a.suggestions.some((s) => s.startsWith('建议复习'))).toBe(false);
  });

  it('建议复习：依次为答错没改对、经过订正、跳过的知识点，去重；不含没作答的', () => {
    const a = buildAdvice(
      summary([
        { ...notYet(7, 'skipped'), knowledgePoint: '跳过的点' },
        { ...corrected(2), knowledgePoint: '订正的点' },
        { ...corrected(5), knowledgePoint: '答错的点' },
        { ...notYet(9, 'wrong'), knowledgePoint: '答错的点' },
        { ...notYet(12, 'unanswered'), knowledgePoint: '没作答的点' },
      ]),
    );
    expect(a.suggestions).toContain('建议复习：答错的点；订正的点；跳过的点。');
  });

  it('全部一次做对：唯一的建议是再练一次', () => {
    expect(buildAdvice(summary([])).suggestions).toEqual(['可以再练一次，看看能不能保持全对。']);
  });

  it('类别顺序固定：看解析后做对、自己改正、还没改对、跳过、复习知识点、没作答', () => {
    const a = buildAdvice(
      summary([
        corrected(1, { textOpenedBeforeSolved: true }),
        corrected(2),
        notYet(3, 'wrong'),
        notYet(4, 'skipped'),
        notYet(5, 'unanswered'),
      ]),
    );
    const keys = ['后做对了', '自己改正', '还没改对', '跳过了', '建议复习', '没练'];
    expect(a.suggestions.map((s) => keys.findIndex((k) => s.includes(k)))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('各种输入下都不出现"看懂""掌握"', () => {
    const inputs = [
      summary([]),
      summary([
        corrected(4, { videoCompletedBeforeSolved: true }),
        notYet(9, 'wrong', { commonMistakes: ['60'] }),
      ]),
      summary(Array.from({ length: 12 }, (_, i) => notYet(i + 1, 'unanswered'))),
    ];
    for (const s of inputs) expect(all(buildAdvice(s))).not.toMatch(/看懂|掌握/);
  });

  it('相同输入得到相同输出', () => {
    const s = summary([corrected(4, { textOpenedBeforeSolved: true }), notYet(7, 'skipped')]);
    expect(buildAdvice(s)).toEqual(buildAdvice(structuredClone(s)));
  });
});
