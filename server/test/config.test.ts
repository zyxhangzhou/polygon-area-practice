import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 以真实入口启动进程，只给定传入的环境变量（不读取 .env） */
function runEntry(env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('loadConfig', () => {
  it('合法配置得到默认值', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    expect(c.port).toBe(3000);
    expect(c.logLevel).toBe('info');
    expect(c.nodeEnv).toBe('development');
    expect(c.webDistDir).toBeUndefined();
  });

  it('生产模式下才托管前端目录', () => {
    const c = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      NODE_ENV: 'production',
      WEB_DIST_DIR: '/tmp/dist',
    });
    expect(c.webDistDir).toBe('/tmp/dist');
  });

  it('缺少 DATABASE_URL 时报出字段名', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('PORT 非数字时报出字段名', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: 'abc' }),
    ).toThrow(/PORT/);
  });

  it.each(['1e3', ' 80 ', '', '0', '70000', '3000.5'])('PORT=%j 被拒绝', (port) => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: port }),
    ).toThrow(/PORT/);
  });

  it('DATABASE_URL 只有协议头时被拒绝', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://' })).toThrow(/DATABASE_URL/);
  });

  it('相对路径的 WEB_DIST_DIR 转为绝对路径', () => {
    const c = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      NODE_ENV: 'production',
      WEB_DIST_DIR: '../web/dist',
    });
    expect(c.webDistDir).toBe(path.resolve('../web/dist'));
  });
});

describe('启动配置校验（真实进程）', () => {
  it('缺少 DATABASE_URL：非零退出，输出包含 DATABASE_URL', () => {
    const r = runEntry({});
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stderr).toContain('DATABASE_URL');
  });

  it('PORT=abc：非零退出，输出包含 PORT', () => {
    const r = runEntry({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: 'abc' });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stderr).toContain('PORT');
  });

  it('数据库不可达：非零退出，输出说明数据库准备失败', () => {
    const r = runEntry({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db', LOG_LEVEL: 'silent' });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stderr).toContain('数据库准备失败');
  });
});
