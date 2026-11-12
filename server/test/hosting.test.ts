import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';

/** 真实的图标文件（web/public），构建时原样复制到 web/dist 根目录（site-favicon） */
const WEB_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public');
const ICONS = [
  ['favicon.ico', /^image\/(x-icon|vnd\.microsoft\.icon)/],
  ['favicon.svg', /^image\/svg\+xml/],
  ['apple-touch-icon.png', /^image\/png/],
] as const;

const INDEX_HTML = '<!doctype html><html><body><div id="root">APP_ENTRY</div></body></html>';

describe('前端托管（生产模式）', () => {
  let app: FastifyInstance;
  let dist: string;

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), INDEX_HTML);
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log("app")');
    fs.mkdirSync(path.join(dist, 'videos'));
    fs.writeFileSync(path.join(dist, 'videos', 'q04.mp4'), Buffer.alloc(4096, 7));
    for (const [name] of ICONS) fs.copyFileSync(path.join(WEB_PUBLIC, name), path.join(dist, name));
    app = await buildTestApp({ webDistDir: dist });
  });
  afterAll(async () => {
    await app.close();
    fs.rmSync(dist, { recursive: true, force: true });
  });

  const html = { accept: 'text/html,application/xhtml+xml' };

  it('GET / 返回前端入口 HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: html });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('APP_ENTRY');
  });

  it('视频支持分段请求：Range 返回 206 和请求的范围（video-explanations）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/videos/q04.mp4',
      headers: { range: 'bytes=0-1023' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-range']).toBe('bytes 0-1023/4096');
    expect(res.rawPayload).toHaveLength(1024);
  });

  it.each(ICONS)('网站图标 /%s 返回图片，不回退为 HTML（site-favicon）', async (name, type) => {
    const res = await app.inject({ method: 'GET', url: `/${name}`, headers: html });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(type);
    expect(res.rawPayload).toEqual(fs.readFileSync(path.join(WEB_PUBLIC, name)));
  });

  it('存在的脚本返回脚本本身', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.body).toBe('console.log("app")');
  });

  it('前端路由刷新回退到入口 HTML', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/practice/some-session-id',
      headers: html,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('APP_ENTRY');
  });

  it('缺失的脚本返回 404，不是 HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/missing.js' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('APP_ENTRY');
  });

  it('缺失的视频即使 Accept: text/html 也返回 404，不是 HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/missing.mp4', headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('APP_ENTRY');
  });

  it('未知 API 返回 JSON 404（即使 Accept: text/html）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/not-exist', headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toHaveProperty('error');
  });

  it('非页面导航请求（不接受 HTML）不回退', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/practice/x',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('非生产模式', () => {
  it('未知 API 仍返回 JSON 404', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error');
    await app.close();
  });
});
