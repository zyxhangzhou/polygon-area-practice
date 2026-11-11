import { defineConfig } from 'drizzle-kit';

// 只用于 `npm run db:generate`（生成迁移 SQL），不连接数据库
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
