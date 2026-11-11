# Design

## Context

- `web/` 只有 A 的骨架页：React 19、Vite 8、TypeScript，没有路由库，也没有测试。
- `main.tsx` 开启了 StrictMode，开发时 effect 会执行两次。
- 生产环境由 Fastify 托管前端，并把页面导航回退到 `index.html`（app-hosting），所以任意路径刷新都能加载应用。
- D 的接口与响应结构见 `openspec/specs/practice-*`，以及 D 的 design D7。后端判题、计算进度，前端只负责展示。
- 重放规则：D 的 design D4 写了"收到 `replayed: true` 时只按 `session` 刷新"，计划的 Follow-ups 也记了这一条。但大纲 §5 规定，结果不确定时用同一个键重试，后端返回首次结果；照那条规则，这种情况下学生就看不到结果了。E 的 practice-client-sync 改为"显示 `result`，除非与 `session` 矛盾"，取代那两处说法。

## Goals / Non-Goals

**Goals:**
- 每个接口结果的处理方式都集中在一处：成功、被拒绝、结果不确定。页面不各自解析错误。
- 前端不保存任何进度，所有状态只从后端最近一次返回的会话状态中读取。
- 用前端测试覆盖可靠性规则；再用真实的前后端完整跑一遍，验证验收条件。

**Non-Goals:**
- 小镇地图、建筑动画、圆圆（H）。E 的反馈只有文字，加上简单的点亮标记。
- 视频按钮与播放（I）。
- 总结页内容（F）。E 的 `/summary` 只是占位：显示"练习已结束"和返回首页的链接。
- 视觉精修与适配平板以外的设备。

## Decisions

### D1 路由：不加路由库

只有 3 个页面，用 `location.pathname` 加 `history.pushState` 写一个小的路由钩子即可，监听 `popstate` 处理浏览器后退：

| 路径 | 页面 |
|---|---|
| `/` | 首页 |
| `/practice/:qid` | 答题页；`/practice` 不带题号时转到当前题 |
| `/summary` | 总结占位页（F 替换） |

刷新答题页时，地址中的题优先，这样学生刷新后留在原来那道题。题号不合法、不在快照中或所在关卡未解锁时，用 `replaceState` 转到 `currentQuestionId`。`currentQuestionId` 为空（所有题都已答对）时，显示"完成练习"。

备选方案 react-router：多一个依赖，3 个页面用不上它的功能。

### D2 接口客户端：一个函数给出三类结果

`api.ts` 只导出一个 `request(method, path, body?)`，它返回以下三种之一：

```ts
type ApiResult<T> =
  | { kind: 'ok'; status: number; data: T }
  | { kind: 'rejected'; status: number; code: string; message: string; reason?: string }
  | { kind: 'uncertain' };
```

- 每个请求都用 `AbortController` 设 10 秒超时。
- 以下情况都算 `uncertain`：`fetch` 抛错、超时、5xx、响应无法解析为 JSON，或 4xx 但没有 `error.code`。
- 后端停止时，Vite 开发代理返回 5xx 或连接错误，也归为 `uncertain`。
- 带 JSON 请求体时一律发送 `{}` 或具体对象，不发空请求体。D 的 Follow-up：带 JSON 头的空请求体会被 Fastify 拒绝。

### D3 响应类型直接导入后端类型

前端用 `import type` 导入后端的 `SessionView`、`AttemptResult` 等类型（`server/src/practice/view.ts`、`service.ts`）。已验证这些导入能通过 `web/tsconfig.json` 的类型检查；构建时只导入类型的语句会被删掉，不会把后端代码打进前端。后端改了响应结构，前端的类型检查会直接报错。

备选方案"前端手写一份类型"：两边会悄悄变得不一致，而前端测试用的是模拟的 `fetch`，发现不了。

### D4 写请求队列与幂等键

`PracticeStore` 持有会话状态，并维护一个写队列：

- **入队**：学生的每个写操作（作答、跳过、学习事件、结束）生成幂等键后入队，前一个完成后再发下一个。保证学习事件的 `seq` 一定小于之后那次作答的 `seq`。
- **结果不确定**：
  - 作答、跳过、结束：停止发送后面的请求，状态记为"等待重试"。界面只提供"再提交一次"，用同一个键和完全相同的内容重发。后端比较原始输入，所以内容必须原样保留。
  - 学习事件：用同一个键自动重试，最多 3 次，间隔 1 秒和 2 秒。仍不确定就放弃，继续发送后面的请求，并在控制台记录。行为事实会少一条，作答记录不受影响。
- **被拒绝**：按错误码处理（见 D5），队列继续。
- **刷新页面**：队列和"等待重试"都不保存，以后端状态为准。

提交中和等待重试时，提交、跳过、结束按钮都禁用。

### D5 状态只来自后端

