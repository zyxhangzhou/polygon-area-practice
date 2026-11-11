import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/api';
import type { QuestionDetail, SummaryResponse } from '../api/types';
import { useStore } from '../practice/context';
import { ExplanationPanel } from '../practice/ExplanationPanel';
import { Figure } from '../practice/Figure';
import { LoadFailed, useLoad } from '../practice/load';
import { startPractice } from '../practice/start';
import { navigate } from '../router';
import { storage } from '../storage';
import { buildAdvice } from '../summary/advice';

type SummaryQuestion = SummaryResponse['questions'][number];

const REASON_TEXT = {
  wrong: '答错还没改对',
  skipped: '跳过了',
  unanswered: '没有作答',
} as const;

const GROUPS = [
  { outcome: 'first_try', title: '一次做对', empty: '这次没有一次做对的题，下次加油！' },
  { outcome: 'corrected', title: '订正后做对', empty: '没有需要订正的题。' },
  { outcome: 'not_yet', title: '需回顾', empty: '全部做对了，没有需要回顾的题！' },
] as const;

const excerpt = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * 学习总结（summary-page 规格）：数字、分类、原因都原样取自 GET /summary，不重新计算。
 */
export function SummaryPage() {
  const store = useStore();
  const [sessionId] = useState(() => store.getState().sessionId ?? storage.getSessionId());

  const load = useCallback(async (): Promise<SummaryResponse | null> => {
    if (!sessionId) return null;
    const res = await request<SummaryResponse>('GET', `/api/sessions/${sessionId}/summary`);
    if (res.kind === 'ok') return res.data;
    if (res.kind === 'rejected') {
      // 会话已失效：清除并回首页
      storage.setSessionId(null);
      navigate('/', { replace: true });
    }
    return null;
  }, [sessionId]);
  const { data: summary, failed, reload } = useLoad<SummaryResponse>(load);

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    store.useSession(sessionId);
  }, [store, sessionId]);

  // 进行中的会话没有总结可看：转到当前题
  useEffect(() => {
    if (summary && summary.session.status !== 'completed') {
      const qid = summary.currentQuestionId;
      navigate(qid === null ? '/practice' : `/practice/${qid}`, { replace: true });
    }
  }, [summary]);

  if (failed && sessionId) {
    return (
      <main className="page summary">
        <LoadFailed what="学习总结" onRetry={reload} />
      </main>
    );
  }
  if (!summary || summary.session.status !== 'completed') {
    return (
      <main className="page summary">
        <p>正在读取学习总结…</p>
      </main>
    );
  }
  return <SummaryContent summary={summary} />;
}

function SummaryContent({ summary }: { summary: SummaryResponse }) {
  const store = useStore();
  const [openQid, setOpenQid] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advice = buildAdvice(summary);
  const { counts, rates } = summary;

  async function again() {
    if (starting) return;
    setStarting(true);
    setError(null);
    const res = await startPractice(store);
    setStarting(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <main className="page summary">
      <h1>学习总结</h1>
      <p className="encouragement">{advice.encouragement}</p>
      {summary.session.endedEarly && (
        <p className="ended-early">这次练习提前结束了，没做的题计入"需回顾"。</p>
      )}

      <section className="stats" aria-label="统计">
        <div className="stat">
          <span className="stat-label">首次正确率</span>
          <span className="stat-value">{rates.firstTry}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">最终完成率</span>
          <span className="stat-value">{rates.completion}%</span>
        </div>
        <p className="stat-counts">
          共 {counts.total} 题：一次做对 {counts.firstTry} 题，订正后做对 {counts.corrected}{' '}
          题，需回顾 {counts.notYet} 题
        </p>
      </section>

      <section aria-label="建议">
        <h2>下一步可以这样做</h2>
        <ul className="suggestions">
          {advice.suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      {GROUPS.map((g) => {
        const qs = summary.questions.filter((q) => q.outcome === g.outcome);
        return (
          <section key={g.outcome} aria-label={g.title} className={`group ${g.outcome}`}>
            <h2>
              {g.title}（{qs.length} 题）
            </h2>
            {qs.length === 0 ? (
              <p className="empty">{g.empty}</p>
            ) : (
              <ul className="question-list">
                {qs.map((q) => (
                  <QuestionItem
                    key={q.questionId}
                    q={q}
                    open={openQid === q.questionId}
                    onToggle={() => setOpenQid(openQid === q.questionId ? null : q.questionId)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <div className="actions">
        <button className="primary" disabled={starting} onClick={() => void again()}>
          再练一次
        </button>
        <button onClick={() => navigate('/')}>回到首页</button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </main>
  );
}

function QuestionItem({
  q,
  open,
  onToggle,
}: {
  q: SummaryQuestion;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="question-item">
      <div className="question-head">
        <span>
          第 {q.position} 题 · {q.knowledgePoint}
        </span>
        {q.reviewReason && <span className="reason">{REASON_TEXT[q.reviewReason]}</span>}
        <button onClick={onToggle} aria-expanded={open}>
          {open ? '收起' : `回看第 ${q.position} 题`}
        </button>
      </div>
      <p className="excerpt">{excerpt(q.prompt)}</p>
      {open && <ReviewPanel q={q} />}
    </li>
  );
}

/** 作答概况：只描述发生过的事 */
function attemptSummary(f: SummaryQuestion['facts']): string {
  if (f.attemptCount === 0) return f.skipCount > 0 ? '跳过了，没有作答' : '没有作答';
  const parts = [`作答 ${f.attemptCount} 次`];
  if (f.wrongCount > 0) parts.push(`答错 ${f.wrongCount} 次`);
  if (f.commonMistakes.length > 0) parts.push(`写过 ${f.commonMistakes.join('、')}`);
  return parts.join('，');
}

/** 回看：图形、题干、作答概况、图文解析；没有作答入口 */
function ReviewPanel({ q }: { q: SummaryQuestion }) {
  const store = useStore();
  const loadQuestion = useCallback(() => store.fetchQuestion(q.questionId), [store, q.questionId]);
  const { data: detail, failed, reload } = useLoad<QuestionDetail>(loadQuestion);

  return (
    <div className="review" aria-label={`第 ${q.position} 题回看`} role="region">
      {failed ? (
        <LoadFailed what="题目" onRetry={reload} />
      ) : detail ? (
        <>
          <Figure figure={detail.figure} />
          <p className="prompt">{detail.prompt}</p>
        </>
      ) : (
        <p>正在读取题目…</p>
      )}
      <p className="attempt-summary">{attemptSummary(q.facts)}</p>
      <ExplanationPanel qid={q.questionId} />
    </div>
  );
}
