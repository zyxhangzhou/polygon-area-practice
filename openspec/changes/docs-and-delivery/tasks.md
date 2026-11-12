# Tasks

## 1. 文档

- [x] 1.1 README 按 D1 补全：简介与截图、功能对照、系统结构图、数据模型、统计口径、可靠性、取舍、测试、部署摘要、文档索引、提交说明；验证：数据模型与 `schema.ts` 一致，接口表与路由一致，链接都能打开
- [x] 1.2 `docs/ai-collaboration.md`：3 段代表性记录（D2），引用会话原文；验证：每段都有任务输入、AI 产出、本人判断、验证结果，且隐去了个人信息
- [x] 1.3 `docs/delivery.md`：测试结果、已验证场景对照、已知问题、未完成项、投入时间、复用内容、外部服务与成本（D3）
- [x] 1.4 `docs/demo-script.md`（D5）

## 2. 验证

- [x] 2.1 干净环境验证（D4），结果记入 `docs/delivery.md`
- [x] 2.2 在线上按演示脚本演练一遍，记录发现的问题并处理
- [x] 2.3 `npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/docs-and-delivery` 到 `main`（squash），在计划中将 J 打勾，计划状态改为完成。
- 合并后执行 `openspec archive docs-and-delivery`（最后一个 change，在 main 上的一个小分支中提交）。
