import { vi } from 'vitest';

export type Handler = (body: unknown, call: number) => Response | Promise<Response>;
interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  calls: number;
}
export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
export const apiError = (status: number, code: string, message = code, extra = {}) =>
  json(status, { error: { code, message, ...extra } });

/** 按 方法 + 路径正则 匹配的模拟后端；没匹配上的请求直接让测试失败 */
export function mockApi() {
  const routes: Route[] = [];
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: input, body });
      const route = [...routes].reverse().find((r) => r.method === method && r.pattern.test(input));
      if (!route) throw new Error(`未模拟的请求：${method} ${input}`);
      return route.handler(body, route.calls++);
    }),
  );
  const api = {
    calls,
    on(method: string, pattern: RegExp, handler: Handler | Response) {
      routes.push({
        method,
        pattern,
        handler: handler instanceof Response ? () => handler.clone() : handler,
        calls: 0,
      });
      return api;
    },
    writes: () => calls.filter((c) => c.method === 'POST'),
  };
  return api;
}
