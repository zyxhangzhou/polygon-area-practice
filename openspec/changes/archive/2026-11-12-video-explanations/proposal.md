# Proposal

## Why

题面"选题一"要求"至少两道题提供视频讲解"。大纲 §3 规定由第 4 题（三角形）和第 10 题（组合图形）提供视频，学生可以自己选看图文还是视频。题库里这两题的 `videoUrl` 已经预留为 `/videos/q04.mp4`、`/videos/q10.mp4`，后端也已经接受 `video_started`、`video_completed` 事件，学习总结会按这两种行为生成建议。但视频文件和播放器都还没有，所以总结里"看完了视频解析"这类建议目前不会出现。

## What Changes

- **两段视频**（各约 1 分钟，几 MB）：
  - 第 4 题：复制一个三角形，倒过来拼成平行四边形，面积 ÷ 2；
  - 第 10 题：小房子分成长方形和三角形，分别算再相加。

  动画由 AI 编写的 Python 脚本逐帧绘制（Pillow），配色与图形小镇一致。旁白由 edge-tts 合成（微软晓晓语音，本人选定），再用 ffmpeg 合成为 MP4。每段视频附 WebVTT 字幕和封面图。
- **可重复生成**：脚本、依赖版本和生成步骤放在仓库的 `video/` 目录，一条命令重新生成。生成的 MP4、字幕和封面提交到 `web/public/videos/`。
- **播放器**：
  - 有视频的题，在"看图文解析"旁边多一个"看视频讲解"，学生自己选；
  - 视频开始播放时上报 `video_started`，播放到结尾时上报 `video_completed`，同一题在本页面各只报一次；
  - 视频加载失败时，提示改看图文解析；
  - 总结页的回看也可以看视频（会话已结束，事件不计入统计）。
- **素材来源说明** `docs/video-assets.md`：写明脚本由 AI 编写、使用的 TTS 服务（非官方接口）、字体及其授权、重新生成的方法。

## Capabilities

### New Capabilities
- `video-explanations`：视频讲解的提供与观看：哪些题有视频、怎么选择、播放事件何时上报、字幕、加载失败时的兜底，以及视频文件的提供方式。

### Modified Capabilities

（无。explanation-access 已规定解析返回视频地址和事件上报的规则；practice-pages 的"图文解析"要求不变，视频是另加的选择。）

## Impact

- 新增：
  - `video/`：生成脚本、`requirements.txt`、说明；
  - `web/public/videos/q04.mp4`、`q10.mp4` 以及对应的 `.vtt` 和 `.jpg`；
  - `web/src/practice/VideoPanel.tsx` 与测试；
  - `docs/video-assets.md`。
- 修改：
  - `PracticeStore`：增加 `reportVideoStarted` 和 `reportVideoCompleted`；
  - 答题页：多一个"看视频讲解"按钮；
  - 总结页的回看：同样可以看视频。
- 后端不改：视频地址和事件都已经支持。
- 外部服务：生成视频时把旁白文字发送到微软 Edge 的在线朗读服务。旁白只是题目讲解，不含任何个人信息；运行网站本身不依赖这个服务。
- 不在范围内：其余 10 道题的视频，以及数字人、真人配音。
