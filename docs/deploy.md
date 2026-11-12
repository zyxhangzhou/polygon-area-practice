# 部署与排障（Render）

线上环境由仓库根目录的 [`render.yaml`](../render.yaml)（Render Blueprint）声明：

- 一个 Docker Web 服务，用仓库的 `Dockerfile` 构建；
- 一个 PostgreSQL 17 数据库。

两者都是免费档，区域为新加坡。仓库中没有任何连接串或密码：`DATABASE_URL` 由 Render 在部署时注入，指向内网地址。

## 首次部署

1. 登录 Render 控制台，选择 **New → Blueprint**。
2. 授权 Render 读取这个 GitHub 仓库。仓库是私有的，需要在 GitHub App 授权中勾选它。
3. 选择仓库和分支。合并前验证用 `change/deploy-render`，合并后用 `main`。
4. Render 读取 `render.yaml`，列出两个资源：
   - `polygon-area-practice`（Web）；
   - `polygon-area-db`（Postgres）。
   确认后点 **Apply**。
5. Render 先创建数据库，再构建镜像、启动服务。服务启动时会：
   1. 自动执行迁移，写入题库；
   2. 开始监听 Render 注入的 `PORT`；
   3. 通过 `/api/health` 的健康检查后，开始接收流量。
6. 部署成功后，运行冒烟检查（见下节）。

合并后把 Blueprint 的分支改为 `main`：Blueprint 页面 → Settings → Branch。之后 main 上 GitHub 的检查（CI）通过后会自动部署（`autoDeployTrigger: checksPass`）；CI 失败的提交不会上线。

## 部署后检查

```bash
npm run smoke -- https://<服务地址>.onrender.com
```

依次检查 6 步：
1. 健康检查；
2. 首页；
3. 创建学生；
4. 开始练习；
5. 提交一次作答；
6. 读取会话状态。

每步都会打印请求 ID。任一步失败时，脚本以退出码 1 退出，并输出失败的步骤、HTTP 状态、请求 ID 和响应开头。第 1 步最多等 90 秒，给休眠中的免费实例留出冷启动时间。本地 Docker Compose 也可以用：`npm run smoke -- http://localhost:3000`。

检查会在库里留下一个昵称为 `smoke` 的匿名学生，与真实学生一样，不影响别人。

## 代理层数（`TRUST_PROXY_HOPS`）

限流按客户端 IP 计数。请求经过 Render 的代理才到达服务，真实 IP 在 `X-Forwarded-For` 中。`TRUST_PROXY_HOPS` 表示信任几层代理：

- 设少了：所有人按代理的 IP 计数，会互相影响；
- 设多了：客户端伪造的 IP 可能被采用，从而绕过限流。

实测方法：

```bash
curl -s -o /dev/null -H 'X-Forwarded-For: 203.0.113.9' https://<服务地址>/api/health
```

然后在 Logs 中找到这条请求的 `incoming request` 日志，查看 `req.remoteAddress`：

| `remoteAddress` | 结论 |
|---|---|
| 本机的公网 IP | 层数正确 |
| `203.0.113.9`（伪造值） | 层数设多了 |
| `10.x` 等内网地址，或 Cloudflare 的地址（如 `104.16.0.0/13`、`172.64.0.0/13` 段） | 层数设少了 |

本机的公网 IP 可以用 `curl -s https://api.ipify.org` 查询。

实测结果：见下方"实测记录"。

## 看日志

- Render 控制台 → `polygon-area-practice` → **Logs**。
- 日志是 pino 输出的 JSON，每条带 `reqId`；同一个值也在响应头 `x-request-id` 中返回。
- 定位某次请求：
  1. 先按时间和路径（如 `/attempts`）找到这次请求；
  2. 再搜索它的 `reqId`，可以看到这次请求的全部日志，包括 5xx 的错误堆栈。
- 部署失败时，看 **Events** 中这次部署的构建日志和启动日志。

## 回滚

1. Render 控制台 → `polygon-area-practice` → **Events**。
2. 找到上一次成功的部署，点 **Rollback**。

数据库迁移只做向前兼容的变更（只加不删），所以回滚应用代码时不需要回滚数据库。

另外：新版本的健康检查不通过时，Render 会继续运行上一个版本，不会切换流量。

## 导出数据

数据库默认只允许内网连接（`ipAllowList: []`）。需要导出时：

1. 数据库页面 → **Networking**，临时加入本机 IP。
2. 复制 **External Database URL**，执行：

   ```bash
   pg_dump --no-owner --format=custom -f polygon-$(date +%F).dump '<External Database URL>'
   ```

   连接串只在命令行中使用，不写入仓库或 `.env.example`。
3. 导出后删除刚才加入的 IP。

恢复：`pg_restore --no-owner -d '<连接串>' polygon-<日期>.dump`。

## 已知限制

- **休眠**：免费实例闲置约 15 分钟后休眠，下一次访问需要等待冷启动（约 30–60 秒）。展示前先访问一次。
- **数据库过期**：免费 Postgres 创建约 30 天后过期，过期后需要重建。重建后题库由启动流程自动写入，作答记录会丢失。
- **没有自动备份**：需要时按上面的方法手动导出。
- **限流计数在内存中**：重启后清零；只有一个实例，不跨实例共享。
- **字体**：标题用自托管的思源宋体，正文用系统黑体（苹方、微软雅黑等），各平台的正文外观会略有差异。
- **没有登录**：换浏览器或清除缓存后，找不到原来的学生和练习记录。

## 常见故障

| 现象 | 原因与处理 |
|---|---|
| 部署卡在健康检查，最后失败 | 看这次部署的启动日志：<br>- "数据库准备失败"：数据库还没就绪或连接串不对，检查 `polygon-area-db` 的状态；<br>- "配置错误"：按提示检查环境变量。 |
| 页面打开很慢 | 实例在休眠，等待冷启动（见已知限制）。 |
| 学生看到"操作太频繁了" | 同一 IP 超出频率上限，`Retry-After` 秒后自动恢复。如果很多学生共用一个出口 IP，看日志中 429 的 `remoteAddress` 是否都相同；都相同时检查 `TRUST_PROXY_HOPS`。 |
| 冒烟检查第 2 步失败 | 镜像中缺少前端构建产物，检查构建日志中 `npm run build` 是否成功。 |

## 实测记录

2026-11-12，用带伪造 `X-Forwarded-For: 203.0.113.9` 的请求逐层实测：

| `TRUST_PROXY_HOPS` | 日志中的 `remoteAddress` | 结论 |
|---|---|---|
| 1 | `10.x` 内网地址 | 第 1 层是 Render 的内网代理 |
| 2 | `104.22.66.125`（Cloudflare 边缘节点） | 第 2 层是 Cloudflare |
| 3 | 本机的公网 IP | 正确：伪造的值没有被采用 |

请求链路：浏览器 → Cloudflare 边缘 → Render 内网代理 → 本服务，所以线上取 `3`。

Render 如果调整了网络架构，层数可能变化。每次怀疑限流异常时，按上面的方法重新实测。
