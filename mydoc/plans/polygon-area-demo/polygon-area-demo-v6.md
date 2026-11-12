# 多边形面积练习 Demo — v6

- Status: confirmed
- Supersedes: v5
- Date: 2026-11-12
- Session: fab477d6-36b6-4a67-8f33-b1ddf1cee503
- Trigger: 用户：关卡有 4 个，希望至少有 4 个视频解析
- Reason: 只有第 2、4 关有视频，第 1、3 关答错后只能看图文；新增 L，每关一段视频

## Changes since v5

| ID | 变化 | 原因 |
|---|---|---|
| L | added：新增第 1 题（平行四边形剪拼成长方形）和第 7 题（两个梯形拼成平行四边形）的视频，加上原有的第 4、10 题，每关一段 | 用户要求 4 关至少 4 段视频解析 |

## 背景

- 题面：[docs/assignment/assignment.md](../../../docs/assignment/assignment.md)（选题一）。评分重心依次为：工程链路与可靠性、自动化测试、部署与排障、AI 协同记录、学生体验。
- 设计依据：[docs/project-outline.md](../../../docs/project-outline.md) v0.2（已确认）。关键决定：
  - 技术栈：Node.js + TypeScript；Fastify + Drizzle + PostgreSQL；React + Vite；Vitest 连真实 Postgres；Docker Compose；Render（Web + 免费 Postgres，约 30 天有效期，覆盖 11/13 展示）。
  - 体验：图形小镇建造师，4 关 × 3 题，向导是带卷尺的小熊"圆圆"；只填数字、单位固定；允许跳过；第 4、10 题有 AI 辅助动画 + TTS 视频解析（v6 起加上第 1、7 题，每关一段）。
  - 规则：题目四种状态（unanswered / wrong / skipped / solved）；本关题目都"处理过"即可进入下一关，3 题全对才点亮建筑；学生主动结束会话，结束后提交返回 409。
  - 统计：由会话题目快照、作答、跳过、学习事件四类数据经 `summarize()` 纯函数计算；"一次做对"要求首次有效作答正确且答对前未打开解析。
  - 解析内容接口不记录行为；学习行为由前端在面板展开、视频 play / ended 时上报 `POST /events`。
- 开发流程：每个 change 对应一个 OpenSpec change（`openspec/changes/<ref>`）、一个分支、一个 PR。
- 时间：11/10 完成 A–D；11/11 完成 E、F、G（首次上线）；11/12 完成 H、I、J 并演练；11/13 展示。

## Changes

| Order | ID | Change | Ref | Depends on | Status |
|---|---|---|---|---|---|
| 1 | A | 项目骨架 | `project-scaffold`（已归档 `2026-11-11-project-scaffold`） | — | ✅ merged #1 |
| 2 | B | 数据模型与题库 | `data-model-question-bank`（已归档 `2026-11-11-data-model-question-bank`） | A | ✅ merged #2 |
| 3 | C | 判题核心 | `grading-core`（已归档 `2026-11-11-grading-core`） | B | ✅ merged #3 |
| 4 | D | 练习会话 API | `practice-session-api`（PR #4） | C | ✅ merged #4（archived） |
| 5 | E | 答题主流程前端 | `practice-ui`（PR #5） | D | ✅ merged #5（archived） |
| 6 | F | 学习总结页 | `summary-ui`（已归档 `2026-11-12-summary-ui`） | D, E | ✅ merged #6（archived） |
| 7 | G | 首次上线 Render | `deploy-render`（已归档 `2026-11-12-deploy-render`） | E | ✅ merged #7（archived） |
| 8 | H | 图形小镇与圆圆 | `town-and-companion`（已归档 `2026-11-12-town-and-companion`） | E | ✅ merged #8（archived） |
| 9 | I | 视频解析 | `video-explanations`（已归档 `2026-11-12-video-explanations`） | E | ✅ merged #9（archived） |
| 10 | J | 文档与交付 | `docs-and-delivery`（已归档 `2026-11-12-docs-and-delivery`） | A–I | ✅ merged #10（archived） |
| 11 | K | 视频字幕与画面安全区 | `video-caption-layout`（分支 `change/video-caption-layout`，PR #12，`243261c`） | I | merged · archived |
| 12 | L | 每关一段视频讲解 | `stage-videos`（分支 `change/stage-videos`） | I, K | in progress |

