import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Config } from './config.js';
import { createDb } from './db.js';
import { healthRoutes } from './routes/health.js';
import { registerNotFound } from './static.js';

export type AppOptions = Pick<Config, 'databaseUrl' | 'logLevel' | 'nodeEnv' | 'webDistDir'>;

export async function buildApp(config: AppOptions) {
  const logger: FastifyServerOptions['logger'] =
    config.nodeEnv === 'development'
      ? { level: config.logLevel, transport: { target: 'pino-pretty' } }
      : { level: config.logLevel };

  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  const { pool, db } = createDb(config.databaseUrl);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  await app.register(healthRoutes, { pool });
  await registerNotFound(app, config.webDistDir);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof createDb>['db'];
  }
}
