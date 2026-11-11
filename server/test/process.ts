import { type ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 找一个当前可用的端口 */
export async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

/** 以真实入口启动服务（不读 .env），等待健康检查返回 200 */
export async function startServer(databaseUrl: string, timeoutMs = 20_000) {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr!.on('data', (d) => (stderr += String(d)));
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`服务提前退出（${child.exitCode}）：${stderr}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.status === 200) {
        return {
          port,
          health: (await res.json()) as unknown,
          stop: async () => {
            child.kill('SIGTERM');
            return exited;
          },
        };
      }
    } catch {
      // 还没开始监听
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`服务 ${timeoutMs}ms 内没有就绪：${stderr}`);
}
