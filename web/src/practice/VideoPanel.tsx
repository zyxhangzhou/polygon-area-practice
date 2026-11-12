import { useCallback, useEffect, useRef, useState } from 'react';
import type { Explanation } from '../api/types';
import { useStore } from './context';
import { LoadFailed, useLoad } from './load';
import { cueAt, parseVtt, type Cue } from './vtt';

export const VIDEO_FAILED = '视频暂时无法播放，可以先看图文解析';

/**
 * 视频讲解（video-explanations）：地址来自解析接口，与图文解析一样只在可以看解析时出现。
 * 真正开始播放才上报 video_started，播放到结尾上报 video_completed；不自动播放。
 * 字幕显示在视频下方，不叠在画面上；全屏时改用浏览器自带的字幕（video-caption-layout D1）。
 */
export function VideoPanel({ qid, onShowText }: { qid: number; onShowText: () => void }) {
  const store = useStore();
  const loadExplanation = useCallback(() => store.fetchExplanation(qid), [store, qid]);
  const { data: explanation, failed, reload } = useLoad<Explanation>(loadExplanation);
  const [broken, setBroken] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [caption, setCaption] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = explanation?.videoUrl ?? null;
  const base = src?.replace(/\.mp4$/, '') ?? null;

  // 读取字幕；失败时不显示字幕行，视频照常播放
  useEffect(() => {
    if (!base) return;
    let active = true;
    fetch(`${base}.vtt`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => {
        if (active) setCues(parseVtt(text));
      })
      .catch(() => {
        if (active) setCues([]);
      });
    return () => {
      active = false;
    };
  }, [base]);

  // 全屏时页面上的字幕看不到，改用浏览器自带的字幕；退出全屏后关掉，避免叠在画面上
  useEffect(() => {
    const onFullscreen = () => {
      const video = videoRef.current;
      const track = video?.textTracks?.[0];
      if (!video || !track) return;
      track.mode = document.fullscreenElement === video ? 'showing' : 'hidden';
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const syncCaption = () => {
    const video = videoRef.current;
    if (video) setCaption(cueAt(cues, video.currentTime)?.text ?? null);
  };

  if (failed) return <LoadFailed what="视频讲解" onRetry={reload} />;
  if (!explanation) return <p>正在读取视频讲解…</p>;
  if (!src || !base || broken) {
    return (
      <section className="video-panel" aria-label="视频讲解">
        <div role="alert" className="notice">
          <p>{VIDEO_FAILED}</p>
          <button onClick={onShowText}>看图文解析</button>
        </div>
      </section>
    );
  }
  return (
    <section className="video-panel" aria-label="视频讲解">
      <h2>视频讲解</h2>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        playsInline
        poster={`${base}.jpg`}
        onPlaying={() => store.reportVideoStarted(qid)}
        onEnded={() => store.reportVideoCompleted(qid)}
        onTimeUpdate={syncCaption}
        onSeeked={syncCaption}
        onError={() => setBroken(true)}
      >
        <source src={src} type="video/mp4" onError={() => setBroken(true)} />
        <track kind="captions" src={`${base}.vtt`} srcLang="zh" label="中文" />
      </video>
      {cues.length > 0 && (
        <p className="video-caption" data-testid="video-caption">
          {caption ?? ' '}
        </p>
      )}
      <p className="video-note">约 1 分钟，字幕显示在视频下方。看完可以再试一次。</p>
    </section>
  );
}
