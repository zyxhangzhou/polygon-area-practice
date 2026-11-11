import { describe, expect, it } from 'vitest';
import { summarize } from '../src/grading/progress.js';
import { Log, question, SNAPSHOT } from './grading-fixtures.js';

const status = (log: Log, id: number) => question(log.summarize(), id).status;

describe('题目状态', () => {
  it('没有记录为 unanswered；学习事件不改变状态', () => {
    expect(status(new Log(), 1)).toBe('unanswered');
    expect(status(new Log().event(1, 'explanation_text_opened'), 1)).toBe('unanswered');
  });

  it('先跳过再答错为 wrong', () => {
    expect(status(new Log().skip(1).wrong(1), 1)).toBe('wrong');
  });

  it('先答错再跳过为 skipped', () => {
    expect(status(new Log().wrong(1).skip(1), 1)).toBe('skipped');
  });

  it('跳过后回来答对为 solved', () => {
    expect(status(new Log().skip(1).right(1), 1)).toBe('solved');
  });

  it('以 seq 为准，不看传入顺序', () => {
    // 跳过记录排在后面传入（例如 created_at 更晚），但 seq 更小
    const s = summarize(
      SNAPSHOT,
      [{ questionId: 1, isCorrect: false, matchedMistake: null, seq: 20 }],
      [{ questionId: 1, seq: 10 }],
      [],
    );
    expect(question(s, 1).status).toBe('wrong');
  });
});

describe('关卡点亮与解锁', () => {
  it('第 1 关始终解锁，其余未解锁', () => {
    const s = new Log().summarize();
    expect(s.stages.map((x) => x.unlocked)).toEqual([true, false, false, false]);
  });

  it('两题答对一题跳过：未点亮，下一关解锁', () => {
    const s = new Log().right(1).right(2).skip(3).summarize();
    expect(s.stages[0]).toMatchObject({ lit: false, solvedCount: 2, total: 3 });
    expect(s.stages[1]!.unlocked).toBe(true);
    expect(s.stages[2]!.unlocked).toBe(false);
  });

  it('全部答对才点亮', () => {
    const s = new Log().right(1).wrong(2).right(2).right(3).summarize();
    expect(s.stages[0]!.lit).toBe(true);
  });

  it('解锁不撤回：跳过后又答错', () => {
    const s = new Log().right(1).right(2).skip(3).wrong(3).summarize();
    expect(question(s, 3).status).toBe('wrong');
    expect(s.stages[1]!.unlocked).toBe(true);
  });

  it('有一题未作答则下一关不解锁', () => {
    const s = new Log().right(1).right(2).summarize();
    expect(s.stages[1]!.unlocked).toBe(false);
  });

  it('关卡顺序按快照 position', () => {
    const reversed = SNAPSHOT.map((x) => ({ ...x, position: 13 - x.position }));
    const s = new Log().summarize(reversed);
    expect(s.stages.map((x) => x.stageId)).toEqual([4, 3, 2, 1]);
    expect(s.currentQuestionId).toBe(12);
  });
});

describe('当前题', () => {
  it('优先 unanswered / wrong', () => {
    const s = new Log().skip(1).right(2).summarize();
    expect(s.currentQuestionId).toBe(3);
  });

  it('答错的题也算当前题', () => {
    const s = new Log().right(1).wrong(2).summarize();
    expect(s.currentQuestionId).toBe(2);
  });

  it('只剩跳过的题', () => {
    const log = new Log();
    for (let id = 1; id <= 12; id++) {
      if (id === 5) log.skip(id);
      else log.right(id);
    }
    expect(log.summarize().currentQuestionId).toBe(5);
  });

  it('全部答对为空', () => {
    const log = new Log();
    for (let id = 1; id <= 12; id++) log.right(id);
    expect(log.summarize().currentQuestionId).toBeNull();
  });

  it('不进入未解锁的关卡', () => {
    // 第 1 关：1 答对、2 跳过、3 未作答 → 第 2 关未解锁，当前题是 3
    const s = new Log().right(1).skip(2).summarize();
    expect(s.currentQuestionId).toBe(3);
  });
});

describe('能否完成练习', () => {
  it('10 题答对、2 题跳过', () => {
    const log = new Log();
    for (let id = 1; id <= 12; id++) {
      if (id === 4 || id === 9) log.skip(id);
      else log.right(id);
    }
    const s = log.summarize();
    expect(s.canFinish).toBe(true);
    expect(s.skippedCount).toBe(2);
  });

  it('还有答错的题', () => {
    const log = new Log();
    for (let id = 1; id <= 12; id++) {
      if (id === 7) log.wrong(id);
      else log.right(id);
    }
    expect(log.summarize().canFinish).toBe(false);
  });
});
