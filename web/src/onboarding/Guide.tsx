import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bear, type Mood } from '../companion/Bear';
import './guide.css';

type Step = { target: string; mood: Mood; title: string; text: string };

/** 引导的四步（onboarding-guide）；target 对应首页元素的 data-guide */
export const STEPS: Step[] = [
  {
    target: 'welcome',
    mood: 'happy',
    title: '欢迎来到图形小镇',
    text: '我是圆圆，带着卷尺陪你盖房子。这里一共 4 关，每关是一种图形的面积。',
  },
  {
    target: 'plot',
    mood: 'idle',
    title: '这里将盖起面包店',
    text: '每做对一道题，建筑就盖高一层；一关三道题都做对，它就会亮起灯来。',
  },
  {
    target: 'map',
    mood: 'think',
    title: '一关一关往前走',
    text: '本关的题都做过（做对或跳过）就能去下一关。卡住时可以先跳过，也可以看图文解析。',
  },
  {
    target: 'start',
    mood: 'cheer',
    title: '准备好了吗',
    text: '点这里开始第一题。',
  },
];

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 10;

/**
 * 首次进入引导（design D6）：对话框 + 聚光灯高亮。高亮框用很大的 box-shadow 盖住其余部分；
 * 按目标元素的位置定位，窗口大小或滚动变化时重新计算。
 */
export function Guide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const measure = () => {
      const r = el?.getBoundingClientRect();
      setRect(
        r
          ? {
              top: r.top - PAD,
              left: r.left - PAD,
              width: r.width + 2 * PAD,
              height: r.height + 2 * PAD,
            }
          : null,
      );
    };
    const frame = requestAnimationFrame(measure);
    // 平滑滚动结束后再量一次
    const late = setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  // 对话框放在高亮区域下方；下方放不下就放上方；没有目标时居中
  const below = rect ? rect.top + rect.height + 16 : null;
  const placeAbove = rect !== null && below !== null && below + 260 > window.innerHeight;
  const dialogStyle = rect
    ? {
        top: placeAbove ? Math.max(16, rect.top - 16) : below!,
        left: Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - 456)),
        transform: placeAbove ? 'translateY(-100%)' : undefined,
      }
    : undefined;

  return (
    <div className="guide" onKeyDown={onKeyDown}>
      {rect ? (
        <div className="guide-spotlight" style={rect} aria-hidden="true" />
      ) : (
        <div className="guide-dim" aria-hidden="true" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-text"
        className={`guide-dialog ${rect ? '' : 'centered'}`}
        style={dialogStyle}
      >
        <div className="companion">
          <div className="companion-avatar">
            <Bear key={step.mood} mood={step.mood} />
          </div>
          <div className="companion-words">
            <span className="companion-kicker">
              圆圆 · {index + 1} / {STEPS.length}
            </span>
            <h2 id="guide-title" className="companion-title">
              {step.title}
            </h2>
          </div>
        </div>
        <p id="guide-text" className="companion-text">
          {step.text}
        </p>
        <div className="guide-foot">
          <div className="guide-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.target} className={i === index ? 'on' : ''} />
            ))}
          </div>
          <div className="actions">
            {!last && (
              <button type="button" className="link" onClick={onClose}>
                跳过引导
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              className="primary small"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
            >
              {last ? '开始吧' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
