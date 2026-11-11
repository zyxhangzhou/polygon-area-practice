/** 请求结果分三类（design D2）：成功、被后端拒绝、结果不确定 */
export type ApiResult<T> =
  | { kind: 'ok'; status: number; data: T }
  | { kind: 'rejected'; status: number; code: string; message: string; reason?: string }
  | { kind: 'uncertain' };

export const REQUEST_TIMEOUT_MS = 10_000;

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; reason?: unknown };
}

/**
 * 发送 JSON 请求。网络断开、超时、5xx、响应不是 JSON、4xx 却没有错误码，都算"结果不确定"：
 * 请求可能已经被后端处理了，只是没拿到确认。
 */
export async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  { timeoutMs = REQUEST_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      signal: controller.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      // 带 JSON 头时请求体不能为空，POST 至少发 {}
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { kind: 'uncertain' };
    }
    if (res.ok) return { kind: 'ok', status: res.status, data: json as T };
    const err = (json as ErrorBody | null)?.error;
    if (res.status >= 500 || typeof err?.code !== 'string') return { kind: 'uncertain' };
    return {
      kind: 'rejected',
      status: res.status,
      code: err.code,
      message: typeof err.message === 'string' ? err.message : '请求没有成功',
      ...(typeof err.reason === 'string' ? { reason: err.reason } : {}),
    };
  } catch {
    return { kind: 'uncertain' };
  } finally {
    clearTimeout(timer);
  }
}
