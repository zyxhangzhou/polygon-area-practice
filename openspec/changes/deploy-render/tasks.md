# Tasks

## 1. 限流

- [x] 1.1 `TRUST_PROXY_HOPS` 配置与 `trustProxy`（D3）；验证：配置测试覆盖默认值 0、合法整数、非法值退出并指明 `TRUST_PROXY_HOPS`
- [x] 1.2 注册 `@fastify/rate-limit`：全局上限、健康检查与非 API 请求放行、创建学生的路由级上限、`RATE_LIMITED` 统一错误格式（D2）；验证：`server/test/rate-limit.test.ts` 覆盖 request-rate-limits 的全部场景，包括被限的作答没有写库、`Retry-After` 存在、伪造 `X-Forwarded-For` 在两种配置下的计数
- [x] 1.3 前端 `RATE_LIMITED`（D4）；验证：store 测试覆盖作答被限后保留为待重试、用同一个键重试成功、学习事件被限时直接放弃

## 2. 上线配置与脚本

- [x] 2.1 `render.yaml`（D1）；验证：字段与 Render Blueprint 文档一致，仓库中没有连接串或密码
- [x] 2.2 `scripts/smoke.mjs` 与 `npm run smoke`（D5）；验证：对本地 Docker Compose 运行 6 步通过；对不可达地址运行时退出码非零并指出第 1 步
- [x] 2.3 `docs/deploy.md`，README 增加链接（D7）

## 3. 上线与验证

- [x] 3.1 `npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过
- [ ] 3.2 用户在 Render 用 Blueprint 创建环境（G 的分支），部署成功
- [ ] 3.3 对公网地址运行冒烟检查通过；按 D3 实测并确认 `TRUST_PROXY_HOPS`，记入 `docs/deploy.md`
- [x] 3.4 在公网地址上用浏览器完整练习一遍，直到总结页；结果记入 `docs/verification.md`

## Workflow follow-up

- 开 PR 合并 `change/deploy-render` 到 `main`（squash），在计划中将 G 打勾。
- 合并后，用户在 Blueprint 设置中把分支改为 `main`。
- 在下一个 change 的分支上执行 `openspec archive deploy-render`。
