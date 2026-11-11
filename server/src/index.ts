import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { prepareDatabase } from './db/prepare.js';
import { describeError } from './errors.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      console.error('请参考仓库根目录的 .env.example 配置环境变量。');
      process.exit(1);
    }
    throw err;
  }

  const app = await buildApp(config);

  // 先迁移、写入题库，再对外服务；失败直接退出，不带着残缺的表结构运行
  try {
    await prepareDatabase(config.databaseUrl, app.log);
  } catch (err) {
    app.log.error({ err }, 'database preparation failed');
    const target = new URL(config.databaseUrl);
    console.error(
      `数据库准备失败（迁移或写入题库）：${describeError(err)}\n` +
        `  连接目标：${target.hostname}:${target.port || 5432}${target.pathname}`,
    );
    await app.close().catch(() => {});
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return; // 重复的信号忽略
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    // 兜底：连接卡住等原因导致 10 秒内关不完时强制退出
    setTimeout(() => {
      app.log.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
