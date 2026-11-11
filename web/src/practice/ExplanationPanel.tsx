import { useCallback, useEffect } from 'react';
import type { Explanation } from '../api/types';
import { useStore } from './context';
import { LoadFailed, useLoad } from './load';

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
      <ol>
        {explanation.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="tip">易错提醒：{explanation.tip}</p>
    </section>
  );
}
