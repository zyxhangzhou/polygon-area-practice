# Design

## Context

- 视觉稿：Claude Design 画布"图形小镇视觉稿"（用户已确认）。其中：
  - 圆圆与四座建筑的 SVG 分层画法；
  - 色板、字体层级、控件样式；
  - 首页、答题页、手机版点亮、总结页、引导页的布局；
  - 动画说明便签。
- 后端已提供所需数据，H 不改后端：
  - `SessionView.stages[]`：`lit`、`unlocked`、`solvedCount`、`total`、`name`、`buildingName`；
  - 作答结果 `result`：`correct`、`outcome`、`stageLit`、`mistakeHint`。
- 前端现状：
  - `PracticeStore` 管会话状态与反馈（`feedback`）；
  - 页面组件 `HomePage`、`PracticePage`、`SummaryPage`、`HistoryPage`；
  - `Figure.tsx` 按参数画题目图形；
  - 样式集中在 `index.css`（217 行）；
  - E 的反馈文案里有"看懂了再做对"，违反措辞规则，本次替换。
- 时间：11/13 展示，H 需要在 11/12 内完成。

## Goals / Non-Goals

**Goals:**
- 视觉还原视觉稿，并保留现有的全部行为和测试。
- 动画由状态驱动：只在本次操作引起变化时播放，刷新不重播。
- 所有状态都有文字说明，不依赖动画和颜色。

**Non-Goals:**
- 不加新依赖，不加音效。
- 不改后端接口与数据。

## Decisions

### D1 建筑组件

- `web/src/town/Building.tsx` 导出 `<Building kind stage lit animate />`：
  - `kind`：`bakery`、`camp`、`bridge`、`plaza`，按关卡顺序对应；
  - `stage`：0–3。
- 每座建筑的 SVG 照视觉稿分为几组：
  - `plot`：待建的空地；
  - `layer1` 到 `layer3`：三层；
  - `scaffold`：施工中的脚手架；
  - `glow`：点亮效果。
- 每组是否显示由 `stage` 和 `lit` 决定，并在组上标 `data-layer`，测试据此检查。
- 四座建筑的图形数据写在 `town/buildings.tsx` 中，`Building` 只负责组合。
- 文字说明：SVG 设 `role="img"`，`aria-label` 为"帐篷营地：施工中 2/3"之类；页面上同时显示状态标签。
- 关卡与建筑的对应：按 `session.stages` 的顺序取第 1–4 座。建筑名使用后端返回的 `buildingName`。

### D2 什么时候播放动画

- `Building` 用 `useRef` 记住上一次渲染的 `stage` 和 `lit`：
  - 首次挂载时不播放；
  - 之后 `stage` 变大时，给新出现的层加 `entering` class；
  - `lit` 从 false 变为 true 时，给 `glow` 和窗户加 `lighting` class。
- 刷新或进入页面都是首次挂载，所以不会重播。这条规则在组件内统一实现，页面不用各自判断。
- 答题页的建筑面板常驻，作答成功后 store 更新 `session`，建筑会收到新的 `stage`，动画就会发生在该看到的时候。
- 点亮的庆祝提示（"面包店点亮了"和圆圆庆祝）只看这次作答结果中的 `result.stageLit`，与 E 的反馈规则相同。

### D3 动画实现：只用 CSS，不引入动画库

之前讨论时提过 Motion，实际设计后选择纯 CSS：
- 这里的动画都是一次性的状态过渡（层落下、依次亮灯、光晕扩散），加上少量循环（旗子轻摆、待机呼吸），CSS `@keyframes` 加带回弹的 `cubic-bezier` 曲线就能表达；
- 依次出现用 `animation-delay`（通过 CSS 变量 `--i` 计算）；
- 不增加运行时依赖和包体积，也不需要处理 Motion 与 React 19 的版本兼容。

做法：
- 时长：落层约 450 ms，亮灯每扇间隔 80 ms，光晕约 600 ms；
- 关键帧集中在 `town.css`；
- `@media (prefers-reduced-motion: reduce)` 统一把 `animation` 和 `transition` 设为 `none`。

备选：Motion（`motion/react`）。它适合复杂的手势和布局动画，这里用不上，以后需要时再加。

### D4 圆圆