### A — 项目骨架

- Goal: 搭好能持续开发、测试、启动的工程底座。
- Scope: in — `server/`（Fastify + TS）与 `web/`（React + Vite + TS）目录、根目录脚本、`docker-compose.yml`（Postgres + 应用）、`.env.example`、`GET /api/health`（含数据库连通检查）、pino 日志、Vitest 配置、GitHub Actions 骨架（Postgres service）。out — 业务表与业务接口。
- Acceptance: `docker compose up` 后访问 `/api/health` 返回数据库正常；前端页面能打开；CI 运行通过。

### B — 数据模型与题库

- Goal: 把练习所需的全部数据结构和 12 道题落库。
- Scope: in — Drizzle schema 与迁移：stages、questions、learners、practice_sessions（部分唯一索引）、session_questions、attempts（client_attempt_id 唯一）、question_skips、learning_events；种子脚本写入 4 关 12 题（题干、图形参数、答案、单位、分步解析、易错提醒、常见错误答案、视频地址占位）。out — 判题与接口逻辑。
- Acceptance: 迁移 + 种子在空库上可重复执行；库中 4 关 12 题，答案与大纲 §2.3 一致；迁移文件已入库。

### C — 判题核心

- Goal: 把判题与统计口径实现为可单测的纯函数。
- Scope: in — 输入规范化（空格、全角、中文句号）、合法性校验（非负、最多 2 位小数、拒绝科学计数法等）、十进制精确比较、常见错误匹配、题目状态推导、`summarize(snapshot, attempts, skips, events)`。out — 数据库读写。
- Acceptance: 单元测试覆盖：`30`/`30.0`/`30.00` 相等；非法输入被拒且标记为不计次；先错后对、先看解析后对、跳过、未作答四种情形的分类与指标正确。

### D — 练习会话 API

- Goal: 打通"开始 → 作答 → 跳过 → 结束 → 总结"的后端链路，保证幂等与一致。
- Scope: in — 大纲 §4.4 的全部接口；作答事务内对会话行加锁并计算 attempt_no；`ON CONFLICT` 幂等返回首次结果；解析访问规则；会话结束后 409；统一错误格式；集成测试连真实 Postgres。out — 前端。
- Acceptance: 集成测试覆盖大纲 §6 的 9 个场景并在 CI 通过。

### E — 答题主流程前端

- Goal: 学生能在浏览器里独立做完一组练习。
- Scope: in — 首页（开始/继续）、答题页（进度、SVG 图形、题干、数字输入 + 固定单位）、判题反馈、再试一次 / 图文解析 / 跳过、关卡间导航、刷新恢复、失败与"结果不确定"提示、提交中禁用按钮、学习事件上报（图文）、结束练习（完成 / 提前结束确认 / 进入总结页，v2 加入）。out — 小镇动画、视频、总结页内容（`/summary` 只做占位）。
- Acceptance: 浏览器中完整做完 12 题；刷新任意页面进度不丢；断开后端时提示正确且不显示假成功。

### F — 学习总结页

- Goal: 让学生看懂本次学习情况并知道下一步。
- Scope: in — 统计数字、每题分类与原因、基于记录的鼓励与具体建议、回看题目和解析、再练一次（新会话）、已结束会话直接进入总结、练习记录（旧会话及总结可查，含后端列表接口，v3 加入）。out — 专业学情诊断。
- Acceptance: 总结页数字与 `GET /summary` 返回一致；三类分类各有可点击回看的题目。

### G — 首次上线 Render

- Goal: 提供免费公网地址，并尽早暴露部署问题。
- Scope: in — 复用 A 的 Dockerfile、`render.yaml`（Web + Postgres）、启动前自动迁移与种子、`@fastify/rate-limit`、生产环境托管前端构建产物、线上日志查看与回滚步骤记录。out — 自定义域名、备份。
- Acceptance: 公网地址可完整练习一遍；部署与回滚步骤写入 `docs/ai-log-notes.md` 或部署笔记。

### H — 图形小镇与圆圆

