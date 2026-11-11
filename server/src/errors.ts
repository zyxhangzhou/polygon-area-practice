/** 统一错误响应格式：{ error: { code, message } } */
export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/**
 * 把错误展开成一行可读的原因，用于启动失败时的输出：
 * - 沿 `cause` 链展开（Drizzle 把原始 pg 错误放在 cause 里）；
 * - 跳过 Drizzle 的 "Failed query: <SQL> params: <...>" 外层，不打印 SQL 与参数；
 * - 连接被拒绝时 pg 抛 AggregateError（message 为空），展开其中每个错误。
 */
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && depth < 10; depth++) {
    if (current instanceof AggregateError && current.errors.length > 0) {
      parts.push(current.errors.map(describeError).join('; '));
      break;
    }
    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }
    if (!current.message.startsWith('Failed query:')) {
      const code = (current as { code?: string }).code;
      parts.push([code, current.message].filter(Boolean).join(' ') || current.name);
    }
    current = current.cause;
  }
  return parts.join(' ← ') || String(err);
}
