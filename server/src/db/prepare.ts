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

export type PrepareOptions = {
  /** 等待迁移锁（以及 DDL 表锁）的上限，默认 30 秒 */
  lockTimeoutMs?: number;
  /** 单条语句的上限，默认 60 秒 */
  statementTimeoutMs?: number;
};

export class PrepareLockTimeoutError extends Error {
  constructor(seconds: number, cause: unknown) {
    super(
      `等待迁移锁超过 ${seconds} 秒：可能有另一个实例正在迁移，或有连接长时间持有锁（pg_advisory_lock ${PREPARE_LOCK_KEY}）`,
      { cause },
    );
    this.name = 'PrepareLockTimeoutError';
  }
}

/** 迁移 → 种子（默认两步都做）。全程使用同一条连接并持有 advisory lock。 */
export async function prepareDatabase(
  databaseUrl: string,
  log?: Log,
  steps: PrepareSteps = { migrate: true, seed: true },
  { lockTimeoutMs = 30_000, statementTimeoutMs = 60_000 }: PrepareOptions = {},
) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    // 等锁与执行都有上限，不会无限期卡住、也没有任何输出
    await client.query(`set lock_timeout = ${Math.floor(lockTimeoutMs)}`);
    await client.query(`set statement_timeout = ${Math.floor(statementTimeoutMs)}`);
    try {
      await client.query('select pg_advisory_lock($1)', [PREPARE_LOCK_KEY]);
    } catch (err) {
      if ((err as { code?: string }).code === '55P03') {
        throw new PrepareLockTimeoutError(Math.round(lockTimeoutMs / 1000), err);
      }
      throw err;
    }
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
