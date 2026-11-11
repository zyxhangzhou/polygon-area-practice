import { describe, expect, it } from 'vitest';
import { summarize } from '../src/grading/progress.js';
import { Log, question, SNAPSHOT } from './grading-fixtures.js';

describe('统计范围', () => {
  it('没作答的题也计入总数', () => {
    const s = new Log().right(1).wrong(2).skip(3).summarize();
    expect(s.counts.total).toBe(12);
  });

  it('快照之外的记录报错', () => {
    expect(() => new Log().right(99).summarize()).toThrow(/快照之外/);
    expect(() => new Log().skip(99).summarize()).toThrow(/快照之外/);
    expect(() => new Log().event(99, 'video_started').summarize()).toThrow(/快照之外/);
  });

  it('快照内题目重复报错', () => {
    expect(() => new Log().summarize([...SNAPSHOT, SNAPSHOT[0]!])).toThrow(/重复/);
  });

  it('总题数为 0 时比率为 0', () => {
    const s = summarize([], [], [], []);
    expect(s.counts.total).toBe(0);
    expect(s.rates).toEqual({ firstTry: 0, completion: 0 });
  });
});

describe('每道题的分类', () => {
  const outcome = (log: Log, id: number) => {
    const q = question(log.summarize(), id);
    return [q.outcome, q.reviewReason];
  };

  it('一次做对', () => {
    expect(outcome(new Log().right(1), 1)).toEqual(['first_try', null]);
  });

  it('先错后对', () => {
    expect(outcome(new Log().wrong(1).right(1), 1)).toEqual(['corrected', null]);
  });

  it('跳过后打开图文解析，再第 1 次就答对', () => {
    expect(outcome(new Log().skip(1).event(1, 'explanation_text_opened').right(1), 1)).toEqual([
      'corrected',
      null,
    ]);
  });

  it('只开始播放视频也算看过解析', () => {
    expect(outcome(new Log().event(1, 'video_started').right(1), 1)).toEqual(['corrected', null]);
  });

  it('跳过后直接做对', () => {
    expect(outcome(new Log().skip(1).right(1), 1)).toEqual(['first_try', null]);
  });

  it('答对之后才看解析', () => {
    const log = new Log().right(1).event(1, 'video_started').event(1, 'video_completed');
    expect(outcome(log, 1)).toEqual(['first_try', null]);
  });

  it('其他题的解析不影响本题', () => {
    expect(outcome(new Log().event(2, 'explanation_text_opened').right(1), 1)).toEqual([
      'first_try',
      null,
    ]);
  });

  it('还没做对的三种原因', () => {
    const s = new Log().wrong(1).wrong(2).skip(2).summarize();
    expect(
      [question(s, 1), question(s, 2), question(s, 3)].map((q) => [q.outcome, q.reviewReason]),
    ).toEqual([
      ['not_yet', 'wrong'],
      ['not_yet', 'skipped'],
      ['not_yet', 'unanswered'],
    ]);
  });
});

describe('指标', () => {
  it('7 题一次做对、3 题订正、2 题没做对：58 / 83', () => {
    const log = new Log();
    for (let id = 1; id <= 7; id++) log.right(id);
    for (let id = 8; id <= 10; id++) log.wrong(id).right(id);
    log.skip(11).wrong(12);
    const s = log.summarize();
    expect(s.counts).toEqual({ total: 12, firstTry: 7, corrected: 3, notYet: 2 });
    expect(s.rates).toEqual({ firstTry: 58, completion: 83 });
  });

  it('只做 1 题且先错后对：0 / 8', () => {
    const s = new Log().wrong(1).right(1).summarize();
    expect(s.rates).toEqual({ firstTry: 0, completion: 8 });
  });

  it('进行中：3 题一次做对、1 题先错后对', () => {
    const s = new Log().right(1).right(2).right(3).wrong(4).right(4).summarize();
    expect(s.counts).toEqual({ total: 12, firstTry: 3, corrected: 1, notYet: 8 });
    expect(s.rates).toEqual({ firstTry: 25, completion: 33 });
  });
});

describe('行为事实', () => {
  it('第 4 题：答 60，播放并看完视频，再答对', () => {
    const log = new Log()
      .wrong(4, '60')
      .event(4, 'video_started')
      .event(4, 'video_completed')
      .right(4);
    const q = question(log.summarize(), 4);
    expect(q.outcome).toBe('corrected');
    expect(q.facts).toEqual({
      attemptCount: 2,
      wrongCount: 1,
      skipCount: 0,
      commonMistakes: ['60'],
      textOpened: false,
      videoStarted: true,
      videoCompleted: true,
    });
  });

  it('常见错误按首次出现顺序去重', () => {
    const log = new Log().wrong(1, '24').wrong(1, '12').wrong(1, '24').skip(1).skip(1);
    const q = question(log.summarize(), 1);
    expect(q.facts.commonMistakes).toEqual(['24', '12']);
    expect(q.facts.skipCount).toBe(2);
    expect(q.facts.wrongCount).toBe(3);
  });
});
