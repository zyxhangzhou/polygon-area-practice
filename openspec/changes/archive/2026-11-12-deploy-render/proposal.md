# Proposal

## Why

作品要在 11/13 展示，需要一个评审可以直接打开的公网地址。部署问题越早发现越好修，所以在 H、I 之前先上线（计划 G）。一旦对公网开放，还需要最基本的防滥用措施（大纲 §5"公网滥用"）。

A 已经完成了一部分上线准备，本次直接复用：
- 多阶段 Dockerfile；
- 生产模式下由同一端口托管前端（app-hosting）；
- 启动前自动迁移和写入题库，带 advisory lock 和超时（service-operations）。

## What Changes

- **`render.yaml`（Render Blueprint）**：
  - 一个 Docker Web Service 和一个 Postgres 17，都用免费档，放在同一区域；
  - 数据库只允许 Render 内网连接，连接串由 Render 注入，仓库里没有任何密钥；
  - 健康检查用 `/api/health`；
  - main 分支的 CI 通过后才自动部署。
- **请求频率限制**：
  - `/api/` 下每个 IP 每分钟最多 300 次请求，创建学生每小时最多 60 次；
  - 健康检查和静态页面不限；
  - 超出时返回 `429 RATE_LIMITED`，使用统一错误格式，并带 `Retry-After`；
  - 部署在代理后面时，按配置的代理层数取客户端 IP，伪造的 `X-Forwarded-For` 绕不过限制。
- **前端**：写请求被限流时，保留这次提交，学生可以"再提交一次"（沿用同一个幂等键）。不会把作答丢掉。
- **线上冒烟检查脚本** `npm run smoke -- <地址>`：依次检查健康、页面、创建学生、开始练习、作答、总结，本地和线上都能用。
- **部署文档** `docs/deploy.md`：首次部署、看日志、回滚、导出数据，以及已知限制（休眠后首次访问较慢、免费数据库约 30 天过期、没有自动备份）。
- **真实上线**：在公网地址上用浏览器完整练习一遍，结果记入 `docs/verification.md`。

## Capabilities

### New Capabilities
- `request-rate-limits`：对公网 API 的请求频率限制：限多少、按什么识别客户端、超限时怎么响应、哪些路径不限。
- `production-deployment`：线上环境的约定：服务和数据库如何声明、密钥放在哪里、什么时候自动部署，以及上线后怎么检查。

### Modified Capabilities
- `practice-client-sync`："错误码处理"新增 `RATE_LIMITED`：写请求被限流时保留，等学生再提交一次。

## Impact

- 新增：
  - `render.yaml`；
  - `docs/deploy.md`；
  - `scripts/smoke.mjs` 和根目录 `npm run smoke`；
  - 限流插件注册与测试 `server/test/rate-limit.test.ts`。
- 修改：
  - `server/src/config.ts`：新增 `TRUST_PROXY_HOPS`；
  - `server/src/app.ts`：设置 `trustProxy`，注册限流；
  - `web/src/practice/store.ts`：处理 `RATE_LIMITED`；
  - README：增加线上地址和部署说明的链接。
- 新依赖：`@fastify/rate-limit`。
- 需要用户操作：在 Render 控制台用 Blueprint 连接这个私有仓库。Render 需要 GitHub 授权，这一步无法由 AI 代做。
- 不在范围内：自定义域名、自动备份、多实例共享限流计数。
