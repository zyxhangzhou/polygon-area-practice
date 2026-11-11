# Design

## Context

- B 已经建好表：`attempts.normalized_value` 是 `numeric(10,2)`，`attempts.matched_mistake` 是 `text`；作答、跳过、学习事件都带共用序列的 `seq`。
- node-pg 把 `numeric` 读成字符串，例如 `"48.00"`；种子里的答案写作 `"48"`。
- 题库的常见错误答案格式由 `DecimalString` 约束，已有测试保证常见错误不等于答案。
- 动机见 proposal.md，行为规则见三份 spec。

## Goals / Non-Goals

**Goals:**
- 规则全部是纯函数：不访问数据库、不读时间、不依赖 Drizzle 的行类型，单元测试直接构造输入。
- D 和 F 只调用这里的函数，不自己再算状态或比率。

**Non-Goals:**
- 写库、加锁、幂等：这些归 D。
- 建议文案：C 只给行为事实，鼓励与建议的措辞归 F。
- 是否允许提前结束、已完成会话返回 409：接口规则归 D。

## Decisions

### D1 模块划分

`server/src/grading/` 下 4 个文件，按依赖从下到上：

| 文件 | 导出 | 说明 |
|---|---|---|
| `decimal.ts` | `parseDecimal`、`decimalEquals`、`canonical` | 定标整数（`bigint`，单位 0.01）与规范值 |
| `input.ts` | `parseAnswerInput(raw)` | 规范化 + 校验，返回 `{ ok: true, value }` 或 `{ ok: false, reason, message }` |
| `grade.ts` | `gradeAnswer(raw, { answer, commonMistakes })` | 判题结果：不合法 / 对 / 错（含匹配到的常见错误） |
| `progress.ts` | `summarize(snapshot, attempts, skips, events)` | 题目状态、关卡、当前题、分类、指标、行为事实，一次算出 |

不单独拆 `summary.ts`：进度和总结共用一份按题分组的中间结果，放在同一个函数里，保证"同一口径"这条要求在结构上成立。

### D2 十进制比较用定标 `bigint`

把合法数字解析为"以 0.01 为单位的 `bigint`"：`"30"` → `3000n`，`"6.5"` → `650n`，`"6.50"` → `650n`。相等就是两个 `bigint` 相等。

- 不用 `Number()` / `parseFloat`：它们接受 `1e3`、`0x10`、`Infinity`，且有浮点误差。校验一律用 ASCII 正则 `^[0-9]+(\.[0-9]{1,2})?$`。
- 不引入 decimal.js：只需要 2 位小数的相等比较，一个小函数足够，少一个依赖。
- 标准答案也走 `parseDecimal`，所以 `"48"` 和 `"48.00"` 结果相同。

### D3 输入判定顺序

1. 原始长度 > 32 → `too_long`（先于任何处理，防止超长字符串进入后续正则）。
2. 规范化：去零宽字符和首尾空白（含 U+3000），去掉末尾的 `。`，全角数字、`．`、其余的 `。` 转半角。
3. 空串 → `empty`。
4. 匹配合法格式 → 再查整数部分（去前导零后）> 8 位 → `too_large`；否则合法。
5. 负号（`-`、`−`、`－`）加可选空白后是合法数字 → `negative`。
6. 超过 2 位小数的数字（`^\d+\.\d{3,}$`）→ `too_many_decimals`。
7. 以合法数字开头，剩下的部分是常见单位（`mm`/`cm`/`dm`/`m`/`km` 可带 `2` 或 `²`、`平方米` 等中文单位），或不含数字和小数点 → `has_unit`。学生打不出 `²`，常写成 `cm2`，所以单位表要先于"不含数字"判断。`1,200`、`1 2`、`5.` 不算带单位。
8. 其余 → `invalid_format`。

`.5`、`5.`、`+5` 按大纲 §4.5 的字面要求拒绝（小数点前后都要有数字），提示里给出正确写法（如"写成 0.5"）。提示文案放在后端：大纲 §5 要求 4xx 时"直接说明原因"，由后端给出同一套文案，前端不必再维护一份映射。

### D4 写入数据库的值

- `normalized_value`：规范值（如 `"7.5"`），`numeric(10,2)` 可无损存储，因为已限制最多 2 位小数、8 位整数。
- `matched_mistake`：匹配到的常见错误答案的**规范值**（如 `"60"`），不存提示文案；提示随题库可以修改，答案值不变。
- 不合法输入不写 `attempts`（D 直接返回 400）。

### D5 `summarize` 的输入输出

输入是结构类型，D 从数据库行映射过来：

```ts
type SnapshotItem = { questionId: number; position: number; stageId: number };
type AttemptRecord = { questionId: number; isCorrect: boolean; matchedMistake: string | null; seq: number };
type SkipRecord = { questionId: number; seq: number };
type EventRecord = { questionId: number; type: LearningEventType; seq: number };
```

输出：

```ts
{
  questions: Array<{ questionId; stageId; position; status; outcome: 'first_try' | 'corrected' | 'not_yet';
                     reviewReason: 'wrong' | 'skipped' | 'unanswered' | null; facts: QuestionFacts }>;
  stages: Array<{ stageId; lit: boolean; unlocked: boolean; solvedCount; total }>;
  currentQuestionId: number | null;
  canFinish: boolean; skippedCount: number;
  counts: { total; firstTry; corrected; notYet };
  rates: { firstTry: number; completion: number };   // 0–100 整数
}
```

- 关卡顺序取快照中该关题目的最小 `position`，不依赖 `stages.position`，因为快照是会话创建时冻结的。
- 不用 `attemptNo` 判断"第 1 次"，而用 `seq` 最小的作答，与"以 `seq` 为准"保持一致；`attemptNo` 由 D 维护，唯一约束兜底。
- 快照内 `questionId` 重复、记录指向快照外的题：抛错。快照为空时不抛错，比率为 0（见 learning-summary spec）。

### D6 D 需要遵守的约定

- 传给 `summarize` 的记录必须带 `seq`，按数据库原值传入。
- 会话结束后产生的学习事件不传入（大纲 §2.4："查看行为照常记录，但不影响统计"）。**按 `seq` 过滤，不按 `created_at`**：`created_at` 是事务开始时间，一个在结束前开始、等锁后才写入的事件，`created_at` 早于结束时间，实际却在结束之后。做法是 D 给 `practice_sessions` 加 `completed_seq`，结束时取 `nextval('practice_record_seq')` 写入，只传 `seq < completed_seq` 的事件。分类不受影响（结束后没有作答），受影响的只有行为事实。这一条记入计划的 Follow-ups（D）。

## Risks / Trade-offs

- [拒绝 `.5`、`5.` 可能让学生困惑] → 提示里直接给出正确写法；格式严格换来规则简单、可预测。
- [整数位上限 8 位是存储约束，不是教学约束] → 题目答案都在 4 位以内，8 位足够；超限给出"数太大了"的提示，不会变成 500。
- [`summarize` 一次算出全部内容，接口只用一部分时有少量多余计算] → 每次最多 12 题、几十条记录，可以忽略，换来单一口径。
- [学习事件靠前端上报，可能丢失] → 只影响"一次做对"的判定偏宽松（漏报的解析不会被计入），已在大纲已知限制中说明。
