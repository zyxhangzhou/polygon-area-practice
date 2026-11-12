/** 重点标记解析的共用用例：后端 highlight.test.ts 与前端 highlight.test.ts 用同一组（explanation-highlights D4） */
export const VALID_CASES: {
  text: string;
  segments: { kind: 'c' | 'f' | 'k' | null; text: string }[];
}[] = [
  { text: '没有标记', segments: [{ kind: null, text: '没有标记' }] },
  {
    text: '看图找条件：{c:底是 10 cm}，{c:高是 6 cm}。',
    segments: [
      { kind: null, text: '看图找条件：' },
      { kind: 'c', text: '底是 10 cm' },
      { kind: null, text: '，' },
      { kind: 'c', text: '高是 6 cm' },
      { kind: null, text: '。' },
    ],
  },
  {
    text: '{f:10 × 6 ÷ 2 = 30（cm²）}',
    segments: [{ kind: 'f', text: '10 × 6 ÷ 2 = 30（cm²）' }],
  },
  {
    text: '一定{k:别忘了 ÷ 2}！',
    segments: [
      { kind: null, text: '一定' },
      { kind: 'k', text: '别忘了 ÷ 2' },
      { kind: null, text: '！' },
    ],
  },
];

export const INVALID_CASES: string[] = [
  '{x:未知类型}',
  '{c:没有结尾',
  '多了一个}',
  '{c:外面{k:嵌套}}',
  '{c:}',
  '{c: }',
  '{底是 10 cm}',
];
