import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrepareLockTimeoutError, prepareDatabase } from '../src/db/prepare.js';
import { TEST_DATABASE_URL } from './helpers.js';
import { startServer } from './process.js';

/** 用独立的临时库验证启动准备，不影响共用的测试库 */
const SCRATCH_DB = 'polygon_prepare_scratch_test';
const scratchUrl = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${SCRATCH_DB}`;
  return u.toString();
})();
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function query<T extends pg.QueryResultRow>(url: string, sql: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql)).rows;
  } finally {
    await c.end();
  }
}

async function recreateScratch() {
  await query(TEST_DATABASE_URL, `DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await query(TEST_DATABASE_URL, `CREATE DATABASE ${SCRATCH_DB}`);
}

const count = async (sql: string) => Number((await query<{ n: string }>(scratchUrl, sql))[0]!.n);

afterAll(async () => {
  await query(TEST_DATABASE_URL, `DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
});

describe('prepareDatabase', () => {
  it('空库上执行后有 12 道题；重复执行不报错，迁移记录数不变', async () => {
    await recreateScratch();
    await prepareDatabase(scratchUrl);
    expect(await count('select count(*) as n from questions')).toBe(12);
    const migrations = await count('select count(*) as n from drizzle.__drizzle_migrations');
    expect(migrations).toBe(2);
    await prepareDatabase(scratchUrl);
    expect(await count('select count(*) as n from drizzle.__drizzle_migrations')).toBe(migrations);
    expect(await count('select count(*) as n from questions')).toBe(12);
  });

  it('全新空库上 3 个并发执行，由 advisory lock 串行化，全部成功', async () => {
    // 必须是空库：已迁移的库上迁移本身就幂等，不加锁也会通过（PR #2 评审发现）
    await recreateScratch();
    await expect(
      Promise.all([1, 2, 3].map(() => prepareDatabase(scratchUrl))),
    ).resolves.toHaveLength(3);
    expect(await count('select count(*) as n from questions')).toBe(12);
  });

  it('迁移锁被长时间占用时，在上限后以明确的错误失败', async () => {
    const holder = new pg.Client({ connectionString: scratchUrl });
    await holder.connect();
    try {
      await holder.query('select pg_advisory_lock(4172026)');
      const started = Date.now();
      const run = prepareDatabase(scratchUrl, undefined, undefined, { lockTimeoutMs: 500 });
      await expect(run).rejects.toThrow(PrepareLockTimeoutError);
      await expect(run).rejects.toThrow(/等待迁移锁超过/);
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      await holder.end();
    }
  });
});

describe('启动时准备数据库（真实进程）', () => {
  it('空库上启动：健康检查 200、12 道题；重启后迁移不重复执行、仍 12 道题', async () => {
    await recreateScratch();
    const first = await startServer(scratchUrl);
    expect(first.health).toEqual({ status: 'ok', db: 'ok' });
    expect(await first.stop()).toBe(0);
    expect(await count('select count(*) as n from questions')).toBe(12);

    const second = await startServer(scratchUrl);
    expect(await second.stop()).toBe(0);
    expect(await count('select count(*) as n from drizzle.__drizzle_migrations')).toBe(2);
    expect(await count('select count(*) as n from questions')).toBe(12);
  });

  it('种子因数据库错误失败：输出原始错误信息，不输出 SQL 参数', async () => {
    await recreateScratch();
    await prepareDatabase(scratchUrl);
    await query(scratchUrl, 'ALTER TABLE questions DROP COLUMN knowledge_point');
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: serverDir,
      env: { PATH: process.env.PATH ?? '', DATABASE_URL: scratchUrl, LOG_LEVEL: 'silent' },
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('数据库准备失败');
    expect(r.stderr).toContain('column "knowledge_point"');
    expect(r.stderr).not.toContain('Failed query');
    expect(r.stderr).not.toContain('params:');
  });
});
