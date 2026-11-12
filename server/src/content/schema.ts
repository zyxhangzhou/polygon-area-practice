import { z } from 'zod';
import { MAX_MARKS_PER_TEXT, parseHighlights } from './highlight.js';

const length = z.number().positive();
const lengthUnit = z.enum(['cm', 'dm', 'm']);

/**
 * 图形参数：前端按这些参数绘制 SVG，**只包含题干给出的条件，不含答案**。
 * 逆运算题用 `unknown` 指出图上标"?"的那条边：那条边不出现在参数里（否则题目接口会泄露答案），
 * 改为给出 `area`；前端按默认比例绘制。
 */
const ParallelogramSchema = z
  .object({
    shape: z.literal('parallelogram'),
    base: length.optional(),
    height: length.optional(),
    area: length.optional(),
    lengthUnit,
    unknown: z.enum(['base', 'height']).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.unknown) {
      if (f[f.unknown] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `所求的边 ${f.unknown} 不能出现在图形参数中（会泄露答案）`,
        });
      }
      const known = f.unknown === 'height' ? 'base' : 'height';
      if (f[known] === undefined)
        ctx.addIssue({ code: 'custom', message: `缺少已知的边 ${known}` });
      if (f.area === undefined) ctx.addIssue({ code: 'custom', message: '逆运算题必须给出 area' });
    } else {
      if (f.base === undefined) ctx.addIssue({ code: 'custom', message: '缺少 base' });
      if (f.height === undefined) ctx.addIssue({ code: 'custom', message: '缺少 height' });
    }
  });

export const FigureSchema = z.discriminatedUnion('shape', [
  ParallelogramSchema,
  z.object({ shape: z.literal('triangle'), base: length, height: length, lengthUnit }),
  z.object({ shape: z.literal('right-triangle'), legA: length, legB: length, lengthUnit }),
  z.object({
    shape: z.literal('trapezoid'),
    top: length,
    bottom: length,
    height: length,
    lengthUnit,
  }),
  /** 长方形上面接一个三角形屋顶，屋顶的底等于长方形的宽 */
  z.object({
    shape: z.literal('house'),
    width: length,
    wallHeight: length,
    roofHeight: length,
    lengthUnit,
  }),
  /** 大长方形缺去右上角一个小长方形 */
  z.object({
    shape: z.literal('l-shape'),
    width: length,
    height: length,
    cutWidth: length,
    cutHeight: length,
    lengthUnit,
  }),
]);
export type Figure = z.infer<typeof FigureSchema>;
export type ShapeType = Figure['shape'];

/** 非负小数，最多 2 位小数，用字符串书写以避免浮点误差 */
export const DecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, '答案必须是最多 2 位小数的非负数');

export const ExplanationSchema = z
  .object({
    steps: z.array(z.string().min(1)).min(3, '图文解析至少 3 步'),
    tip: z.string().min(1, '易错提醒不能为空'),
  })
  .superRefine((exp, ctx) => {
    // 重点标记（explanation-highlights）：格式合法、每处最多 3 个；讲解至少有条件和公式，提醒至少有关键
    const counts = { c: 0, f: 0, k: 0 };
    const check = (text: string, path: (string | number)[], where: string) => {
      const r = parseHighlights(text);
      if ('error' in r) {
        ctx.addIssue({ code: 'custom', path, message: `${where}的重点标记不合法：${r.error}` });
        return [];
      }
      const marks = r.segments.filter((s) => s.kind !== null);
      if (marks.length > MAX_MARKS_PER_TEXT) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `${where}有 ${marks.length} 处重点标记，最多 ${MAX_MARKS_PER_TEXT} 处`,
        });
      }
      return marks;
    };
    exp.steps.forEach((step, i) => {
      for (const m of check(step, ['steps', i], `第 ${i + 1} 步`)) counts[m.kind!] += 1;
    });
    const tipMarks = check(exp.tip, ['tip'], '易错提醒');
    if (counts.c < 1)
      ctx.addIssue({ code: 'custom', path: ['steps'], message: '分步讲解至少标出 1 处条件 {c:…}' });
    if (counts.f < 1)
      ctx.addIssue({ code: 'custom', path: ['steps'], message: '分步讲解至少标出 1 处公式 {f:…}' });
    if (!tipMarks.some((m) => m.kind === 'k'))
      ctx.addIssue({ code: 'custom', path: ['tip'], message: '易错提醒至少标出 1 处关键 {k:…}' });
  });
export type Explanation = z.infer<typeof ExplanationSchema>;

export const CommonMistakeSchema = z.object({
  answer: DecimalString,
  hint: z.string().min(1),
});
export type CommonMistake = z.infer<typeof CommonMistakeSchema>;

export const StageSeedSchema = z.object({
  id: z.number().int().positive(),
  position: z.number().int().positive(),
  name: z.string().min(1),
  buildingName: z.string().min(1),
  intro: z.string().min(1),
});
export type StageSeed = z.infer<typeof StageSeedSchema>;

export const QuestionSeedSchema = z.object({
  id: z.number().int().positive(),
  stageId: z.number().int().positive(),
  positionInStage: z.number().int().min(1).max(3),
  prompt: z.string().min(1),
  figure: FigureSchema,
  answer: DecimalString,
  unit: z.string().min(1),
  explanation: ExplanationSchema,
  videoUrl: z.string().startsWith('/').nullable(),
  commonMistakes: z.array(CommonMistakeSchema).min(1, '至少预设 1 个常见错误答案'),
  knowledgePoint: z.string().min(1),
});
export type QuestionSeed = z.infer<typeof QuestionSeedSchema>;
