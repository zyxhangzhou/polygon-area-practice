import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // 测试文件共用一个测试库，串行执行，避免互相清数据
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
