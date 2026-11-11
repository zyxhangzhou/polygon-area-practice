import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    // 查询超时后 pg 只让这次调用报错，服务端的查询仍在执行。pool.query 出错时连接池会销毁这条连接；
    // 否则数据库卡住时超时的查询会一直占着连接，恢复后连接池仍是满的。
    // 自己借出连接的地方（事务）要在出错时 release(err)，见 practice/tx.ts
    query_timeout: 2000,
    keepAlive: true,
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
