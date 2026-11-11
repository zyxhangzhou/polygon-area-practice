import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Explanation, QuestionDetail, SessionView } from '../api/types';
import { usePracticeState, useStore } from '../practice/context';
import { Figure } from '../practice/Figure';
import type { Feedback } from '../practice/store';
import { navigate } from '../router';
import { storage } from '../storage';

const STATUS_TEXT = {
  unanswered: '未作答',
  wrong: '答错',
  skipped: '跳过',
  solved: '已答对',
} as const;

/** 读取题目或解析：失败时（结果不确定）给出重试，不会一直停在"正在读取" */
function useLoad<T>(load: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load().then((d) => {
      if (!active) return;
      setData(d);
      setFailed(d === null);
    });
    return () => {
      active = false;
    };
    // load 由调用方用 useCallback 固定，attempt 变化时重新读取
  }, [load, attempt]);
  const reload = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { data, failed, reload };
}

function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="notice">
      <p>暂时没能读取{what}，请检查网络后重试</p>
      <button onClick={onRetry}>重新读取</button>
    </div>
  );
}

/** 地址中的题号是否可以直接打开：在本次练习中，且所在关卡已解锁 */
function isOpenable(session: SessionView, qid: number | null): qid is number {
  if (qid === null) return false;
  const q = session.questions.find((x) => x.questionId === qid);
  if (!q) return false;
  return session.stages.find((s) => s.stageId === q.stageId)?.unlocked ?? false;
}

export function PracticePage({ qid }: { qid: number | null }) {
  const store = useStore();
  const state = usePracticeState();
  const { session } = state;

  // 刷新后从存储读取会话；没有会话就回首页
  useEffect(() => {
    const sessionId = store.getState().sessionId ?? storage.getSessionId();
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    store.useSession(sessionId);
    if (!store.getState().session) void store.refresh();
  }, [store]);

  // 地址纠正：会话已结束 → 总结页；题号不可打开 → 当前题（design D1）
  useEffect(() => {
    if (!session) return;
    if (session.session.status === 'completed') {
      navigate('/summary', { replace: true });
      return;
    }
    if (!isOpenable(session, qid) && session.currentQuestionId !== null) {
      navigate(`/practice/${session.currentQuestionId}`, { replace: true });
    }
  }, [session, qid]);

  if (!session) {
    return (
      <main className="page">
        {state.loadFailed ? (
          <div role="alert" className="notice">
            <p>暂时连不上服务器，请稍后再试</p>
            <button onClick={() => void store.refresh()}>重新连接</button>
          </div>
        ) : (
          <p>正在读取进度…</p>
        )}
      </main>
    );
  }

  const openable = isOpenable(session, qid);
  return (
    <main className="page practice">
      <Progress session={session} qid={openable ? qid : null} />
      <RetryPanel />
      <FinishPanel session={session} />
      {openable ? (
        <QuestionPanel key={qid} session={session} qid={qid} />
      ) : (
        session.currentQuestionId === null && <p>所有题目都做对了！</p>
      )}
    </main>
  );
}

// ---------- 结果不确定 ----------

/** 放在页面层：不管当前显示哪道题，等待重试时都能看到提示和"再提交一次" */
function RetryPanel() {
  const store = useStore();
  const { pendingRetry, notice, waitingForEvent } = usePracticeState();
  if (!pendingRetry) {
    // 作答排在解析上报后面时立即说明，避免学生以为页面没反应
    return waitingForEvent ? (
      <p role="status" className="notice waiting">
        正在保存解析记录，请稍等，你的答案会紧接着提交
      </p>
    ) : null;
  }
  return (
    <div role="alert" className="notice uncertain">
      <p>{notice}</p>
      <button className="primary" onClick={() => store.retry()}>
        再提交一次
      </button>
    </div>
  );
}

// ---------- 进度 ----------

