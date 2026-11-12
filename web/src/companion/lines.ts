import type { AttemptResponse } from '../api/types';
import type { Mood } from './Bear';

type AttemptResult = NonNullable<AttemptResponse['result']>;

export type Line = { mood: Mood; kicker: string; title: string; text: string };

export const GENERIC_WRONG = '还差一点。再看看图上标出的条件，也可以先看图文解析。';

/**
 * 圆圆对一次判题结果说的话（companion-feedback，design D4）。
 * 只描述发生过的事，不说"看懂了""掌握了"；答错时用后端返回的常见错误提示。
 */
export function feedbackLine(result: AttemptResult, buildingName: string | null): Line {
  if (!result.correct) {
    return {
      mood: 'think',
      kicker: '还差一步',
      title: '再看一看',
      text: result.mistakeHint ?? GENERIC_WRONG,
    };
  }
  if (result.stageLit && buildingName) {
    const corrected = result.outcome === 'corrected';
    return {
      mood: 'cheer',
      kicker: corrected ? '改对了 · 本关完成' : '本关完成',
      title: `${buildingName}点亮了`,
      text: corrected ? '改正之后，这一关的三道题都做对了。' : '这一关的三道题都做对了。',
    };
  }
  if (result.outcome === 'corrected') {
    return {
      mood: 'proud',
      kicker: '改对了',
      title: '改正成功',
      text: '先找到问题，再动手改正，这一步很关键。',
    };
  }
  return { mood: 'happy', kicker: '做对了', title: '一次就做对了', text: '干净利落，继续下一题。' };
}
