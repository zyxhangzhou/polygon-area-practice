# Design

## Context

- `GET /api/sessions/:id/summary` 返回 `SessionView`，每题另附：
  - `outcome`、`reviewReason`；
  - `facts`：作答、答错、跳过次数，常见错误答案，三种行为，以及三种行为是否发生在答对之前；
  - `prompt`、`knowledgePoint`。

  前端的 `SummaryResponse` 类型直接取自后端（E 的 D3）。
- 会话结束后仍可以获取解析，上报的学习事件会写入，但 `seq` 大于 `completed_seq`，不计入总结（D 的 D5）。
- E 已完成：
  - 答题页遇到已结束的会话，转到 `/summary`；
  - 首页对已结束的会话显示"再练一次 / 查看总结"；
  - `PracticeStore` 提供 `fetchQuestion`、`fetchExplanation`、`reportTextOpened`；
  - 题目页里有 `useLoad`、`LoadFailed`、`Figure`。
- 视频在 I，小镇建筑在 H，F 都不涉及。

## Goals / Non-Goals

**Goals:**
- 总结页上的数字、分类、原因都原样来自接口，不重新计算。
- 建议由一个纯函数生成，便于逐条测试规则。
- 回看复用答题页已有的组件和读取逻辑。

**Non-Goals:**
- 视频回看（I）。
- 跨会话的历史对比。
- 总结页的视觉精修和小镇插画（H）。

## Decisions

### D1 页面结构

`/summary` 自上而下：
1. 标题与鼓励语；提前结束时，加一句说明。
2. 统计卡片：首次正确率、最终完成率，三类题数 / 总题数。
3. 建议列表。
4. 三个分组，每组列出题目。每题显示：
   - "第 n 题 · 知识点"；
   - 题干摘要：前 40 个字，超出部分用省略号；
   - 需回顾的题加原因标签；
   - "回看"按钮。
5. "再练一次"按钮；底部再放一个"回到首页"。

点击"回看"在该题下方展开回看面板，一次只展开一题。不另开路由：回看只是总结页的局部，刷新后收起也可以接受。

### D2 读取与跳转

- `sessionId` 取自 `PracticeStore` 或浏览器存储，按以下情况处理：
  - 没有 `sessionId` → 回首页；
  - `GET /summary` 返回会话进行中 → 转到 `/practice/当前题`；
  - 返回 `SESSION_NOT_FOUND` → 清除存储，回首页；
  - 结果不确定 → `LoadFailed`，提供"重新读取"。
- 读取直接调用 `request`，不放进 `PracticeStore`：总结是只读页面，没有写队列需要协调。
- 回看的题目详情和解析复用 `store.fetchQuestion` / `fetchExplanation`。解析显示出来后，调用 `store.reportTextOpened`，和答题页的规则相同。

### D3 建议的纯函数

`web/src/summary/advice.ts` 导出 `buildAdvice(summary): { encouragement: string; suggestions: string[] }`。

- 输入只用 `counts`、`session.endedEarly`，以及每题的 `position`、`outcome`、`reviewReason`、`facts`、`knowledgePoint`。
- 题号用 `position`（学生看到的"第 n 题"）。
- 按 study-advice 规定的类别顺序生成，每类一句。
- 第 1 类按"最具体的行为"把题归到一组：
  - `videoCompletedBeforeSolved` → 看完了视频解析；
  - `videoStartedBeforeSolved` → 播放了视频解析；
  - `textOpenedBeforeSolved` → 打开了图文解析。

  一句里可以有多个分组，例如"第 4 题看完了视频解析、第 2 题打开了图文解析后做对了"。
- 第 2 类：`outcome === 'corrected'`、`wrongCount > 0`，且三个 `BeforeSolved` 都是 false。

  订正后做对、却没有答错过、也没有任何行为的情况不会出现：这类题要么是跳过后直接答对（归为一次做对），要么一定有行为。
- 措辞模板集中写在一处，测试检查输出不含"看懂""掌握"。

### D4 开始 / 再练一次共用

首页的 `start()` 抽成 `web/src/practice/start.ts` 的 `startPractice(store)`。它负责：
1. 没有学生就创建学生；
2. `POST /api/sessions`；
3. 学生已失效时清除并重建一次；
4. 保存 `sessionId`，用 `store.useSession`，进入当前题。

返回 `{ ok: true }` 或 `{ ok: false, message }`。首页和总结页都调用它；首页行为不变，首页的测试保持通过即可证明。

### D5 测试

- `advice.test.ts`：study-advice 的每个场景一条测试，并覆盖：
  - 行为发生在答对之后，不说"后做对"；
  - 三种行为的优先级；
  - 同类合并；
  - 知识点去重。
- `SummaryPage.test.tsx`（模拟 `fetch`）：
  - 数字与接口一致；
  - 三组与原因标签；
  - 空组的说明；
  - 回看展开后显示作答概况和解析，并上报事件；
  - 再练一次进入新会话；
  - 会话进行中时跳转、会话失效时回首页、读取失败后重新读取。
- 真实运行：用开发库里 E 实跑留下的已结束会话，打开总结页核对数字，回看一题，再练一次；记入 `docs/verification.md`。

### D6 练习记录（评审时加入）

- **后端**：`listLearnerSessions` 在只读事务里查这个学生最近 20 次练习，逐个调用 `computeSummary`，与总结接口同一口径。每次练习最多十几题、几十条记录，20 次的查询量很小。
- **前端路由**：
  - `/history`：练习记录页；
  - `/summary/:sessionId`：指定会话的总结；`/summary` 仍是当前会话的总结。
- **回看用单独的 store**：总结页为所看的会话新建一个 `PracticeStore`，用于回看。应用的 store 只在"再练一次"时使用。这样查看旧练习不会改动浏览器里保存的当前会话。
- **清除规则**：只有 `SESSION_NOT_FOUND`、`LEARNER_NOT_FOUND` 才清除保存的标识；查看的是旧会话时，只回到练习记录页。

### D7 建议复习的知识点（评审时修改）

建议复习只列练过的题的知识点，依次为答错还没改对、订正后做对、跳过。没作答的题单独一句"还有 N 题没练，下次可以继续挑战。"。这样做了两题就提前结束时，不会列出 10 个知识点。

## Risks / Trade-offs

- [建议是模板拼接，读起来比较机械] → 优点是可测、不会编造。措辞面向五年级学生，句子要短；最终由 H 的圆圆来说这些话。
- [回看不另开路由，刷新后会收起] → 总结页本身能恢复，代价很小。
- [回看时上报的事件写进库里但不计入统计] → 与 D 的设计一致，保留真实行为，统计口径不受影响。
