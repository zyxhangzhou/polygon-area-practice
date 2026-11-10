import type { FastifyInstance } from 'fastify';
import { pingDb } from '../db.js';
import type pg from 'pg';

export async function healthRoutes(app: FastifyInstance, opts: { pool: pg.Pool }) {
  app.get('/api/health', async (req, reply) => {
    const ok = await pingDb(opts.pool);
    if (ok) return { status: 'ok', db: 'ok' };
    req.log.warn('health check: database unreachable');
    return reply.code(503).send({ status: 'error', db: 'unreachable' });
  });
}