- Goal: 让互动机制与练习过程结合，建造过程看得见、有吸引力，促使学生继续练。
- Scope:
  - in — 视觉稿：先用 Claude Design 设计，用户确认后再实现。
  - in — 风格：精致的插画感，低饱和色板，几何体块加轻微光影；不要高饱和撞色、卡通贴纸和低幼感。
  - in — 小镇与建筑：小镇地图，4 座建筑。每答对一题长出一层（SVG 分层），全对后点亮；没完成的显示"施工中"。
  - in — 动画：首次进入的引导（圆圆讲解，可跳过，只出现一次）、关卡过渡；用 SVG + Motion + CSS 实现，由后端状态驱动，刷新后直接显示到对应阶段，不重播；支持"减少动态效果"。
  - in — 圆圆：角色形象，以及四类反馈的表情与动作（首次答对、订正答对、过关、答错针对性提示）。
  - in — 答错提示：在题目图形上做辅助高亮。
  - in — 结束前提醒还有跳过的题。
  - in — 首页、答题页、总结页、练习记录页统一视觉语言。
  - out — 复杂游戏机制、音效、3D。
- Acceptance:
  - 视觉稿经用户确认；
  - 答对、订正、过关、答错四种反馈和建造、点亮动画都能在实际练习中看到，且与后端状态一致；
  - 刷新后建筑的阶段正确；
  - "减少动态效果"下没有动画。

### I — 视频解析

- Goal: 第 4、10 题提供可播放的视频解析，学生可自选图文或视频。
- Scope: in — AI 辅助编写动画脚本（Manim 或 Canvas）并渲染、TTS 旁白、合成为几 MB 的 MP4、播放器、`video_started` / `video_completed` 事件、加载失败兜底、素材来源说明。out — 其余题目的视频。
- Acceptance: 两道题能播放视频；事件写入数据库；视频不可用时引导看图文解析。

### J — 文档与交付

- Goal: 满足提交要求的 4 项，并能在干净环境复现。
- Scope: in — README（按提交要求 12 项）、`docs/design.md`、`docs/verification.md`（测试结果、已验证场景、已知问题、未完成项、投入时间）、`docs/ai-collaboration.md`（2–3 段记录）、新克隆验证、展示演练。out — 无。
- Acceptance: 新克隆仓库按 README 能启动并跑通测试；四份文档齐全；展示流程演练一遍。


### K — 视频字幕与画面安全区

- Goal: 字幕和播放控制条不遮挡视频中的图形、标注和算式。
- Scope: in — 字幕显示在视频下方并与播放同步，全屏时改用浏览器自带字幕；两段视频重新排版，底部留出安全区，重新生成。out — 其他题目的视频。
- Acceptance: 播放和暂停时，字幕与控制条都不遮挡画面中的图形、标注和算式；全屏时有字幕；播放事件不变。

### L — 每关一段视频讲解

- Goal: 4 关各有至少一段视频讲解，学生在每关都可以选看视频。
- Scope: in — 第 1 题（平行四边形：沿高剪下三角形平移成长方形）和第 7 题（梯形：两个一样的梯形拼成平行四边形）的视频，沿用现有生成流程、风格、字幕和安全区；题库加视频地址；测试与文档。out — 前端和接口改动；其余 8 题的视频。
- Acceptance: 第 1、4、7、10 题答错或跳过后都能看视频；新视频的数字与题干一致，结果等于答案；字幕与控制条不挡画面；每段小于 5 MB。

## Out of scope

- 方格图不规则图形面积估算题：答案是范围，判题与反馈规则差异大，时间有限；作为可选扩展。
- 登录注册：题面明确不需要，使用匿名标识。
- 跨设备找回记录：依赖登录，写入已知限制。
- 专业学情诊断：题面明确不要求。
- 音效与 3D 场景：H 只做 SVG 与 2D 动画。
- 数据库备份：Render 免费档不提供，写入已知限制，用 `pg_dump` 手动导出作为恢复办法。

## Follow-ups

- ~~2026-11-11 · fab477d6 · PR #1 评审发现：测试文件并行执行、共用 `polygon_test` 库。A 的测试不写数据，暂无影响；**B 开始写表时**要一并设计测试隔离（如 `fileParallelism: false` + 每个文件清表，或 globalSetup 统一迁移）。~~ → 已在 B（PR #2）完成：globalSetup 重建 `*_test` 库 + 串行 + `resetPracticeData`。

