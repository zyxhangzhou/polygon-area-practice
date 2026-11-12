import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { createLearner, listLearnerSessions } from '../practice/service.js';
import { BODY_LIMIT, Id, NO_NUL, NO_NUL_MESSAGE, parse } from './validation.js';

/** 请求体可以省略；昵称可选 */
const LearnerBody = z
  .object({ nickname: z.string().trim().min(1).max(20).refine(NO_NUL, NO_NUL_MESSAGE).optional() })
  .optional()
  .default({});

const HOUR_MS = 60 * 60 * 1000;

export async function learnerRoutes(
  app: FastifyInstance,
  { learnersPerHour }: { learnersPerHour?: number },
) {
  // 创建学生另有更严格的上限（每小时），代替全局的每分钟上限
  const config =
    learnersPerHour === undefined
      ? undefined
      : { rateLimit: { max: learnersPerHour, timeWindow: HOUR_MS } };
  app.post('/api/learners', { bodyLimit: BODY_LIMIT, config }, async (req, reply) => {
    const body = parse(LearnerBody, req.body);
    return reply.code(201).send(await createLearner(app.db, body.nickname ?? null));
  });

  app.get('/api/learners/:id/sessions', async (req) => {
    const { id } = req.params as { id?: string };
    const parsed = Id.safeParse(id);
    // 格式不对的 ID 按"学生不存在"处理，不传给数据库
    if (!parsed.success) throw new AppError(404, 'LEARNER_NOT_FOUND', '找不到这个学生');
    return listLearnerSessions(app.pool, parsed.data);
  });
}
