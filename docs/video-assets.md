# 视频讲解的素材来源

4 关各有一段约 1 分钟的视频讲解：第 1 题（平行四边形：剪拼成长方形）、第 4 题（三角形：两个拼成平行四边形）、第 7 题（梯形：两个拼成平行四边形）、第 10 题（组合图形：分割法），文件在 `web/public/videos/`：

| 文件 | 内容 |
|---|---|
| `q01.mp4`、`q04.mp4`、`q07.mp4`、`q10.mp4` | 视频：1280×720，H.264 + AAC |
| 同名的 `.vtt` | 中文字幕（WebVTT）。页面上显示在视频下方，不叠在画面上；全屏时改用浏览器自带的字幕 |
| 同名的 `.jpg` | 封面：拼图完成、还没出现答案的那一刻 |

## 怎么做出来的

| 部分 | 来源 |
|---|---|
| 分镜与旁白文字 | AI（Claude）按题库的分步解析和常见错误编写，本人评审。见 `video/build.py` 中的 `q01()`、`q04()`、`q07()`、`q10()` |
| 动画 | AI 编写的 Python 脚本，用 Pillow 逐帧绘制（2 倍尺寸后缩小以抗锯齿），配色与图形小镇一致。画面底部 1/6（y ≥ 600）留作安全区，只有底色，给播放控制条和全屏字幕用 |
| 数字 | 脚本从题库源码 `server/src/content/questions.ts` 读取图形参数，算出结果，并断言等于题库答案 |
| 旁白 | [edge-tts](https://github.com/rany2/edge-tts) 7.3.1 调用微软 Edge 的在线朗读服务，语音为 `zh-CN-XiaoxiaoNeural`（晓晓），语速 -5%。这是非官方接口；只发送旁白文字（题目讲解，不含个人信息）。由本人在 edge-tts 与离线的 piper 之间试听后选定 |
| 字体 | Noto Sans CJK SC、Noto Serif CJK SC（SIL Open Font License 1.1），从 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) 的固定版本（Sans2.004、Serif2.003）下载，只用于渲染画面，不随仓库分发 |
| 合成 | ffmpeg：H.264（crf 28）+ AAC 96 kbps，`+faststart` 便于边下边播 |

网站运行时不依赖 TTS 服务：生成好的视频已经提交到仓库。

## 重新生成

需要 Python 3.12+ 和系统里的 ffmpeg、ffprobe：

```bash
python3 -m venv .venv-video && .venv-video/bin/pip install -r video/requirements.txt
# 字体（约 60 MB，缓存到 video/.cache/，已被 .gitignore 排除）
mkdir -p video/.cache && cd video/.cache
curl -LO https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
curl -LO https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf
curl -LO https://github.com/notofonts/noto-cjk/raw/Serif2.003/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Bold.otf
cd ../..
.venv-video/bin/python video/build.py        # 4 段都生成；也可以只传其中几段，如 q01 q07
```

每段视频生成完会打印一行检查结果（分镜数、字幕条数、字幕结束时间、视频时长、文件大小、安全区是否干净），并断言：视频与字幕时长相差小于 1 秒，文件小于 5 MB，每秒抽一帧检查底部安全区内只有底色。每段约需 2 分钟。

edge-tts 不可用时，可以换用离线的 [piper](https://github.com/rhasspy/piper)（`zh_CN-huayan-medium` 模型，音质较一般，模型卡上数据集授权标为 Unknown）：替换 `build.py` 中的 `speak()` 即可，其余步骤不变。

## 修订记录

- 2026-11-12（K）：用户测试发现，浏览器字幕和播放控制条会遮挡画面底部的图形和标注。字幕改为显示在视频下方；两段视频重新排版，底部留出安全区，并重新生成。

- 2026-11-12（L）：用户要求每关至少一段视频。新增第 1 题和第 7 题，沿用同样的风格、字幕和安全区检查；原有两段没有重新生成。

## 已知限制

- 视频是公开的静态文件。页面只在可以看解析时显示入口，但知道地址的人可以在答题前看到讲解和答案。演示项目可以接受。
- 每关只有一题有视频（第 1、4、7、10 题），其余 8 题只有图文解析。
