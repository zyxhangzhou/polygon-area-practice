import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { errorBody } from './errors.js';

/** 路径最后一段是否带文件扩展名（如 .js / .png / .mp4） */
function looksLikeFile(urlPath: string): boolean {
  const last = urlPath.split('/').pop() ?? '';
  return /\.[A-Za-z0-9]+$/.test(last);
}

export async function registerNotFound(app: FastifyInstance, webDistDir: string | undefined) {
  let indexHtml: string | undefined;
  if (webDistDir) {
    const indexPath = path.join(webDistDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw new Error(`前端构建产物不存在：${indexPath}。请先执行 npm run build`);
    }
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    await app.register(fastifyStatic, { root: webDistDir, index: ['index.html'] });
  }

  app.setNotFoundHandler((req, reply) => {
    const urlPath = req.url.split('?')[0] ?? '/';
    // 1. 未知 API：JSON 404
    if (urlPath === '/api' || urlPath.startsWith('/api/')) {
      return reply.code(404).send(errorBody('NOT_FOUND', `接口不存在：${req.method} ${urlPath}`));
    }
    // 2. 带扩展名的缺失资源：如实 404，不回退为页面，避免掩盖丢失的 JS/图片/视频
    if (looksLikeFile(urlPath)) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
    }
    // 3. 页面导航：回退到前端入口，支持前端路由刷新
    const acceptsHtml = (req.headers.accept ?? '').includes('text/html');
    if (indexHtml && req.method === 'GET' && acceptsHtml) {
      return reply.code(200).type('text/html; charset=utf-8').send(indexHtml);
    }
    // 4. 其他
    return reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
  });
}
