# Tasks

## 1. 生成视频

- [x] 1.1 生成管线 `video/build.py`：旁白、逐帧绘制、合成、字幕、封面，以及 `requirements.txt`（D1）；验证：生成日志中字幕条数等于分镜数，字幕时间连续，视频与字幕的时长差小于 1 秒
- [x] 1.2 第 4 题分镜（D2）；验证：脚本断言数字等于题库答案；视频小于 5 MB；人工看一遍
- [x] 1.3 第 10 题分镜（D2）；验证：同上

## 2. 播放

- [x] 2.1 `PracticeStore` 的 `reportVideoStarted` 和 `reportVideoCompleted`；验证：store 测试覆盖按题去重与写队列
- [x] 2.2 `VideoPanel` 与答题页、总结页回看的入口（D3）；验证：组件测试覆盖 video-explanations 的各个场景
- [x] 2.3 托管：`Range` 请求返回 206；验证：`hosting.test.ts`

## 3. 文档与验证

- [x] 3.1 `docs/video-assets.md` 素材来源说明，README 增加链接，已知限制补充"视频是公开的静态文件"
- [x] 3.2 浏览器实跑：第 4 题答错 → 看完视频 → 答对 → 总结页建议出现"看完了视频解析后做对了"；第 10 题视频可以播放，字幕正常；记入 `docs/verification.md`
- [x] 3.3 `npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/video-explanations` 到 `main`（squash），在计划中将 I 打勾；合并后线上确认视频可以播放。
- 在下一个 change 的分支上执行 `openspec archive video-explanations`。
