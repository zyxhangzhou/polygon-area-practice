import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seed } from './seed.js';

/** 迁移文件目录：src/db/ 与 dist/db/ 往上两级都是 server/ */
export const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

/** 迁移与种子期间持有的 advisory lock，防止多个实例同时迁移 */
const PREPARE_LOCK_KEY = 4_172_026;

type Log = { info: (obj: object, msg: string) => void };

export type PrepareSteps = { migrate?: boolean; seed?: boolean };

/** 迁移 → 种子（默认两步都做）。全程使用同一条连接并持有 advisory lock。 */
export async function prepareDatabase(
  databaseUrl: string,
  log?: Log,
  steps: PrepareSteps = { migrate: true, seed: true },
) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [PREPARE_LOCK_KEY]);
    const db = drizzle(client);
    if (steps.migrate) await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const counts = steps.seed ? await seed(db) : undefined;
    log?.info({ ...steps, ...counts }, 'database prepared');
    return counts;
  } finally {
    // 连接关闭时锁也会释放；显式释放更清楚
    await client.query('select pg_advisory_unlock($1)', [PREPARE_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}
