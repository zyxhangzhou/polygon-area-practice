#!/usr/bin/env node
// 冒烟检查（production-deployment 规格"上线检查"）：npm run smoke -- <地址>
// 依次检查 6 步，任一步失败就输出步骤、HTTP 状态、请求 ID，并以退出码 1 退出。
// 只用 Node 自带的 fetch，没有依赖。会在数据库里留下一个匿名的测试学生。
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('用法：npm run smoke -- <服务地址>，例如 npm run smoke -- http://localhost:3000');
  process.exit(2);
}

/** 第 1 步给免费实例冷启动留出时间 */
const WAKE_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 15_000;

class StepError extends Error {}

async function call(
  method,
  path,
  { body, accept = 'application/json', timeout = STEP_TIMEOUT_MS } = {},
) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { accept, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new StepError(`${method} ${path} 请求失败：${err.cause?.message ?? err.message}`);
  }
  const text = await res.text();
  return {
    status: res.status,
    requestId: res.headers.get('x-request-id'),
    text,
    type: res.headers.get('content-type') ?? '',
  };
}

function expectStatus(res, status, what) {
  const allowed = [status].flat();
  if (!allowed.includes(res.status)) {
    throw new StepError(
      `${what}：期望 HTTP ${allowed.join(' 或 ')}，实际 ${res.status}（请求 ID ${res.requestId ?? '无'}）\n  响应：${res.text.slice(0, 200)}`,
    );
  }
  return JSON.parse(res.text || 'null');
}

const ctx = {};
const steps = [
  [
    '健康检查',
    async () => {
      const res = await call('GET', '/api/health', { timeout: WAKE_TIMEOUT_MS });
      const body = expectStatus(res, 200, 'GET /api/health');
      if (body?.db !== 'ok') throw new StepError(`数据库状态不正常：${res.text}`);
      return res;
    },
  ],
  [
    '首页',
    async () => {
      const res = await call('GET', '/', { accept: 'text/html' });
      if (
        res.status !== 200 ||
        !res.type.includes('text/html') ||
        !res.text.includes('<div id="root">')
      ) {
        throw new StepError(`GET / 没有返回前端页面：HTTP ${res.status}，${res.type}`);
      }
      return res;
    },
  ],
  [
    '创建学生',
    async () => {
      const res = await call('POST', '/api/learners', { body: { nickname: 'smoke' } });
      ctx.learnerId = expectStatus(res, 201, 'POST /api/learners').learnerId;
      return res;
    },
  ],
  [
    '开始练习',
    async () => {
      const res = await call('POST', '/api/sessions', { body: { learnerId: ctx.learnerId } });
      const body = expectStatus(res, 201, 'POST /api/sessions');
      ctx.sessionId = body.session.id;
      ctx.questionId = body.currentQuestionId;
      return res;
    },
  ],
  [
    '提交一次作答',
    async () => {
      const res = await call('POST', `/api/sessions/${ctx.sessionId}/attempts`, {
        body: { questionId: ctx.questionId, clientAttemptId: randomUUID(), answer: '1' },
      });
      const body = expectStatus(res, [200, 201], 'POST attempts');
      if (typeof body?.result?.correct !== 'boolean')
        throw new StepError(`作答响应缺少判题结果：${res.text.slice(0, 200)}`);
      return res;
    },
  ],
  [
    '读取会话状态',
    async () => {
      const res = await call('GET', `/api/sessions/${ctx.sessionId}`);
      const body = expectStatus(res, 200, 'GET /api/sessions/:id');
      const q = body.questions.find((x) => x.questionId === ctx.questionId);
      if (!q || q.status === 'unanswered')
        throw new StepError(`作答没有反映在会话状态中：${JSON.stringify(q)}`);
      return res;
    },
  ],
];

console.log(`冒烟检查：${base}`);
for (const [i, [name, run]] of steps.entries()) {
  const started = Date.now();
  try {
    const res = await run();
    console.log(
      `  ✓ ${i + 1}. ${name}（${Date.now() - started} ms，请求 ID ${res.requestId ?? '无'}）`,
    );
  } catch (err) {
    console.error(`  ✗ ${i + 1}. ${name} 失败：${err.message}`);
    if (!(err instanceof StepError)) console.error(err);
    process.exit(1);
  }
}
console.log('全部通过');