- 2026-11-11 · fab477d6 · PR #2 子代理评审，留给后续 change：
  - **C**：作答字段是 `numeric(10,2)`，超过 8 位整数会溢出（报 22003，变成 500）。输入校验要限制长度或上限，并拒绝超过 2 位小数（否则会被静默舍入）。
  - ~~**D**：两个"开始练习"请求并发时，第二个会撞上部分唯一索引（23505），要捕获后返回已有会话。作答、跳过、学习事件都要先锁住会话行（`FOR UPDATE`）再写入，`seq` 才能代表会话内的实际顺序。前端补报的学习事件，服务端记录的是到达时间。~~ → D 已完成：开始练习锁学生行（不靠捕获 23505），写操作锁会话行。
  - ~~**D**（C 的 design D6）：传给 `summarize` 的记录带数据库原值 `seq`；会话结束后产生的学习事件不传入：给 `practice_sessions` 加 `completed_seq`（结束时取 `nextval('practice_record_seq')`），只传 `seq < completed_seq` 的事件，不按 `created_at` 过滤（PR #3 评审）。不合法输入（`gradeAnswer` 返回 `invalid`）不写 `attempts`，直接 400 并返回 `message`。~~ → D 已完成：迁移 0002 加 `completed_seq`，非法输入 400 `INVALID_ANSWER`。
  - **D/F**：判断"答对前是否打开过解析""最近一次操作是不是跳过"时用 `seq`，不用 `created_at`。

- 2026-11-11 · fab477d6 · D 评审讨论：作答重放返回首次结果（先错后对后重放第一次，`result` 仍为错误），`session` 是当前状态。
  - ~~**E**：收到 `replayed: true` 时只按 `session` 刷新界面，不弹出对错反馈。~~ → E 评审时修订：照常显示 `result`，只在与 `session` 矛盾时（结果为答错而该题已答对）不显示；否则"结果不确定后重试"拿不到结果（见 E 的 practice-client-sync）。
  - **E**：`POST /api/learners` 等接口带 JSON 头时请求体要发 `{}`，空请求体会被 Fastify 拒绝（400）。

## Open questions

（暂无）

## Status log

