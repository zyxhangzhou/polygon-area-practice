import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { createDb } from './db.js';
import { AppError, errorBody } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { learnerRoutes } from './routes/learners.js';
import { sessionRoutes } from './routes/sessions.js';
import { registerNotFound } from './static.js';

export type AppOptions = Pick<Config, 'databaseUrl' | 'logLevel' | 'nodeEnv' | 'webDistDir'>;

/** 只沿用格式合法的请求 ID，避免超长或含控制字符的值进入日志与响应头 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type BuildAppExtras = {
  /** 测试用：把日志写到指定流，便于断言日志内容 */
  logStream?: NodeJS.WritableStream;
};

export async function buildApp(config: AppOptions, extras: BuildAppExtras = {}) {
  const logger: FastifyServerOptions['logger'] = extras.logStream
    ? { level: config.logLevel, stream: extras.logStream }
    : config.nodeEnv === 'development'
      ? { level: config.logLevel, transport: { target: 'pino-pretty' } }
      : { level: config.logLevel };

  const app = Fastify({
    logger,
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send(errorBody(err.code, err.message, err.details));
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      return reply.code(status).send(errorBody('INTERNAL_ERROR', '服务器内部错误'));
    }
    const code = err.validation ? 'VALIDATION_ERROR' : 'BAD_REQUEST';
    return reply.code(status).send(errorBody(code, err.message));
  });

  const { pool, db } = createDb(config.databaseUrl);
  app.decorate('pool', pool);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  await app.register(healthRoutes);
  await app.register(learnerRoutes);
  await app.register(sessionRoutes);
  await registerNotFound(app, config.webDistDir);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    pool: pg.Pool;
    db: ReturnType<typeof createDb>['db'];
  }
}
