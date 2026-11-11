import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { AppError } from '../errors.js';

export type Tx = NodePgDatabase;

/**
 * 在一条连接上执行事务。不用 Drizzle 的 `db.transaction`，因为它出错后总是把连接放回连接池：
 * 查询超过 `query_timeout` 时，pg 只是让这次调用报错，服务端的查询仍在执行（例如还在等锁），
 * 随后的 ROLLBACK 也会排在它后面超时。这条连接若回到池里，下一个请求会跑在旧事务中，
 * 并一直占着已拿到的行锁。
 *
 * 所以：业务错误（AppError）照常回滚；其他错误时连接状态不确定，直接销毁，不放回池里。
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (tx: Tx) => Promise<T>,
  { readOnly = false } = {},
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    // 只读事务用 REPEATABLE READ：一个请求里的多次查询看到同一个快照
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const result = await fn(drizzle(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (err instanceof AppError) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
      }
    } else {
      broken = err instanceof Error ? err : new Error(String(err));
    }
    throw err;
  } finally {
    // 传入错误时连接池会销毁这条连接
    client.release(broken);
  }
}
