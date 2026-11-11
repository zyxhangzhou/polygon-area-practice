import type { FastifyInstance } from 'fastify';
import { pingDb } from '../db.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (req, reply) => {
    const ok = await pingDb(app.pool);
    if (ok) return { status: 'ok', db: 'ok' };
    req.log.warn('health check: database unreachable');
    return reply.code(503).send({ status: 'error', db: 'unreachable' });
  });
}
