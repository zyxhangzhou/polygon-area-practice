# Design

## Context

- A 已完成并有测试覆盖：
  - Dockerfile：多阶段构建，运行镜像只含生产依赖，`CMD node dist/index.js`；
  - 配置校验：读取 `PORT`、`DATABASE_URL`；
  - 生产模式托管前端；
  - 启动前迁移和写入题库，带 advisory lock，等锁和执行都有上限；
  - 请求 ID 与 pino JSON 日志。
- Render 免费档的限制：
  - 没有 pre-deploy 命令，所以迁移放在启动流程里（A 已这样做）；
  - 闲置约 15 分钟后休眠，再次访问需要冷启动；
  - 免费 Postgres 约 30 天后过期，没有备份。
- Render 会把 `PORT` 注入为环境变量。请求经过平台的代理才到达服务，客户端 IP 在 `X-Forwarded-For` 中。
- 前端 `request()` 把带错误码的 4xx 归为"被拒绝"。`PracticeStore` 对未知的错误码只显示提示、丢弃这次写请求；结果不确定时用 `pendingRetry` 保留，等学生"再提交一次"。

## Goals / Non-Goals

**Goals:**
- 从仓库一键创建线上环境，仓库中没有密钥。
- 部署问题在合并前暴露：先从 G 的分支部署、验证，合并后改为跟随 main。
- 冒烟检查脚本既是上线验收，也是之后每次部署后的检查。

**Non-Goals:**
- 多实例：限流计数放在单个进程的内存中。
- CDN、压缩、安全响应头的调优。
- 自定义域名、自动备份（见 proposal）。

## Decisions

### D1 Blueprint

`render.yaml`：

- **Web 服务**：
  - `runtime: docker`、`plan: free`、`region: singapore`（离国内评审最近）；
  - `healthCheckPath: /api/health`；
  - `autoDeployTrigger: checksPass`：GitHub 上的检查通过后才部署，CI 失败的提交不会上线。
- **环境变量**：
  - `DATABASE_URL`：`fromDatabase` 的 `connectionString`，即内网连接串；
  - `NODE_ENV=production`、`LOG_LEVEL=info`；
  - `TRUST_PROXY_HOPS`：取值见 D3。
  - 不写 `PORT`，使用 Render 注入的值。
- **数据库**：
  - `plan: free`、同一区域、`postgresMajorVersion: "17"`；
  - `ipAllowList: []`，只允许内网连接。需要从本机导出数据时，临时在控制台加入本机 IP，见 `docs/deploy.md`。

不设置 `branch`，跟随 Blueprint 选的分支，这样 D6 中切换分支只需在控制台改一处。

**备选：** 不用 Blueprint，在控制台手动创建服务。不选：配置不在仓库里，评审看不到，也无法重复创建。

### D2 限流

- 用 `@fastify/rate-limit`，计数存在内存中。
- 全局注册，`allowList` 放过非 `/api/` 的请求和 `/api/health`：
  - 静态资源不限，否则加载一次页面就会消耗多次额度；
  - 健康检查不限，否则平台的探测可能被 429 判为失败。
- 全局上限：每个 IP 每分钟 300 次。
- `POST /api/learners`：路由级配置，每个 IP 每小时 60 次。
- 超限时：`errorResponseBuilder` 抛出 `AppError(429, 'RATE_LIMITED', '操作太频繁了，请等一会儿再试')`，由统一错误处理输出。插件先设置 `Retry-After` 等响应头，统一错误处理不会清掉它们，实现时用测试确认。
- 限流在 `onRequest` 阶段生效，早于请求体解析和路由处理，被限的请求不会写库。
- 上限通过 `buildApp` 的参数传入，默认就是上面的数字。测试传入较小的值，不必真的发 300 次请求。

### D3 客户端 IP

- 新增配置 `TRUST_PROXY_HOPS`，整数，默认 `0`：
  - `0`：`trustProxy: false`，使用连接的对端地址；
  - `n > 0`：`trustProxy: n`。Fastify 从 `X-Forwarded-For` 右侧往左数 n 跳取客户端 IP，客户端在最左边伪造的值不会被采用。
