# Tasks

## 1. 十进制与输入处理

- [ ] 1.1 `server/src/grading/decimal.ts`：`parseDecimal`（定标 `bigint`，只接受 ASCII 合法格式）、`decimalEquals`、`canonical`；验证单元测试：`30`/`30.0`/`30.00` 相等，`"6.50"` 与 `6.5` 相等，`0.3` 与 `0.30` 相等，`007.50` 规范值为 `7.5`、`0.0` 为 `0`，非法字符串抛错
- [ ] 1.2 `server/src/grading/input.ts`：`parseAnswerInput` 按 design D3 的顺序规范化与校验，每个原因代码附中文提示；验证 `test/grading-input.test.ts` 用表格覆盖 spec 中 7 个原因代码的全部例子、全角/句号/全角空格规范化、`007` 与 `00000001` 合法、`123456789` 为 `too_large`、33 个字符为 `too_long`

## 2. 判题

- [ ] 2.1 `server/src/grading/grade.ts`：`gradeAnswer` 返回不合法 / 对 / 错；答错时按数值匹配常见错误，返回其规范值与提示；验证 `test/grading-grade.test.ts`：第 4 题输入 `60.0` 匹配常见错误 `60`，普通错误无匹配，答对不返回常见错误，不合法输入标记为不计次
- [ ] 2.2 题库回归测试：对 12 道题分别用种子答案、数据库形式答案（`toFixed(2)` 字符串）、每个常见错误答案判题；验证标准答案全部判对、常见错误全部判错并返回对应提示

## 3. 进度与总结

- [ ] 3.1 `server/src/grading/progress.ts`：按 design D5 实现 `summarize`（题目状态、关卡点亮与解锁、当前题、能否完成、跳过题数、分类、指标、行为事实），输入不合法时抛错；验证 `test/grading-progress.test.ts` 覆盖 practice-progress spec 全部场景（含"以 seq 为准"、"解锁不撤回"）
- [ ] 3.2 验证 `test/grading-summary.test.ts` 覆盖 learning-summary spec 全部场景：一次做对、先错后对、先看解析再答对、跳过后直接做对、答对后才看解析、三种还没做对的原因、7/3/2 混合时比率 58/83、只做 1 题先错后对时 0/8、总题数 0 时比率 0、第 4 题行为事实、进行中统计 25/33、快照外记录报错

## 4. 收尾

- [ ] 4.1 `mydoc/plans/polygon-area-demo/` 的 Follow-ups（D）补充 design D6 的约定；`npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/grading-core` 到 `main`（squash），在计划中将 C 打勾。
- 合并后在下一个 change 的分支上执行 `openspec archive grading-core`。
