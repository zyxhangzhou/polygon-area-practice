import type { SummaryResponse } from '../api/types';

/**
 * 鼓励语与学习建议（study-advice 规格、design D3）。
 * 只依据总结中的分类、原因、行为事实和知识点；措辞只描述发生过的行为，不说"看懂""掌握"。
 */

type SummaryQuestion = SummaryResponse['questions'][number];
type AdviceInput = Pick<SummaryResponse, 'counts'> & {
  questions: Pick<
    SummaryQuestion,
    'position' | 'outcome' | 'reviewReason' | 'facts' | 'knowledgePoint'
  >[];
};

export interface Advice {
  encouragement: string;
  suggestions: string[];
}

/** "第 2、5 题" */
const nums = (qs: { position: number }[]) =>
  `第 ${[...qs]
    .sort((a, b) => a.position - b.position)
    .map((q) => q.position)
    .join('、')} 题`;

function encouragementOf({ total, firstTry, corrected }: AdviceInput['counts']): string {
  const solved = firstTry + corrected;
  if (total > 0 && firstTry === total) return `${total} 道题全部一次做对，太厉害了！`;
  if (total > 0 && solved === total)
    return `全部做对了！其中 ${corrected} 道题是改正后做对的，改正错误也是进步。`;
  if (solved * 2 >= total) return `这次做对了 ${solved} 道题，继续加油，把剩下的也拿下！`;
  return '你已经开始练习了！先回看图文解析，再练一次会更有把握。';
}

/** 答对前的行为，按具体程度从高到低排列 */
const BEHAVIORS = [
  ['videoCompletedBeforeSolved', '看完了视频解析'],
  ['videoStartedBeforeSolved', '播放了视频解析'],
  ['textOpenedBeforeSolved', '打开了图文解析'],
] as const;

/** 订正后做对的题在答对前发生过的、最具体的行为 */
function behaviorBefore(q: AdviceInput['questions'][number]): string | null {
  return BEHAVIORS.find(([key]) => q.facts[key])?.[1] ?? null;
}

export function buildAdvice(summary: AdviceInput): Advice {
  const qs = summary.questions;
  const suggestions: string[] = [];

  // 1. 看了解析或视频后做对：按行为分组，组之间用顿号连接
  const corrected = qs.filter((q) => q.outcome === 'corrected');
  const parts = BEHAVIORS.map(([, text]) => {
    const group = corrected.filter((q) => behaviorBefore(q) === text);
    return group.length > 0 ? `${nums(group)}${text}` : null;
  }).filter((p) => p !== null);
  if (parts.length > 0) {
    suggestions.push(`${parts.join('，')}后做对了，遇到难题先看解析是个好办法。`);
  }

  // 2. 自己改正
  const selfFixed = corrected.filter((q) => behaviorBefore(q) === null && q.facts.wrongCount > 0);
  if (selfFixed.length > 0) suggestions.push(`${nums(selfFixed)}答错后自己改正了，很棒！`);

  // 3. 还没改对
  const wrong = qs.filter((q) => q.reviewReason === 'wrong');
  if (wrong.length > 0) {
    const mistakes = wrong
      .filter((q) => q.facts.commonMistakes.length > 0)
      .map((q) => `第 ${q.position} 题写过 ${q.facts.commonMistakes.join('、')}`);
    const note = mistakes.length > 0 ? `（${mistakes.join('；')}）` : '';
    suggestions.push(`${nums(wrong)}还没改对${note}，建议先打开图文解析，再做一次。`);
  }

  // 4. 跳过了
  const skipped = qs.filter((q) => q.reviewReason === 'skipped');
  if (skipped.length > 0) suggestions.push(`${nums(skipped)}跳过了，可以先从图文解析开始。`);

  // 5. 建议复习的知识点：只取练过的题，依次为答错没改对、经过订正、跳过
  const reviewOrder = [...wrong, ...corrected, ...skipped];
  const points = [...new Set(reviewOrder.map((q) => q.knowledgePoint))];
  if (points.length > 0) suggestions.push(`建议复习：${points.join('；')}。`);

  // 6. 没有作答：单独一句，不列知识点
  const unanswered = qs.filter((q) => q.reviewReason === 'unanswered');
  if (unanswered.length > 0)
    suggestions.push(`还有 ${unanswered.length} 题没练，下次可以继续挑战。`);

  // 7. 全部一次做对
  if (suggestions.length === 0) suggestions.push('可以再练一次，看看能不能保持全对。');

  return { encouragement: encouragementOf(summary.counts), suggestions };
}
