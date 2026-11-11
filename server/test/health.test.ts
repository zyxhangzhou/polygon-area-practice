import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, UNREACHABLE_DATABASE_URL } from './helpers.js';
import { startFreezableProxy, startSilentServer } from './stall.js';

describe('GET /api/health', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('数据库正常：200 + {status: ok, db: ok}', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('未携带 x-request-id 时生成一个', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(String(res.headers['x-request-id']).length).toBeGreaterThan(0);
  });

  it('沿用调用方的 x-request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'test-123' },
    });
    expect(res.headers['x-request-id']).toBe('test-123');
  });
});

describe('GET /api/health（数据库不可达）', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp({ databaseUrl: UNREACHABLE_DATABASE_URL });
  });
  afterAll(async () => {
    await app.close();
  });

  it('3 秒内返回 503 + {status: error, db: unreachable}', async () => {
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'error', db: 'unreachable' });
  });
});

describe('GET /api/health（数据库能连上但不回应）', () => {
  let app: FastifyInstance;
  let silent: Awaited<ReturnType<typeof startSilentServer>>;
  beforeAll(async () => {
    silent = await startSilentServer();
    app = await buildTestApp({ databaseUrl: silent.url });
  });
  afterAll(async () => {
    await app.close();
    await silent.close();
  });

  it('3 秒内返回 503', async () => {
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/health（数据库短暂卡住后恢复）', () => {
  it('连接池占满后恢复为 200，且 app.close() 能结束', async () => {
    const proxy = await startFreezableProxy();
    const app = await buildTestApp({ databaseUrl: proxy.url });
    const health = async () => (await app.inject({ method: 'GET', url: '/api/health' })).statusCode;
    try {
      // 先建满 10 条连接，再冻结，让每条连接上都卡着一个查询
      expect(await Promise.all(Array.from({ length: 10 }, health))).toEqual(Array(10).fill(200));
      proxy.freeze();
      expect(await Promise.all(Array.from({ length: 10 }, health))).toEqual(Array(10).fill(503));
      proxy.unfreeze();

      let status = 0;
      for (let i = 0; i < 5 && status !== 200; i++) {
        status = await health();
        if (status !== 200) await new Promise((r) => setTimeout(r, 500));
      }
      expect(status).toBe(200);
    } finally {
      const closed = await Promise.race([
        app.close().then(() => 'closed'),
        new Promise((r) => setTimeout(() => r('timeout'), 5000)),
      ]);
      await proxy.close();
      expect(closed).toBe('closed');
    }
  });
});
