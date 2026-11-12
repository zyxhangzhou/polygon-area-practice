import { useCallback, useState } from 'react';
import type { Explanation } from '../api/types';
import { useStore } from './context';
import { LoadFailed, useLoad } from './load';

export const VIDEO_FAILED = '视频暂时无法播放，可以先看图文解析';

/**
 * 视频讲解（video-explanations，design D3）：地址来自解析接口，与图文解析一样只在可以看解析时出现。
 * 真正开始播放才上报 video_started，播放到结尾上报 video_completed；不自动播放，默认显示字幕。
 */
export function VideoPanel({ qid, onShowText }: { qid: number; onShowText: () => void }) {
  const store = useStore();
  const loadExplanation = useCallback(() => store.fetchExplanation(qid), [store, qid]);
  const { data: explanation, failed, reload } = useLoad<Explanation>(loadExplanation);
  const [broken, setBroken] = useState(false);

  if (failed) return <LoadFailed what="视频讲解" onRetry={reload} />;
  if (!explanation) return <p>正在读取视频讲解…</p>;
  const src = explanation.videoUrl;
  if (!src || broken) {
    return (
      <section className="video-panel" aria-label="视频讲解">
        <div role="alert" className="notice">
          <p>{VIDEO_FAILED}</p>
          <button onClick={onShowText}>看图文解析</button>
        </div>
      </section>
    );
  }
  const base = src.replace(/\.mp4$/, '');
  return (
    <section className="video-panel" aria-label="视频讲解">
      <h2>视频讲解</h2>
      <video
        controls
        preload="metadata"
        playsInline
        poster={`${base}.jpg`}
        onPlaying={() => store.reportVideoStarted(qid)}
        onEnded={() => store.reportVideoCompleted(qid)}
        onError={() => setBroken(true)}
      >
        <source src={src} type="video/mp4" onError={() => setBroken(true)} />
        <track kind="captions" src={`${base}.vtt`} srcLang="zh" label="中文" default />
      </video>
      <p className="video-note">约 1 分钟，有字幕。看完可以再试一次。</p>
    </section>
  );
}