- `web/src/companion/Bear.tsx` 导出 `<Bear mood />`，`mood` 为 `idle`、`happy`、`proud`、`think`、`cheer`，画法照视觉稿。
- 表情通过切换眼睛和嘴的图形组实现；待机时用 CSS 做呼吸和眨眼。
- `companion/lines.ts` 是纯函数 `feedbackLine(result, buildingName)`，返回 `{ mood, title, text }`：
  - 一次做对："一次就做对了。"
  - 订正后做对："改对了！先找到问题再改正，这一步很关键。"
  - 答错：`mistakeHint`，没有时用"还差一点。再看看图上的条件，也可以先看图文解析。"
  - 点亮：标题"{buildingName}点亮了"，文字"这一关的三道题都做对了。"
- 单元测试检查各种输出都不含"看懂""掌握"。

### D5 图形辅助线

- 修改 `Figure.tsx`，增加 `hint?: boolean`：
  - `draw()` 为每种形状返回 `hint: { shapes: Pt[][]; dashed: [Pt, Pt][]; note: string }`；
  - 补出的图形用虚线描边加淡金色填充；
  - `note` 同时显示在图形下方，并作为 SVG 说明的一部分。
- 画布的宽度和缩放要把补出的图形算进去，避免裁切。
- 显示条件：当前题的 `feedback` 为答错时传 `hint`。切换题目、再次提交或刷新后 `feedback` 被清空，提示随之消失，不需要另外保存状态。
- 各形状的提示文字都不含数字结果，测试检查不出现答案。

### D6 首页小镇地图与引导

- `web/src/town/TownMap.tsx`：
  - 背景是视觉稿中的分层山丘和小路，用 SVG 画；
  - 四座建筑按百分比定位，宽度不足 640 px 时改为 2×2 网格。
- 首页按保存的会话显示：
  - 有会话：显示后端返回的各关状态；
  - 没有会话：四座都是空地，第 1 关标"从这里开始"。

  首页读取会话已经在 E 中实现，这里直接复用。
- 引导 `web/src/onboarding/Guide.tsx`：
  - 是一个对话框，有 4 步；
  - 高亮用一个绝对定位的框加大范围的 `box-shadow` 遮罩，定位到目标元素（`data-guide="plot"` 等）的 `getBoundingClientRect()`；
  - 窗口大小改变时重新计算。
- 是否看过保存在 `localStorage` 的 `polygon.guideSeen`。这是本机的界面偏好，不是学习数据。读写放在 try/catch 里，读失败时按"看过"处理，避免每次都弹出。
- 焦点：打开时聚焦"下一步"；`Esc` 等同于跳过；关闭后聚焦主按钮。

### D7 样式与字体

- 重写 `index.css`：
  - 在 `:root` 定义视觉稿的 token（颜色、圆角、阴影、间距）；
  - 组件按区域拆分为 `town.css`、`companion.css` 等，由各组件导入。
- 字体：视觉稿用的是 Google Fonts 的思源宋体和思源黑体。但 `fonts.googleapis.com` 在国内访问不稳定，外链样式表加载失败会阻塞首屏，所以不引用外部字体，改用系统字体栈：
  - 标题：`"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif`；
  - 正文：`"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`。

  这样在 macOS 和装了思源字体的机器上与视觉稿一致，其他机器回退到系统宋体或黑体。
- 手机宽度（390 px）：答题页的建筑面板移到题目上方并缩小；首页地图改为网格。

### D8 测试

- 组件测试：
  - `Building`：各阶段显示的图层；点亮；首次挂载没有 `entering`，`stage` 增加后有；刷新（重新挂载）后没有动画 class；`aria-label` 文字。
  - `feedbackLine`：五种情况与措辞规则。
  - `Figure` 的提示：每种形状都有提示、文字说明存在、不含答案。
  - `Guide`：第一次出现、跳过后不再出现、已有学生时不出现、`Esc`、焦点。
  - 页面：答错时出现圆圆思考和图形提示；点亮时出现庆祝；首页地图显示后端状态。
- 现有测试：按新的文案和结构更新查询方式，但行为断言保持不变。
- 浏览器实跑：本地完整练习一遍，截图首页、答错提示、点亮、总结页、手机宽度；开启"减少动态效果"再看一次。结果记入 `docs/verification.md`。

## Risks / Trade-offs

- [工作量大，时间紧] → 按"建筑 → 答题页反馈 → 首页地图 → 总结页 → 引导"的顺序实现，保证前面的部分先可用；引导排在最后，来不及时可以单独拿掉，不影响其他部分。
- [系统字体与视觉稿有差异] → 色板、间距、图形决定了主要观感，字体差异的影响较小；写入已知限制。
- [CSS 动画在 jsdom 中不会执行] → 测试只检查 class 和图层，动画效果靠浏览器实跑与截图确认。
- [引导的高亮框需要跟随布局] → 只在首页使用，监听 `resize`；目标元素不存在时跳过那一步。
