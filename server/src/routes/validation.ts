import { z } from 'zod';
import { AppError } from '../errors.js';

/** 这些接口的请求体上限；正常请求不到 1 KB */
export const BODY_LIMIT = 16 * 1024;
export const MAX_PAYLOAD_BYTES = 1024;
const MAX_INT = 2_147_483_647;

/** Postgres uuid 列接受的格式；不合格的值不能传给数据库（会报 22P02 变成 500） */
export const Id = z.guid();
export const QuestionId = z.number().int().positive().max(MAX_INT);

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}：` : '';
    throw new AppError(400, 'VALIDATION_ERROR', `请求格式不对：${where}${issue?.message ?? ''}`);
  }
  return result.data;
}

/** Postgres 的 text 与 jsonb 不接受 NUL 字符（写入会报错变成 500），在校验时拒绝 */
export const NO_NUL = (s: string) => !s.includes('\u0000');
export const NO_NUL_MESSAGE = '不能包含 NUL 字符';
