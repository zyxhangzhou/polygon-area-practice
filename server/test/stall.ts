import net from 'node:net';
import { TEST_DATABASE_URL } from './helpers.js';

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

/** 假数据库：接受 TCP 连接，但从不回应任何数据 */
export async function startSilentServer() {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on('error', () => {});
    s.on('close', () => sockets.delete(s));
  });
  const port = await listen(server);
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/none`,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * 指向测试库的 TCP 代理。freeze() 后双向数据都被丢弃（模拟网络卡住、数据包丢失），
 * unfreeze() 后恢复转发；冻结期间丢掉的数据不会补发，卡住的查询永远等不到回应。
 */
export async function startFreezableProxy() {
  const target = new URL(TEST_DATABASE_URL);
  let frozen = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port || 5432), target.hostname);
    for (const s of [client, upstream]) {
      sockets.add(s);
      s.on('error', () => {});
      s.on('close', () => sockets.delete(s));
    }
    client.on('data', (d) => {
      if (!frozen) upstream.write(d);
    });
    upstream.on('data', (d) => {
      if (!frozen) client.write(d);
    });
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  const port = await listen(server);
  const url = new URL(TEST_DATABASE_URL);
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return {
    url: url.toString(),
    freeze: () => {
      frozen = true;
    },
    unfreeze: () => {
      frozen = false;
    },
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
