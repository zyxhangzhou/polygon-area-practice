import { useCallback, useEffect } from 'react';
import type { Explanation } from '../api/types';
import { useStore } from './context';
import { splitStepLabel, toSegments, type HighlightKind } from './highlight';
import { LoadFailed, useLoad } from './load';

export const HIGHLIGHT_LABELS: Record<HighlightKind, string> = {
  c: '条件',
  f: '公式和算式',
  k: '关键',
};

/** 带重点标记的文字：标记处用 <mark> 显示底色（explanation-highlights D2） */
function Marked({ text }: { text: string }) {
  return (
    <>
      {toSegments(text).map((s, i) =>
        s.kind ? (
          <mark key={i} className={`hl hl-${s.kind}`} data-kind={s.kind}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** 图文解析：显示出来才上报"打开图文解析"（答题页与总结页回看共用） */
export function ExplanationPanel({ qid }: { qid: number }) {
  const store = useStore();
  const loadExplanation = useCallback(() => store.fetchExplanation(qid), [store, qid]);
  const { data: explanation, failed, reload } = useLoad<Explanation>(loadExplanation);

  // 解析真正显示出来才上报"打开图文解析"
  useEffect(() => {
    if (explanation) store.reportTextOpened(qid);
  }, [store, qid, explanation]);

  if (failed) return <LoadFailed what="解析" onRetry={reload} />;
  if (!explanation) return <p>正在读取解析…</p>;
  return (
    <section className="explanation" aria-label="图文解析">
      <h2>图文解析</h2>
      <ul className="hl-legend" aria-label="颜色说明">
        {(Object.keys(HIGHLIGHT_LABELS) as HighlightKind[]).map((k) => (
          <li key={k}>
            <i className={`hl-swatch hl-${k}`} aria-hidden="true" />
            {HIGHLIGHT_LABELS[k]}
          </li>
        ))}
      </ul>
      <ol className="steps">
        {explanation.steps.map((step, i) => {
          const { label, body } = splitStepLabel(step);
          return (
            <li key={i}>
              {label && <span className="step-label">{label}</span>}
              <span className="step-body">
                <Marked text={body} />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="tip">
        <span className="tip-label">易错提醒</span>
        <Marked text={explanation.tip} />
      </p>
    </section>
  );
}
