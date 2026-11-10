import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 10,
  });
  // 空闲连接出错（如数据库重启）时不让进程崩溃；下次查询会重新建连
  pool.on('error', () => {});
  const db = drizzle(pool);
  return { pool, db };
}

export type Database = ReturnType<typeof createDb>;

/** 执行 select 1，超过 timeoutMs 视为不可达 */
export async function pingDb(pool: pg.Pool, timeoutMs = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = pool.query('select 1').then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
