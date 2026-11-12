# Tasks

## 1. 题库与校验

- [x] 1.1 `server/src/content/questions.ts`：按 design D5 给 12 题的分步讲解和易错提醒加重点标记
- [x] 1.2 `server/src/content/schema.ts`：标记格式与数量的校验；种子测试覆盖未知类型、括号不配对、缺少条件或公式、超过 3 个
- [x] 1.3 题库测试：每题至少 1 个 `c`、1 个 `f`，易错提醒至少 1 个 `k`；接口测试：第 4 题的解析含 `{c:底是 10 cm}`；修正视频地址测试的题号

## 2. 前端

- [x] 2.1 `web/src/practice/highlight.ts`：`parseHighlights`，不合法时退回普通文字；单元测试
- [x] 2.2 `ExplanationPanel`：步骤小标题、`<mark data-kind>`、图例、易错提醒提示框；样式按 design D2、D3
- [x] 2.3 组件测试：第 4 题的条件、公式、关键标记；页面上没有花括号；总结页回看相同

## 3. 验证与文档

- [x] 3.1 `npm test`、lint、format、typecheck、build 全部通过
- [x] 3.2 浏览器实跑：答题页（桌面与手机宽度）和总结页回看各截一张，存入 `docs/screenshots/m/`
- [x] 3.3 更新 `docs/verification.md`、`docs/ai-log-notes.md`、README 需求对照
