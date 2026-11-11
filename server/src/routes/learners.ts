import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createLearner } from '../practice/service.js';
import { BODY_LIMIT, parse } from './validation.js';

/** 请求体可以省略；昵称可选 */
const LearnerBody = z
  .object({ nickname: z.string().trim().min(1).max(20).optional() })
  .optional()
  .default({});

export async function learnerRoutes(app: FastifyInstance) {
  app.post('/api/learners', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const body = parse(LearnerBody, req.body);
    return reply.code(201).send(await createLearner(app.db, body.nickname ?? null));
  });
}