- 2026-11-10 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · v1 写入并确认
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · A 开始：OpenSpec change `project-scaffold` 四个 artifact 已生成并通过 strict 校验；Dockerfile 归入 A（G 复用）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · A 实现完成（12/12 任务，18 个测试，CI 通过），开 PR #1
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · PR #1 子代理评审，修复 3 个问题并补测试（19/19 任务，34 个测试）；squash merge 为 c26e646；OpenSpec 归档为 `2026-11-11-project-scaffold`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · B 开始：分支 `change/data-model-question-bank`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · B 实现完成（14/14 任务，73 个测试，CI 两个 job 通过），开 PR #2；测试库隔离（Follow-up）已在 B 中完成
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · PR #2 子代理评审，修复后 22/22 任务、91 个测试；squash merge 为 7f7d960；OpenSpec 归档为 `2026-11-11-data-model-question-bank`（在 C 分支上提交）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · C 开始：分支 `change/grading-core`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · C 的 OpenSpec 四个 artifact 已生成并通过 strict 校验，等待用户评审
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · C 实现完成（7/7 任务，新增 99 个单元测试，共 190 个），开 PR #3
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · PR #3 子代理评审，修复 5 个问题与 3 项取舍（11/11 任务，grading 测试 118 个）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · C squash merge 为 57ad7f5；OpenSpec 归档为 `2026-11-11-grading-core`（在 D 分支上提交）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · D 开始：分支 `change/practice-session-api`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · D 的 OpenSpec 四个 artifact 已生成并通过 strict 校验，等待用户评审
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · D 实现完成，开 PR #4，CI 两个 job 通过；等待用户评审合并
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · D squash merge 为 7e19c3a；OpenSpec 归档为 `2026-11-11-practice-session-api`（在 E 分支上提交）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · E 开始：分支 `change/practice-ui`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · E 的 OpenSpec 四个 artifact 已生成并通过 strict 校验，等待用户评审（含：重放显示规则修订、结束练习归 E）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · 用户确认 E 的 artifact；出 v2（E 加入结束练习），开始实现 E
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · E 实现完成，开 PR #5，CI 两个 job 通过；真实浏览器验证见 `docs/verification.md`；等待用户评审合并
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · E squash merge 为 8308a68；OpenSpec 归档为 `2026-11-11-practice-ui`（在 F 分支上提交）
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · F 开始：分支 `change/summary-ui`
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · F 的 OpenSpec 四个 artifact 已生成并通过 strict 校验，等待用户评审
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · F 实现完成，开 PR #6，CI 两个 job 通过；真实浏览器验证见 `docs/verification.md`；等待用户评审合并
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · 用户评审 PR #6：加入练习记录、调整建议复习；出 v3
- 2026-11-11 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · F 加入练习记录后 CI 两个 job 通过；等待用户评审合并
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · F squash merge 为 dfcfbbd；OpenSpec 归档为 `2026-11-12-summary-ui`（在 G 分支上提交）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · G 开始：分支 `change/deploy-render`
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · G 实现完成（限流、render.yaml、冒烟检查、部署文档），开 PR #7，CI 两个 job 通过；本地 Docker 冒烟检查通过；等待用户在 Render 创建 Blueprint
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · G 部署到 Render（Blueprint）；线上冒烟检查与浏览器完整练习通过；实测代理层数为 3（Cloudflare → Render 内网代理 → 服务）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · G squash merge 为 5a2607d；OpenSpec 归档为 `2026-11-12-deploy-render`（在 H 分支上提交）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · v4：H re-scoped（精致视觉与动画，先出 Claude Design 视觉稿），I 降为视时间而定；H 开始：分支 `change/town-and-companion`
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · H 视觉稿（Claude Design）经用户确认；字体选择自托管思源宋体（仅标题）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · H 实现完成，开 PR #8，CI 两个 job 通过；浏览器实跑与截图见 `docs/verification.md`、`docs/screenshots/h/`；等待用户评审合并
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · Render Blueprint 分支改为 main（用户授权，经浏览器操作）；H squash merge 为 92b0a61，线上确认为新版本（样式含 building-art、字体切片 200），冒烟检查通过；OpenSpec 归档为 `2026-11-12-town-and-companion`（在 I 分支上提交）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · 用户选择先做 I；旁白 TTS 选定 edge-tts（晓晓）；I 的 OpenSpec 已生成，等待评审
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · I 实现完成（两段视频、播放器、事件、素材来源说明），开 PR #9，CI 两个 job 通过；浏览器实跑见 `docs/verification.md`；等待用户评审合并
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · I squash merge 为 e7bc426；首次自动部署因构建约 16 分钟触发平台超时而失败（实例已在监听），用户手动重新部署后成功；线上视频 206/200、字幕与封面可访问，冒烟检查通过；OpenSpec 归档为 `2026-11-12-video-explanations`（在 J 分支上提交）
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · J 开始：分支 `change/docs-and-delivery`
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · J 文档完成（README、AI 协同记录、交付说明、演示脚本），干净环境验证与线上演练通过，开 PR #10，CI 两个 job 通过；待用户补充投入时间与 AI 费用后合并
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · 用户补充投入时间（约 15 小时）与 AI 费用（Claude 订阅，非 Max）；J squash merge 为 a485bec；OpenSpec 归档为 `2026-11-12-docs-and-delivery`。A–J 全部完成，计划状态改为 completed
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · v5：用户测试发现视频字幕遮挡画面，新增 K；用户确认两处一起改，OpenSpec 与实现放在同一个 PR 中评审
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · K 实现完成：字幕移到视频下方，视频重新排版并通过安全区检查；浏览器中播放、暂停、全屏都没有遮挡
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · K squash merge 为 243261c；自动部署没有触发，用户手动部署后线上验证通过（两段视频为新文件、前端包含视频下方字幕、冒烟检查 6 步通过）；OpenSpec 归档为 `2026-11-12-video-caption-layout`。A–K 全部完成，计划状态改为 completed
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · v6：用户要求每关至少一段视频，新增 L（第 1、7 题）；OpenSpec `stage-videos` 待评审
- 2026-11-12 · fab477d6-36b6-4a67-8f33-b1ddf1cee503 · 用户确认 L 方案"可以，直接开始"。实现完成：q01 51.79 秒 / 0.88 MB，q07 61.06 秒 / 1.12 MB，安全区检查通过；测试后端 307、前端 193 全部通过；浏览器实跑两段视频
