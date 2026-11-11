import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase } from '../src/db/prepare.js';
import { TEST_DATABASE_URL } from './helpers.js';

/** 用一个独立的临时库验证"空库上准备"与"重复准备"，不影响共用的测试库 */
const SCRATCH_DB = 'polygon_prepare_scratch_test';
const scratchUrl = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${SCRATCH_DB}`;
  return u.toString();
})();

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function scalar(sql: string): Promise<number> {
  const c = new pg.Client({ connectionString: scratchUrl });
  await c.connect();
  try {
    const r = await c.query<{ n: string }>(sql);
    return Number(r.rows[0]!.n);
  } finally {
    await c.end();
  }
}

describe('启动时准备数据库', () => {
  beforeAll(async () => {
    await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${SCRATCH_DB}`);
  });
  afterAll(async () => {
    await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  });

  it('空库上执行后有 12 道题', async () => {
    await prepareDatabase(scratchUrl);
    expect(await scalar('select count(*) as n from questions')).toBe(12);
  });

  it('重复执行不报错，迁移记录数不变，题目仍为 12 道', async () => {
    const migrationsBefore = await scalar('select count(*) as n from drizzle.__drizzle_migrations');
    await prepareDatabase(scratchUrl);
    await prepareDatabase(scratchUrl);
    expect(await scalar('select count(*) as n from drizzle.__drizzle_migrations')).toBe(
      migrationsBefore,
    );
    expect(await scalar('select count(*) as n from questions')).toBe(12);
  });

  it('并发执行时由 advisory lock 串行化，不报错', async () => {
    await expect(
      Promise.all([prepareDatabase(scratchUrl), prepareDatabase(scratchUrl)]),
    ).resolves.toHaveLength(2);
  });
});
