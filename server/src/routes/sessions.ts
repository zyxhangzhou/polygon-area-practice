import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LEARNING_EVENT_TYPES } from '../db/schema.js';
import { AppError } from '../errors.js';
import { BODY_LIMIT, Id, MAX_PAYLOAD_BYTES, parse, QuestionId } from './validation.js';
import {
  completeSession,
  getExplanation,
  getQuestion,
  getSession,
  getSummary,
  recordEvent,
  skipQuestion,
  startSession,
  submitAttempt,
} from '../practice/service.js';

/** 路径中的会话 ID 不是 UUID 时按"会话不存在"处理 */
function sessionIdOf(req: FastifyRequest): string {
  const { id } = req.params as { id?: string };
  const result = Id.safeParse(id);
  if (!result.success) throw new AppError(404, 'SESSION_NOT_FOUND', '找不到这次练习');
  return result.data;
}

/** 路径中的题目 ID；格式不对时返回 null，由服务层按"不在快照中"处理 */
function questionIdOf(req: FastifyRequest): number | null {
  const { qid } = req.params as { qid?: string };
  if (!qid || !/^\d{1,10}$/.test(qid)) return null;
  const result = QuestionId.safeParse(Number(qid));
  return result.success ? result.data : null;
}

const StartBody = z.object({ learnerId: Id });
const AttemptBody = z.object({
  questionId: QuestionId,
  clientAttemptId: Id,
  answer: z.string().max(200),
});
const SkipBody = z.object({ clientRequestId: Id });
const EventBody = z.object({
  questionId: QuestionId,
  type: z.enum(LEARNING_EVENT_TYPES),
  clientEventId: Id,
  payload: z
    .record(z.string(), z.unknown())
    .refine(
      (p) => Buffer.byteLength(JSON.stringify(p)) <= MAX_PAYLOAD_BYTES,
      `payload 不能超过 ${MAX_PAYLOAD_BYTES} 字节`,
    )
    .optional(),
});
const CompleteBody = z.object({ endedEarly: z.boolean() });

export async function sessionRoutes(app: FastifyInstance) {
  const opts = { bodyLimit: BODY_LIMIT };

  app.post('/api/sessions', opts, async (req, reply) => {
    const { learnerId } = parse(StartBody, req.body);
    const { created, view } = await startSession(app.db, learnerId);
    return reply.code(created ? 201 : 200).send(view);
  });

  app.get('/api/sessions/:id', async (req) => getSession(app.db, sessionIdOf(req)));

  app.get('/api/sessions/:id/questions/:qid', async (req) =>
    getQuestion(app.db, sessionIdOf(req), questionIdOf(req)),
  );

  app.post('/api/sessions/:id/attempts', opts, async (req, reply) => {
    const sessionId = sessionIdOf(req);
    const body = parse(AttemptBody, req.body);
    const { status, body: res } = await submitAttempt(app.db, sessionId, body);
    return reply.code(status).send(res);
  });

  app.post('/api/sessions/:id/questions/:qid/skip', opts, async (req, reply) => {
    const sessionId = sessionIdOf(req);
    const { clientRequestId } = parse(SkipBody, req.body);
    const { status, body } = await skipQuestion(
      app.db,
      sessionId,
      questionIdOf(req),
      clientRequestId,
    );
    return reply.code(status).send(body);
  });

  app.get('/api/sessions/:id/questions/:qid/explanation', async (req) =>
    getExplanation(app.db, sessionIdOf(req), questionIdOf(req)),
  );

  app.post('/api/sessions/:id/events', opts, async (req, reply) => {
    const sessionId = sessionIdOf(req);
    const body = parse(EventBody, req.body);
    const { status, body: res } = await recordEvent(app.db, sessionId, body);
    return reply.code(status).send(res);
  });

  app.post('/api/sessions/:id/complete', opts, async (req) => {
    const sessionId = sessionIdOf(req);
    const { endedEarly } = parse(CompleteBody, req.body);
    return completeSession(app.db, sessionId, endedEarly);
  });

  app.get('/api/sessions/:id/summary', async (req) => getSummary(app.db, sessionIdOf(req)));
}