- `PracticeStore` 只保存最近一次后端返回的 `SessionView`。作答、跳过、结束的响应里带有会话状态，直接替换。
- 页面需要的题目状态、关卡解锁与点亮、当前题、能否完成、统计，都从这里读取，不在前端推算。
- 题目详情和解析按需请求，按题号缓存在内存里。

错误码的处理：

| 错误码 | 处理 |
|---|---|
| `SESSION_NOT_FOUND` | 清除保存的会话，回首页 |
| `LEARNER_NOT_FOUND` | 清除保存的学生和会话，回首页 |
| `SESSION_COMPLETED` | 转到 `/summary` |
| `STAGE_LOCKED`、`QUESTION_NOT_IN_SESSION` | 重新获取会话状态，转到当前题 |
| `NOT_FINISHED` | 重新获取会话状态 |
| `INVALID_ANSWER` | 在输入框旁显示 `message` |
| `EXPLANATION_LOCKED` | 重新获取会话状态（按钮本不该出现） |
| 其他 | 显示 `message` |

### D6 重放与"已答对"的显示

作答响应按以下顺序处理：

1. `alreadySolved` 为 true → 显示"这道题已经做对了"。
2. `result.correct` 为 false，但 `session` 中该题为 `solved` → 不显示反馈，只刷新。
3. 其他情况 → 按 `result` 显示反馈，`replayed` 不影响显示。

### D7 首页与创建时机

- 打开首页时，只用保存的 `sessionId` 调用 `GET /api/sessions/:id` 决定按钮，不创建学生或会话。`POST /api/learners` 不是幂等的，放在 effect 里，StrictMode 下会建出两个学生。
- 点击"开始练习"或"再练一次"时：没有 `learnerId` 就先创建学生，再调用 `POST /api/sessions`，保存返回的 `sessionId`，进入当前题。
- 浏览器存储（`localStorage`）只保存 `learnerId` 和 `sessionId`。读写都包在 `try/catch` 里：隐私模式下不可用时，退化为只在当前页面有效。

### D8 答题页

- **输入框**：`<input type="text" inputMode="decimal">`，平板上弹出数字键盘。不用 `type="number"`，否则浏览器会吞掉全角数字和单位，学生就看不到后端针对这些输入的提示。提交时原样发送，前端只拦下空输入。
- **反馈**：由 `result.outcome`、`stageLit`、`mistakeHint` 决定显示哪一种：一次做对、订正后做对、点亮关卡、答错。
- **刷新恢复**：刷新后只能恢复题目状态，比如"答错"状态和三个选项；上一次的提示文字不保存。
- **"看图文解析"**：只在题目状态为 `wrong`、`skipped`、`solved` 时显示。解析面板显示出来后，`explanation_text_opened` 才入队。同一题在同一页面只上报一次。
- **"完成练习"**：`canFinish` 时显示，附带跳过的题数。"提前结束"放在进度区域，用确认对话框确认后调用 `complete(true)`。

### D9 图形绘制

每种图形一个 SVG 组件，共 6 种：平行四边形（含逆运算题）、三角形、直角三角形、梯形、房子形、L 形。

- 按参数等比例缩放到固定画布，标注题干给出的边长。
- 逆运算题（`unknown`）：所求的边按默认比例画出，标"?"。
- 面积标注写在图形里。
- 用题库的 12 道题做测试：每道都能画出来，并且不显示答案。

### D10 测试

- `web` 加入开发依赖 vitest、jsdom、@testing-library/react、@testing-library/user-event、@testing-library/jest-dom，用 `vitest.config.ts`（jsdom 环境）。
- 根目录 `npm test` 改为依次运行 server 和 web 的测试，CI 不用改。
- 测试内容：
  - 接口客户端：三类结果的分类，包括超时、非 JSON、5xx。
  - 写队列：顺序执行；结果不确定时用同一个键重发；学习事件重试后放弃。
  - 页面：
    - 用模拟的 `fetch` 跑首页和答题页的主要场景；
    - 首页打开时不创建学生；
    - 连点只发出一次请求；
    - 重放结果已过时；
    - 错误码跳转。
  - 图形：12 道题都能画出来。
- **真实运行**：前后端都启动，在浏览器里做完 12 题。中途刷新；中途停掉后端再提交。结果和截图记入 `docs/verification.md`。

## Risks / Trade-offs

- [学习事件放弃后，行为事实少一条] → 只在连续 4 次都不确定时发生，此时后端多半不可用，作答也无法提交。作答记录和分类不受影响，只是"看过解析"可能没被记录。
- [等待重试时界面被锁住] → 学生始终可以刷新页面，刷新后以后端状态为准。锁住是为了保证重试时内容不变。
- [直接导入后端类型，两个工作区耦合] → 只导入类型，不导入运行代码。好处是后端改了响应结构，前端类型检查会立刻报错。
- [没有路由库] → 路径只有 3 种。以后页面多了再换 react-router，页面组件不受影响。
- [Render 免费实例冷启动约 30 秒] → 页面本身由同一个服务提供，页面能打开时后端已经醒了；10 秒的请求超时只影响运行中的请求。
