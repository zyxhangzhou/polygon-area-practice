import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const defaultWebDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL 未设置' })
    .min(1, 'DATABASE_URL 不能为空')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL 必须以 postgres:// 开头'),
  PORT: z.coerce
    .number({ error: 'PORT 必须是数字' })
    .int('PORT 必须是整数')
    .min(1)
    .max(65535)
    .default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEB_DIST_DIR: z.string().min(1).default(defaultWebDist),
});

export type Config = {
  databaseUrl: string;
  port: number;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  nodeEnv: z.infer<typeof EnvSchema>['NODE_ENV'];
  /** 生产模式下托管的前端构建目录；非生产模式为 undefined（由 Vite 提供页面） */
  webDistDir: string | undefined;
};

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`配置错误：\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** 只在进程入口调用；应用内部与测试通过参数拿到 Config，不直接读 process.env。 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    nodeEnv: e.NODE_ENV,
    webDistDir: e.NODE_ENV === 'production' ? e.WEB_DIST_DIR : undefined,
  };
}
