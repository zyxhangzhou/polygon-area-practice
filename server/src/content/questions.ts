import type { QuestionSeed, StageSeed } from './schema.js';

/**
 * 题库内容（大纲 §2.3）。答案用字符串书写，避免经过浮点数。
 * 修改后重新启动服务（或执行 `npm run db:seed -w server`）即按 ID 更新到数据库。
 */

export const STAGES: StageSeed[] = [
  {
    id: 1,
    position: 1,
    name: '平行四边形',
    buildingName: '面包店',
    intro: '把平行四边形剪一剪、拼一拼，就变成了长方形。一起来盖小镇的面包店吧！',
  },
  {
    id: 2,
    position: 2,
    name: '三角形',
    buildingName: '帐篷营地',
    intro: '两个完全一样的三角形能拼成一个平行四边形。帐篷营地等你来搭！',
  },
  {
    id: 3,
    position: 3,
    name: '梯形',
    buildingName: '小桥',
    intro: '两个完全一样的梯形也能拼成平行四边形。把小河上的桥修起来吧！',
  },
  {
    id: 4,
    position: 4,
    name: '组合图形',
    buildingName: '小镇广场',
    intro: '复杂的图形分一分、补一补，就变成学过的图形。最后来建小镇广场！',
  },
];

export const QUESTIONS: QuestionSeed[] = [
  // ---------- ① 平行四边形·面包店 ----------
  {
    id: 1,
    stageId: 1,
    positionInStage: 1,
    prompt: '面包店的招牌是一个平行四边形，底是 8 cm，高是 5 cm。招牌的面积是多少？',
    figure: { shape: 'parallelogram', base: 8, height: 5, lengthUnit: 'cm' },
    answer: '40',
    unit: 'cm²',
    explanation: {
      steps: [
        '看图找条件：底是 8 cm，高是 5 cm。',
        '选公式：平行四边形剪拼成长方形后，长方形的长就是底，宽就是高，所以平行四边形面积 = 底 × 高。',
        '代入计算：8 × 5 = 40（cm²）。',
      ],
      tip: '平行四边形面积就是"底 × 高"，不用 ÷ 2。',
    },
    videoUrl: '/videos/q01.mp4',
    commonMistakes: [
      { answer: '20', hint: '平行四边形面积就是底 × 高，不用 ÷ 2 哦。' },
      { answer: '13', hint: '面积要用乘法，把底和高相乘，不是相加。' },
    ],
    knowledgePoint: '平行四边形面积公式',
  },
  {
    id: 2,
    stageId: 1,
    positionInStage: 2,
    prompt: '面包店门前有一块平行四边形的地砖区，底是 6.5 m，高是 4 m。这块地的面积是多少？',
    figure: { shape: 'parallelogram', base: 6.5, height: 4, lengthUnit: 'm' },
    answer: '26',
    unit: 'm²',
    explanation: {
      steps: [
        '看图找条件：底是 6.5 m，高是 4 m。',
        '选公式：平行四边形面积 = 底 × 高。',
        '代入计算：6.5 × 4 = 26（m²）。可以先算 6 × 4 = 24，再算 0.5 × 4 = 2，合起来是 26。',
      ],
      tip: '小数乘整数时，先按整数乘，再数一数因数里有几位小数，给积点上小数点。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '13', hint: '平行四边形面积是底 × 高，不用除以 2。' },
      {
        answer: '260',
        hint: '别忘了点小数点：先算 65 × 4 = 260，6.5 有一位小数，积也要点出一位小数，得 26.0，也就是 26。',
      },
    ],
    knowledgePoint: '平行四边形面积（小数）',
  },
  {
    id: 3,
    stageId: 1,
    positionInStage: 3,
    prompt: '面包店的橱窗是一个平行四边形，面积是 48 dm²，底是 12 dm。它的高是多少？',
    figure: { shape: 'parallelogram', base: 12, area: 48, lengthUnit: 'dm', unknown: 'height' },
    answer: '4',
    unit: 'dm',
    explanation: {
      steps: [
        '看图找条件：面积是 48 dm²，底是 12 dm，要求的是高。',
        '选公式：面积 = 底 × 高，反过来，高 = 面积 ÷ 底。',
        '代入计算：48 ÷ 12 = 4（dm）。验算：12 × 4 = 48，对了！',
      ],
      tip: '已知面积求高，要用除法；求出来的是长度，单位是 dm，不是 dm²。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '576', hint: '这题是已知面积求高，要用面积 ÷ 底，不是相乘。' },
      { answer: '2', hint: '平行四边形的公式没有 ÷ 2，高 = 面积 ÷ 底就可以了。' },
    ],
    knowledgePoint: '平行四边形面积公式的逆运算',
  },

  // ---------- ② 三角形·帐篷营地 ----------
  {
    id: 4,
    stageId: 2,
    positionInStage: 1,
    prompt:
      '营地里的一顶帐篷，正面是一个三角形，底是 10 cm，高是 6 cm（模型尺寸）。这个三角形的面积是多少？',
    figure: { shape: 'triangle', base: 10, height: 6, lengthUnit: 'cm' },
    answer: '30',
    unit: 'cm²',
    explanation: {
      steps: [
        '看图找条件：底是 10 cm，高是 6 cm。',
        '想一想：两个完全一样的三角形可以拼成一个平行四边形，平行四边形的面积是底 × 高，一个三角形只占一半，所以三角形面积 = 底 × 高 ÷ 2。',
        '代入计算：10 × 6 ÷ 2 = 30（cm²）。',
      ],
      tip: '三角形面积一定别忘了 ÷ 2！底 × 高算出来的是拼成的平行四边形的面积。',
    },
    videoUrl: '/videos/q04.mp4',
    commonMistakes: [
      { answer: '60', hint: '10 × 6 = 60 是两个三角形拼成的平行四边形的面积，别忘了 ÷ 2。' },
      { answer: '16', hint: '面积要用乘法：底 × 高 ÷ 2，不是把底和高相加。' },
    ],
    knowledgePoint: '三角形面积公式（推导：两个三角形拼成平行四边形）',
  },
  {
    id: 5,
    stageId: 2,
    positionInStage: 2,
    prompt: '营地的三角形小旗，底是 4.2 m，高是 3 m。小旗的面积是多少？',
    figure: { shape: 'triangle', base: 4.2, height: 3, lengthUnit: 'm' },
    answer: '6.3',
    unit: 'm²',
    explanation: {
      steps: [
        '看图找条件：底是 4.2 m，高是 3 m。',
        '选公式：三角形面积 = 底 × 高 ÷ 2。',
        '代入计算：4.2 × 3 = 12.6，12.6 ÷ 2 = 6.3（m²）。',
      ],
      tip: '先乘后除，每一步都看好小数点的位置。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '12.6', hint: '12.6 是底 × 高，三角形还要再 ÷ 2。' },
      { answer: '63', hint: '检查一下小数点：4.2 × 3 ÷ 2 的结果是一位小数。' },
    ],
    knowledgePoint: '三角形面积（小数）',
  },
  {
    id: 6,
    stageId: 2,
    positionInStage: 3,
    prompt:
      '营地有一块直角三角形的草坪，两条直角边分别是 9 cm 和 12 cm（图纸尺寸）。草坪的面积是多少？',
    figure: { shape: 'right-triangle', legA: 9, legB: 12, lengthUnit: 'cm' },
    answer: '54',
    unit: 'cm²',
    explanation: {
      steps: [
        '看图找条件：两条直角边是 9 cm 和 12 cm。',
        '找底和高：直角三角形的两条直角边互相垂直，一条当底，另一条就是高。',
        '代入计算：9 × 12 ÷ 2 = 54（cm²）。',
      ],
      tip: '直角三角形的两条直角边就是一组底和高，不用再找别的高。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '108', hint: '9 × 12 = 108 还要 ÷ 2，三角形面积是底 × 高 ÷ 2。' },
      { answer: '21', hint: '面积要用乘法：两条直角边相乘再 ÷ 2。' },
    ],
    knowledgePoint: '直角三角形的底和高',
  },

  // ---------- ③ 梯形·小桥 ----------
  {
    id: 7,
    stageId: 3,
    positionInStage: 1,
    prompt:
      '小桥的一块侧板是梯形，上底是 4 cm，下底是 8 cm，高是 5 cm（模型尺寸）。它的面积是多少？',
    figure: { shape: 'trapezoid', top: 4, bottom: 8, height: 5, lengthUnit: 'cm' },
    answer: '30',
    unit: 'cm²',
    explanation: {
      steps: [
        '看图找条件：上底 4 cm，下底 8 cm，高 5 cm。',
        '选公式：两个完全一样的梯形能拼成一个平行四边形，它的底是"上底 + 下底"，所以梯形面积 = （上底 + 下底）× 高 ÷ 2。',
        '代入计算：（4 + 8）× 5 ÷ 2 = 12 × 5 ÷ 2 = 30（cm²）。',
      ],
      tip: '先算上底加下底（记得加括号），再乘高，最后 ÷ 2。',
    },
    videoUrl: '/videos/q07.mp4',
    commonMistakes: [
      { answer: '60', hint: '（4 + 8）× 5 = 60 是拼成的平行四边形的面积，梯形还要 ÷ 2。' },
      { answer: '160', hint: '上底和下底要先相加，不是相乘。' },
    ],
    knowledgePoint: '梯形面积公式',
  },
  {
    id: 8,
    stageId: 3,
    positionInStage: 2,
    prompt: '桥面上有一块梯形的木板，上底是 3.5 m，下底是 6.5 m，高是 4 m。木板的面积是多少？',
    figure: { shape: 'trapezoid', top: 3.5, bottom: 6.5, height: 4, lengthUnit: 'm' },
    answer: '20',
    unit: 'm²',
    explanation: {
      steps: [
        '看图找条件：上底 3.5 m，下底 6.5 m，高 4 m。',
        '选公式：梯形面积 = （上底 + 下底）× 高 ÷ 2。',
        '代入计算：3.5 + 6.5 = 10，10 × 4 ÷ 2 = 20（m²）。',
      ],
      tip: '先把上底和下底加起来，3.5 + 6.5 正好凑成整数 10，计算会简单很多。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '40', hint: '（3.5 + 6.5）× 4 = 40 还要 ÷ 2。' },
      { answer: '91', hint: '上底和下底要先相加，再乘高、除以 2。' },
    ],
    knowledgePoint: '梯形面积（小数）',
  },
  {
    id: 9,
    stageId: 3,
    positionInStage: 3,
    prompt:
      '桥下的水渠，横截面是一个梯形：上口宽 12 m，渠底宽 8 m，深 3 m。水渠横截面的面积是多少？',
    figure: { shape: 'trapezoid', top: 12, bottom: 8, height: 3, lengthUnit: 'm' },
    answer: '30',
    unit: 'm²',
    explanation: {
      steps: [
        '看图找条件：上口宽 12 m 和渠底宽 8 m 是梯形的两条底，渠深 3 m 是梯形的高。',
        '选公式：梯形面积 = （上底 + 下底）× 高 ÷ 2。',
        '代入计算：（12 + 8）× 3 ÷ 2 = 20 × 3 ÷ 2 = 30（m²）。',
      ],
      tip: '生活中的说法要翻译成数学条件："上口""渠底"是两条底，"深"是高。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '60', hint: '（12 + 8）× 3 = 60 还要 ÷ 2。' },
      { answer: '288', hint: '上口和渠底是梯形的两条底，要先相加，不是三个数连乘。' },
    ],
    knowledgePoint: '梯形面积的实际应用',
  },

  // ---------- ④ 组合图形·小镇广场 ----------
  {
    id: 10,
    stageId: 4,
    positionInStage: 1,
    prompt:
      '广场上的"小房子"造型：下面是长 10 cm、宽 6 cm 的长方形，上面是底 10 cm、高 4 cm 的三角形屋顶。整个造型的面积是多少？',
    figure: { shape: 'house', width: 10, wallHeight: 6, roofHeight: 4, lengthUnit: 'cm' },
    answer: '80',
    unit: 'cm²',
    explanation: {
      steps: [
        '分一分：把小房子分成下面的长方形和上面的三角形两部分。',
        '分别算：长方形面积 = 10 × 6 = 60（cm²）；三角形面积 = 10 × 4 ÷ 2 = 20（cm²）。',
        '合起来：60 + 20 = 80（cm²）。',
      ],
      tip: '组合图形先分成学过的图形，每一部分用自己的公式；三角形部分别忘了 ÷ 2。',
    },
    videoUrl: '/videos/q10.mp4',
    commonMistakes: [
      { answer: '100', hint: '屋顶是三角形，10 × 4 之后还要 ÷ 2。' },
      { answer: '60', hint: '60 只是下面长方形的面积，别忘了加上屋顶三角形。' },
    ],
    knowledgePoint: '组合图形：分割法',
  },
  {
    id: 11,
    stageId: 4,
    positionInStage: 2,
    prompt:
      '广场边有一块 L 形的花圃：它是一个长 10 m、宽 8 m 的长方形，去掉了一个角上长 4 m、宽 3 m 的小长方形。花圃的面积是多少？',
    figure: { shape: 'l-shape', width: 10, height: 8, cutWidth: 4, cutHeight: 3, lengthUnit: 'm' },
    answer: '68',
    unit: 'm²',
    explanation: {
      steps: [
        '补一补：把缺的角补上，就是一个完整的大长方形，面积 = 10 × 8 = 80（m²）。',
        '算缺口：去掉的小长方形面积 = 4 × 3 = 12（m²）。',
        '减一减：80 − 12 = 68（m²）。也可以把 L 形分成两个长方形再相加，结果一样。',
      ],
      tip: '用"补"的方法时，最后要减去补上的那一块，不是加上。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '92', hint: '去掉的那一块要减掉，不是加上：80 − 12。' },
      { answer: '80', hint: '80 是补完整后大长方形的面积，还要减掉那个小长方形。' },
    ],
    knowledgePoint: '组合图形：添补法',
  },
  {
    id: 12,
    stageId: 4,
    positionInStage: 3,
    prompt:
      '广场旁有一块平行四边形的菜地，底是 25 m，高是 12 m。每平方米收白菜 3 kg，这块地一共能收白菜多少千克？',
    figure: { shape: 'parallelogram', base: 25, height: 12, lengthUnit: 'm' },
    answer: '900',
    unit: 'kg',
    explanation: {
      steps: [
        '先求面积：菜地是平行四边形，面积 = 25 × 12 = 300（m²）。',
        '再求产量：每平方米收 3 kg，300 m² 一共收 300 × 3 = 900（kg）。',
        '检查单位：题目问的是白菜多少千克，所以答案的单位是 kg。',
      ],
      tip: '应用题要看清问的是什么：先求面积，再用面积 × 每平方米的产量。',
    },
    videoUrl: null,
    commonMistakes: [
      { answer: '300', hint: '300 m² 是菜地的面积，题目问的是一共收多少千克白菜，还要 × 3。' },
      { answer: '450', hint: '菜地是平行四边形，面积是底 × 高，不用 ÷ 2。' },
    ],
    knowledgePoint: '平行四边形面积的实际应用',
  },
];
