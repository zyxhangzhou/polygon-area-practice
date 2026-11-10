import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

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

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
