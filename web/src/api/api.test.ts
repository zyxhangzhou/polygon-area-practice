import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api';

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('request', () => {
  it('2xx：ok，带状态码和数据', async () => {
    mockFetch(() => json(201, { learnerId: 'x' }));
    expect(await request('POST', '/api/learners')).toEqual({
      kind: 'ok',
      status: 201,
      data: { learnerId: 'x' },
    });
  });

  it('POST 不带请求体时发送 {}', async () => {
    const fn = mockFetch(() => json(201, {}));
    await request('POST', '/api/learners');
    expect(fn.mock.calls[0]![1].body).toBe('{}');
  });

  it('GET 不发请求体', async () => {
    const fn = mockFetch(() => json(200, {}));
    await request('GET', '/api/sessions/1');
    expect(fn.mock.calls[0]![1].body).toBeUndefined();
  });

  it('带错误码的 4xx：rejected，带 code、message、reason', async () => {
    mockFetch(() =>
      json(400, { error: { code: 'INVALID_ANSWER', message: '不要带单位', reason: 'has_unit' } }),
    );
    expect(await request('POST', '/x', {})).toEqual({
      kind: 'rejected',
      status: 400,
      code: 'INVALID_ANSWER',
      message: '不要带单位',
      reason: 'has_unit',
    });
  });

  it('不带错误码的 4xx：uncertain', async () => {
    mockFetch(() => json(404, { message: 'nope' }));
    expect(await request('GET', '/x')).toEqual({ kind: 'uncertain' });
  });

  it('5xx（即使带错误码）：uncertain', async () => {
    mockFetch(() => json(500, { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }));
    expect(await request('POST', '/x', {})).toEqual({ kind: 'uncertain' });
  });

  it('响应不是 JSON：uncertain', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 })));
    expect(await request('GET', '/x')).toEqual({ kind: 'uncertain' });
    mockFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    expect(await request('GET', '/x')).toEqual({ kind: 'uncertain' });
  });

  it('fetch 抛错（断网）：uncertain', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await request('POST', '/x', {})).toEqual({ kind: 'uncertain' });
  });

  it('超时：中止请求并返回 uncertain', async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = request('GET', '/x');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ kind: 'uncertain' });
  });
});
