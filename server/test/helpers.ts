import { buildApp, type AppOptions } from '../src/app.js';

/** 测试只认 TEST_DATABASE_URL，不读取 .env，避免误连开发库 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/polygon_test';

/** 一个不可达的数据库地址（本机 1 号端口，连接会被立即拒绝） */
export const UNREACHABLE_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:1/none';

export function buildTestApp(overrides: Partial<AppOptions> = {}) {
  return buildApp({
    databaseUrl: TEST_DATABASE_URL,
    logLevel: 'silent',
    nodeEnv: 'test',
    webDistDir: undefined,
    trustProxyHops: 0,
    // 其他测试会发出大量请求；限流单独在 rate-limit.test.ts 中测试
    rateLimit: null,
    ...overrides,
  });
}

/** 清空练习数据（学生、会话及其级联记录），保留题库 */
export async function resetPracticeData(pool: { query: (sql: string) => Promise<unknown> }) {
  await pool.query('TRUNCATE learners CASCADE');
}
