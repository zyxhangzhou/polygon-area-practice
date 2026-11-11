import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/errors.js';
import { TEST_DATABASE_URL } from './helpers.js';

/** 收集 pino 输出的 JSON 日志行 */
function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const line of String(chunk).split('\n')) if (line) lines.push(JSON.parse(line));
      cb();
    },
  });
  return { lines, stream };
}

describe('统一错误格式与请求 ID 日志', () => {
  let app: FastifyInstance;
  const logs = captureLogs();

  beforeAll(async () => {
    app = await buildApp(
      { databaseUrl: TEST_DATABASE_URL, logLevel: 'info', nodeEnv: 'test', webDistDir: undefined },
      { logStream: logs.stream },
    );
    // 仅测试用的路由
    app.post('/api/__echo', async (req) => req.body);
    app.get('/api/__boom', async () => {
      throw new Error('secret internal detail');
    });
    app.get('/api/__app_error', async () => {
      throw new AppError(409, 'SESSION_COMPLETED', '这次练习已经结束了', { reason: 'x' });
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('请求体 JSON 格式错误：400 + BAD_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/__echo',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: expect.any(String) },
    });
  });

  it('业务错误 AppError：按原状态码、错误码和附加字段返回', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/__app_error' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: { code: 'SESSION_COMPLETED', message: '这次练习已经结束了', reason: 'x' },
    });
  });

  it('内部错误：500 + 通用提示，不泄露细节，日志记录异常与 reqId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/__boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
    expect(res.body).not.toContain('secret internal detail');

    const reqId = res.headers['x-request-id'];
    const errorLog = logs.lines.find((l) => l.reqId === reqId && l.level === 50);
    expect(errorLog).toBeDefined();
    expect(JSON.stringify(errorLog)).toContain('secret internal detail');
  });

  it('日志中的 reqId 与响应头 x-request-id 相同', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const reqId = res.headers['x-request-id'];
    const reqLogs = logs.lines.filter((l) => l.reqId === reqId);
    expect(reqLogs.map((l) => l.msg)).toEqual(
      expect.arrayContaining(['incoming request', 'request completed']),
    );
  });

  it.each([['a'.repeat(65)], ['bad id'], ['x\u0007y']])(
    '不合法的 x-request-id 被替换：%j',
    async (incoming) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': incoming },
      });
      const reqId = String(res.headers['x-request-id']);
      expect(reqId).not.toBe(incoming);
      expect(reqId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
