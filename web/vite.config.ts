import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 开发服务器端口与后端端口从仓库根目录的 .env 读取（与后端共用同一个 .env）
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const webPort = Number(env.WEB_DEV_PORT || 5173);
  const apiPort = Number(env.PORT || 3000);
  return {
    plugins: [react()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  };
});
