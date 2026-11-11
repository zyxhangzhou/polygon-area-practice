# Tasks

## 1. 建议生成

- [x] 1.1 `web/src/summary/advice.ts` 的 `buildAdvice`（design D3）；验证：`advice.test.ts` 覆盖 study-advice 的全部场景，以及行为发生在答对之后不说"后做对"、三种行为的优先级、同类合并、知识点去重、输出不含"看懂""掌握"

## 2. 页面

- [x] 2.1 抽出 `startPractice`（D4），首页改为调用它；验证：首页已有测试全部通过
- [x] 2.2 `SummaryPage`：统计、鼓励语与建议、三组列表与原因、提前结束说明、再练一次、读取与跳转（D1、D2）；验证：组件测试覆盖数字与接口一致、三组与原因、空组说明、提前结束说明、再练一次进入新会话、进行中跳到答题页、会话失效回首页、读取失败重新读取
- [x] 2.3 回看面板：图形、题干、作答概况、图文解析与上报，一次展开一题；验证：组件测试覆盖展开后的内容、上报"打开图文解析"、没有作答入口

## 3. 真实运行与文档

- [x] 3.1 用开发库中已结束的会话打开总结页，核对数字与 `GET /summary` 一致，回看一题，点"再练一次"进入新会话；结果记入 `docs/verification.md`
- [ ] 3.2 `npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/summary-ui` 到 `main`（squash），在计划中将 F 打勾。
- 合并后在下一个 change 的分支上执行 `openspec archive summary-ui`。
