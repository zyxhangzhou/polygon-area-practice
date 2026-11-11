# Tasks

## 1. 测试与基础设施

- [x] 1.1 `web` 加入 vitest、jsdom、@testing-library/react、@testing-library/user-event、@testing-library/jest-dom 和 `vitest.config.ts`；根目录 `npm test` 依次运行 server 和 web 的测试；验证：一个冒烟测试在本地通过，`npm test` 输出中能看到两个工作区的结果
- [x] 1.2 `api.ts`：`request` 返回 `ok` / `rejected` / `uncertain`（D2），10 秒超时；`types.ts` 用 `import type` 导入后端的响应类型（D3）；验证：单元测试覆盖 2xx、带错误码的 4xx、不带错误码的 4xx、5xx、非 JSON、`fetch` 抛错、超时
- [x] 1.3 `storage.ts`（只保存 `learnerId`、`sessionId`，读写包 `try/catch`）与路由钩子（D1）；验证：单元测试覆盖存储不可用、`pushState` 与后退

## 2. 状态与写队列

- [x] 2.1 `PracticeStore`：保存最近一次 `SessionView`，按错误码处理（D5），维护写队列和"等待重试"（D4）；验证：单元测试覆盖顺序执行、结果不确定时停止并用同一个键和内容重发、学习事件重试 3 次后放弃并继续、各错误码的处理
- [x] 2.2 作答响应的显示规则（D6）；验证：单元测试覆盖 `alreadySolved`、重放与当前状态矛盾、正常重放显示结果

## 3. 页面

- [x] 3.1 首页（D7）；验证：组件测试覆盖打开时不发写请求（StrictMode 下）、三种按钮状态、会话失效时清除
- [x] 3.2 图形组件（D9）；验证：测试用题库的 12 道题逐一渲染，每题都有 SVG，逆运算题显示"?"，不显示答案
- [x] 3.3 答题页：进度、题目、输入、反馈、"再试一次 / 看图文解析 / 先跳过"、解析面板与上报、题目导航、地址中的题号校验（D1、D8）；验证：组件测试覆盖 practice-pages 的答题页、反馈、解析、跳过、刷新恢复场景，以及连点只发一次
- [x] 3.4 结束练习与 `/summary` 占位页；验证：组件测试覆盖做完后结束、提前结束取消与确认、`SESSION_COMPLETED` 转到总结页

## 4. 真实运行与文档

- [x] 4.1 前后端都启动，在浏览器中完整做完 12 题：包括答错、看解析后订正、跳过、回去重做、中途刷新、中途停掉后端再提交（应提示结果不确定）、恢复后重试只记录一次；结果记入 `docs/verification.md`（浏览器窗口最小化无法截图，改用页面状态与数据库查询作为证据）
- [x] 4.2 README 补充前端测试的运行方法；在计划的 Follow-ups 中标注重放显示规则已由 E 取代；`npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/practice-ui` 到 `main`（squash），在计划中将 E 打勾。
- 合并后在下一个 change 的分支上执行 `openspec archive practice-ui`。