function Progress({ session, qid }: { session: SessionView; qid: number | null }) {
  // 等待重试时只能"再提交一次"，不能换题
  const retrying = usePracticeState().pendingRetry !== null;
  const current = session.questions.find((q) => q.questionId === qid);
  const stageIndex = current ? session.stages.findIndex((s) => s.stageId === current.stageId) : -1;
  return (
    <header className="progress">
      {current && (
        <p className="progress-title">
          第 {stageIndex + 1} 关 · 第 {current.position}/{session.questions.length} 题
        </p>
      )}
      <ol className="stages">
        {session.stages.map((stage, i) => (
          <li key={stage.stageId} className={`stage ${stage.unlocked ? '' : 'locked'}`}>
            <span className="stage-name">
              第 {i + 1} 关 {stage.name} · {stage.buildingName}
              <span className="stage-state">
                {stage.lit
                  ? '已点亮'
                  : stage.unlocked
                    ? `施工中 ${stage.solvedCount}/${stage.total}`
                    : '未解锁'}
              </span>
            </span>
            <span className="chips">
              {session.questions
                .filter((q) => q.stageId === stage.stageId)
                .map((q) => (
                  <button
                    key={q.questionId}
                    className={`chip ${q.status} ${q.questionId === qid ? 'active' : ''}`}
                    disabled={!stage.unlocked || retrying}
                    aria-current={q.questionId === qid ? 'step' : undefined}
                    aria-label={`第 ${q.position} 题，${STATUS_TEXT[q.status]}`}
                    onClick={() => navigate(`/practice/${q.questionId}`)}
                  >
                    {q.position}
                  </button>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </header>
  );
}

// ---------- 结束练习 ----------

function FinishPanel({ session }: { session: SessionView }) {
  const store = useStore();
  const { busy, pendingRetry } = usePracticeState();
  const [confirming, setConfirming] = useState(false);
  const locked = busy || pendingRetry !== null;

  return (
    <section className="finish">
      {session.canFinish ? (
        <div className="finish-ready">
          <p>
            所有题目都处理过了！
            {session.skippedCount > 0 && `还有 ${session.skippedCount} 道题跳过了，要回去试试吗？`}
          </p>
          <button className="primary" disabled={locked} onClick={() => store.complete(false)}>
            完成练习
          </button>
        </div>
      ) : (
        <button className="link" disabled={locked} onClick={() => setConfirming(true)}>
          提前结束
        </button>
      )}
      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="确认提前结束" className="dialog">
          <p>还有题没有完成，确定要提前结束吗？没做的题会记为"需要回顾"。</p>
          <button
            className="primary"
            disabled={locked}
            onClick={() => {
              setConfirming(false);
              store.complete(true);
            }}
          >
            确定结束
          </button>
          <button onClick={() => setConfirming(false)}>取消</button>
        </div>
      )}
    </section>
  );
}

// ---------- 题目 ----------

function QuestionPanel({ session, qid }: { session: SessionView; qid: number }) {
  const store = useStore();
  const state = usePracticeState();
  const loadQuestion = useCallback(() => store.fetchQuestion(qid), [store, qid]);
  const { data: detail, failed, reload } = useLoad<QuestionDetail>(loadQuestion);
  const [answer, setAnswer] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 换题时清掉上一题的反馈
  useEffect(() => {
    store.clearFeedback();
  }, [store, qid]);

  const status = session.questions.find((q) => q.questionId === qid)!.status;
  const feedback = state.feedback?.questionId === qid ? state.feedback : null;
  const invalid = state.invalid?.questionId === qid ? state.invalid.message : null;
  const retrying = state.pendingRetry;
  const locked = state.busy || retrying !== null;
  const canExplain = status !== 'unanswered';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    if (answer.trim() === '') {
      setLocalError('先填写答案再提交哦');
      return;
    }
    setLocalError(null);
    store.submitAnswer(qid, answer);
  }

  function tryAgain() {
    store.clearFeedback();
    setAnswer('');
    inputRef.current?.focus();
  }

  if (failed) return <LoadFailed what="题目" onRetry={reload} />;
  if (!detail) return <p>正在读取题目…</p>;

  return (
    <article className="question">
      <Figure figure={detail.figure} />
      <p className="prompt">{detail.prompt}</p>

      {feedback && <FeedbackView feedback={feedback} session={session} onTryAgain={tryAgain} />}

      {status === 'solved' ? (
        !feedback && <p className="solved">这道题已经做对了</p>
      ) : (
        <form onSubmit={submit} className="answer-form">
          <label>
            答案
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={
                retrying?.type === 'attempt' && retrying.questionId === qid
                  ? retrying.answer
                  : answer
              }
              readOnly={retrying !== null}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <span className="unit">{detail.unit}</span>
          </label>
          <button type="submit" className="primary" disabled={locked}>
            提交
          </button>
          {(localError ?? invalid) && (
            <p role="alert" className="invalid">
              {localError ?? invalid}
            </p>
          )}
          {status === 'wrong' && !feedback && <p className="hint">这道题上次没答对，再试试吧。</p>}
        </form>
      )}

      {!retrying && state.notice && (
        <p role="alert" className="notice">
          {state.notice}
        </p>
      )}

      <div className="actions">
        {canExplain && (
          <button disabled={retrying !== null} onClick={() => setShowExplanation((v) => !v)}>
            {showExplanation ? '收起图文解析' : '看图文解析'}
          </button>
        )}
        {status !== 'solved' && (
          <button disabled={locked} onClick={() => store.skip(qid)}>
            先跳过
          </button>
        )}
        {status === 'solved' &&
          session.currentQuestionId !== null &&
          session.currentQuestionId !== qid && (
            <button
              className="primary"
              disabled={retrying !== null}
              onClick={() => navigate(`/practice/${session.currentQuestionId}`)}
            >
              {feedback?.kind === 'result' ? '下一题' : '去当前题'}
            </button>
          )}
      </div>

      {showExplanation && canExplain && <ExplanationPanel qid={qid} />}
    </article>
  );
}

function FeedbackView({
  feedback,
  session,
  onTryAgain,
}: {
  feedback: Feedback;
  session: SessionView;
  onTryAgain: () => void;
}) {
  if (feedback.kind === 'already-solved') {
    return (
      <p role="status" className="feedback">
        这道题已经做对了
      </p>
    );
  }
  const { result } = feedback;
  if (!result.correct) {
    return (
      <div role="status" className="feedback wrong">
        <p>{result.mistakeHint ?? '还不对哦，再想想？也可以先看看图文解析。'}</p>
        <button onClick={onTryAgain}>再试一次</button>
      </div>
    );
  }
  const q = session.questions.find((x) => x.questionId === result.questionId);
  const stage = session.stages.find((s) => s.stageId === q?.stageId);
  return (
    <div role="status" className="feedback correct">
      <p>
        {result.outcome === 'corrected'
          ? '改正成功！看懂了再做对，这才是真本事！'
          : '答对了，一次就做对，真棒！'}
      </p>
      {result.stageLit && stage && <p className="lit">{stage.buildingName}点亮了！</p>}
    </div>
  );
}

function ExplanationPanel({ qid }: { qid: number }) {
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
