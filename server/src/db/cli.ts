/**
 * 手动执行迁移或种子（排障用；服务启动时会自动执行两者）。
 * 用法：node dist/db/cli.js migrate|seed，读取 DATABASE_URL。
 */
import { prepareDatabase } from './prepare.js';

const command = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || (command !== 'migrate' && command !== 'seed')) {
  console.error('用法：DATABASE_URL=... db:migrate | db:seed');
  process.exit(1);
}

const log = { info: (obj: object, msg: string) => console.log(msg, obj) };
prepareDatabase(databaseUrl, log, { migrate: command === 'migrate', seed: command === 'seed' })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`数据库${command === 'migrate' ? '迁移' : '种子'}失败：`, err);
    process.exit(1);
  });
