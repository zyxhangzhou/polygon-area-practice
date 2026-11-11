import pg from 'pg';
import { prepareDatabase } from '../src/db/prepare.js';
import { TEST_DATABASE_URL } from './helpers.js';

/** 所有测试开始前执行一次：重建测试库 → 迁移 → 写入题库 */
export default async function setup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `拒绝重建数据库 "${dbName}"：测试库名必须以 _test 结尾，请检查 TEST_DATABASE_URL`,
    );
  }
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
    );
  } finally {
    await client.end();
  }
  await prepareDatabase(TEST_DATABASE_URL);
}
