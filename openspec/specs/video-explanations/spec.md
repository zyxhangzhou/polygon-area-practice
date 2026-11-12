# video-explanations Specification

## Purpose
规定视频讲解的提供与观看：第 4 题和第 10 题有视频，学生可以自己选看图文还是视频；观看行为按真实播放情况上报；视频有字幕，加载失败时可以改看图文。

## Requirements

### Requirement: 自选图文或视频
有视频的题（第 4、10 题）可以查看解析时，答题页 SHALL 同时提供"看图文解析"和"看视频讲解"，两者互不依赖；没有视频的题只提供"看图文解析"。打开视频讲解 MUST NOT 上报"打开图文解析"。

#### Scenario: 第 4 题答错后
- **WHEN** 第 4 题答错
- **THEN** 同时显示"看图文解析"和"看视频讲解"

#### Scenario: 只看视频
- **WHEN** 第 4 题答错后点"看视频讲解"并播放
- **THEN** 只上报 `video_started`，不上报 `explanation_text_opened`

#### Scenario: 没有视频的题
- **WHEN** 第 1 题答错
- **THEN** 只显示"看图文解析"

### Requirement: 播放事件
视频真正开始播放时 SHALL 上报 `video_started`；播放到结尾时 SHALL 上报 `video_completed`。只打开播放器而不播放 MUST NOT 上报。同一题的每种事件在本页面只上报一次（暂停后继续、重播都不重复上报）。中途拖动到结尾并播放结束，按实际发生的"播放到结尾"上报。

#### Scenario: 看完视频后答对
- **WHEN** 第 4 题答错后播放视频直到结束，然后答对
- **THEN** 依次上报 `video_started`、`video_completed`；学习总结中第 4 题为"订正后做对"，建议中说"看完了视频解析后做对了"

#### Scenario: 只打开不播放
- **WHEN** 打开视频讲解但没有点播放
- **THEN** 不上报任何事件

#### Scenario: 暂停后继续
- **WHEN** 播放、暂停、再播放
- **THEN** `video_started` 只上报一次

### Requirement: 字幕与无障碍
每段视频 SHALL 提供中文字幕（WebVTT），默认显示。播放器使用浏览器原生控件，可以用键盘操作。视频 MUST NOT 自动播放。

#### Scenario: 静音观看
- **WHEN** 学生在静音状态下播放第 10 题视频
- **THEN** 可以通过字幕看到每一句旁白

### Requirement: 加载失败时的兜底
视频无法加载或播放出错时，页面 SHALL 提示"视频暂时无法播放，可以先看图文解析"，并提供"看图文解析"的入口。

#### Scenario: 视频文件丢失
- **WHEN** 视频地址返回 404
- **THEN** 显示上述提示和"看图文解析"，不上报播放事件

### Requirement: 视频文件的提供
生产环境 SHALL 与页面同源提供视频文件、字幕和封面，并支持分段请求（`Range`），使播放器可以拖动进度。每段视频 SHALL 控制在 5 MB 以内，使学生在普通网络下可以较快开始播放。

#### Scenario: 分段请求
- **WHEN** 以 `Range: bytes=0-1023` 请求 `/videos/q04.mp4`
- **THEN** 返回 `206`，内容为请求的范围

### Requirement: 素材来源可追溯
仓库 SHALL 包含视频的生成脚本和来源说明：动画与旁白的生成方式、使用的外部服务、字体及其授权，以及重新生成的命令。重新运行生成命令 MUST 得到时长与字幕一致的视频。

#### Scenario: 重新生成
- **WHEN** 按说明重新运行生成命令
- **THEN** 得到 `q04.mp4`、`q10.mp4` 及字幕和封面，字幕时间与旁白对齐
