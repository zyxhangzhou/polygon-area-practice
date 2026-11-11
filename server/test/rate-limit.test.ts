import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { RATE_LIMITED_MESSAGE } from '../src/app.js';
import { buildTestApp, resetPracticeData } from './helpers.js';

// 用较小的上限测试同一套规则（request-rate-limits 规格）
const API_MAX = 5;
const LEARNER_MAX = 3;

let app: FastifyInstance;

async function build(trustProxyHops = 0) {
  app = await buildTestApp({
    trustProxyHops,
    rateLimit: { apiPerMinute: API_MAX, learnersPerHour: LEARNER_MAX },
  });
  await resetPracticeData(app.pool);
}

afterEach(async () => {
  await app.close();
});

const send = (opts: InjectOptions) => app.inject(opts);
const get = (url: string, extra: Partial<InjectOptions> = {}) =>
  send({ method: 'GET', url, ...extra });

/** 一个不存在的会话：返回 404，但仍计入频率 */
const MISSING_SESSION = `/api/sessions/${randomUUID()}`;

async function exhaust(extra: Partial<InjectOptions> = {}) {
  for (let i = 0; i < API_MAX; i++) {
    const res = await get(MISSING_SESSION, extra);
    expect(res.statusCode).toBe(404);
  }
}

describe('API 请求频率上限', () => {
  beforeEach(() => build());

  it('上限以内正常处理，超出后返回 429 RATE_LIMITED 与 Retry-After', async () => {
    await exhaust();
    const res = await get(MISSING_SESSION);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: { code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE } });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('健康检查与非 API 请求不计数、不受限制', async () => {
    for (let i = 0; i < API_MAX * 2; i++) {
      expect((await get('/api/health')).statusCode).toBe(200);
      expect((await get('/practice/1', { headers: { accept: 'text/html' } })).statusCode).toBe(404);
    }
    await exhaust();
    expect((await get('/api/health')).statusCode).toBe(200);
    expect((await get('/api/health?x=1')).statusCode).toBe(200);
    expect((await get('/some/page')).statusCode).toBe(404);
  });

  it('不同 IP 分别计数', async () => {
    await exhaust({ remoteAddress: '198.51.100.1' });
    expect((await get(MISSING_SESSION, { remoteAddress: '198.51.100.1' })).statusCode).toBe(429);
    expect((await get(MISSING_SESSION, { remoteAddress: '198.51.100.2' })).statusCode).toBe(404);
  });

  it('被限制的作答没有写入数据库', async () => {
    const learner = await send({ method: 'POST', url: '/api/learners' });
    const started = await send({
      method: 'POST',
      url: '/api/sessions',
      payload: { learnerId: learner.json().learnerId },
    });
    const sessionId = started.json().session.id;
    // 开始练习已计入 1 次；用完剩余额度
    for (let i = 1; i < API_MAX; i++) await get(MISSING_SESSION);
    const res = await send({
      method: 'POST',
      url: `/api/sessions/${sessionId}/attempts`,
      payload: { questionId: 1, clientAttemptId: randomUUID(), answer: '30' },
    });
    expect(res.statusCode).toBe(429);
    const { rows } = await app.pool.query('select count(*)::int as n from attempts');
    expect(rows[0].n).toBe(0);
  });
});

describe('创建学生的上限', () => {
  beforeEach(() => build());

  it('每小时超过上限后返回 429，不创建学生', async () => {
    for (let i = 0; i < LEARNER_MAX; i++) {
      expect((await send({ method: 'POST', url: '/api/learners' })).statusCode).toBe(201);
    }
    const res = await send({ method: 'POST', url: '/api/learners' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
    // 小时窗口：Retry-After 远大于一分钟
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(60);
    const { rows } = await app.pool.query('select count(*)::int as n from learners');
    expect(rows[0].n).toBe(LEARNER_MAX);
  });
});

describe('识别客户端 IP', () => {
  it('未配置代理：忽略 X-Forwarded-For，按连接地址计数', async () => {
    await build(0);
    for (let i = 0; i < API_MAX; i++) {
      await get(MISSING_SESSION, { headers: { 'x-forwarded-for': `203.0.113.${i}` } });
    }
    const res = await get(MISSING_SESSION, { headers: { 'x-forwarded-for': '203.0.113.99' } });
    expect(res.statusCode).toBe(429);
  });

  it('一层代理：按代理追加的真实地址计数，伪造的最左值不起作用', async () => {
    await build(1);
    const real = '198.51.100.7';
    for (let i = 0; i < API_MAX; i++) {
      await get(MISSING_SESSION, { headers: { 'x-forwarded-for': `203.0.113.${i}, ${real}` } });
    }
    const forged = await get(MISSING_SESSION, {
      headers: { 'x-forwarded-for': `203.0.113.99, ${real}` },
    });
    expect(forged.statusCode).toBe(429);
    const other = await get(MISSING_SESSION, {
      headers: { 'x-forwarded-for': `203.0.113.99, 198.51.100.8` },
    });
    expect(other.statusCode).toBe(404);
  });
});
