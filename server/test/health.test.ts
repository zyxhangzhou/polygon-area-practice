import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, UNREACHABLE_DATABASE_URL } from './helpers.js';

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
