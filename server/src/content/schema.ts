import { z } from 'zod';

const length = z.number().positive();
const lengthUnit = z.enum(['cm', 'dm', 'm']);

/**
 * 图形参数：前端按这些参数绘制 SVG。
 * `unknown` 指出图上标"?"的那条边（逆运算题），其余边标出数值。
 */
export const FigureSchema = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('parallelogram'),
    base: length,
    height: length,
    lengthUnit,
    unknown: z.enum(['base', 'height']).optional(),
  }),
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

export const ExplanationSchema = z.object({
  steps: z.array(z.string().min(1)).min(3, '图文解析至少 3 步'),
  tip: z.string().min(1, '易错提醒不能为空'),
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