- Render 前面有几层代理没有可靠的文档，所以 `render.yaml` 的初始值设为 `1`，首次部署后实测确认：
  1. 带伪造的 `X-Forwarded-For: 203.0.113.9` 请求线上接口；
  2. 在线上日志中查看这次请求的 `remoteAddress`；
  3. 应为本机的公网 IP，既不是伪造值，也不是 Render 的内网地址。

  结果不对就调整层数，并把实测过程记入 `docs/deploy.md`。

### D4 前端处理 `RATE_LIMITED`

- 在 `handleRejected` 中处理 `RATE_LIMITED`：
  - 写请求（作答、跳过、结束）：设为 `pendingRetry`，提示后端的 message；
  - 学习事件：仍然直接放弃。
- 复用已有的"再提交一次"流程：同一个幂等键、相同内容，等待期间锁定其他操作。
- 这次请求一定没有被处理，所以不使用"结果不确定"的提示。

### D5 冒烟检查脚本

- `scripts/smoke.mjs`：只用 Node 自带的 `fetch`，没有依赖。根目录的 `npm run smoke -- <地址>` 调用它。
- 6 步依次执行：
  1. `GET /api/health`；
  2. `GET /`，要求返回 HTML；
  3. `POST /api/learners`；
  4. `POST /api/sessions`；
  5. 对当前题 `POST attempts`，答案为 `1`，判对判错都算通过，只检查返回了 `result`；
  6. `GET /api/sessions/:id`，确认这题的作答次数为 1。
- 第 1 步超时设为 90 秒，给免费实例冷启动留出时间；其余每步 15 秒。
- 每步打印结果和 `x-request-id`。失败时打印步骤名、HTTP 状态、请求 ID 和响应体的前 200 个字符，并以退出码 1 退出。

### D6 上线顺序

1. 实现完成、本地通过后，对本地 Docker Compose 跑一次冒烟检查。
2. 推送 G 的分支。用户在 Render 控制台操作：New → Blueprint，选择这个仓库和 `change/deploy-render` 分支。这一步需要用户的 Render 账号和 GitHub 授权。
3. 部署成功后：
   - 对公网地址跑冒烟检查；
   - 按 D3 实测代理层数；
   - 用浏览器完整练习一遍；
   - 结果记入 `docs/verification.md`。
4. PR 合并后，用户在 Blueprint 设置中把分支改为 `main`。之后 main 上的 CI 通过就自动部署。

### D7 运维说明

`docs/deploy.md` 包括：
- 首次部署（D6 第 2 步）；
- 部署后检查（冒烟检查命令）；
- 看日志：控制台 Logs，按路径或 `reqId` 搜索；
- 回滚：Events 中选择上一次成功的部署，点 Rollback。迁移只做向前兼容的变更，所以回滚应用代码不需要回滚数据库；
- 导出数据：临时允许本机 IP，用外部连接串执行 `pg_dump`；
- 已知限制。

README 增加线上地址和这份文档的链接。

## Risks / Trade-offs

- [限流计数在内存中，重启后清零，多实例时各自计数] → 免费档只有一个实例，可以接受，写入已知限制。
- [同一教室共用出口 IP，可能一起触发限制] → 300 次每分钟按单个学生的正常节奏留有很大余量；被限制时前端保留作答，等一会儿可以再提交，不会丢数据。
- [`TRUST_PROXY_HOPS` 配错] → 层数配少，所有人按代理 IP 计数，会互相影响；配多，伪造的值可能被采用。D3 首次部署后实测确认。
- [冷启动约 30–60 秒，评审第一次打开会等] → 写入已知限制。展示前先访问一次唤醒实例。
- [免费数据库约 30 天后过期] → 覆盖 11/13 的展示；过期后需重建，题库由启动流程自动写入，作答记录会丢失。
- [冒烟检查在线上库里留下测试学生] → 与匿名学生没有区别，数量很少，可以接受。

## Migration Plan

- 首次部署见 D6。
- 回滚：Render 控制台回滚到上一次成功的部署。数据库迁移只做向前兼容的变更。
- 撤下线上服务：在 Render 控制台删除 Blueprint 创建的服务和数据库。
