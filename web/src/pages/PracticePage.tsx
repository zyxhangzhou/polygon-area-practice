import { useCallback, useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import type { QuestionDetail, SessionView } from '../api/types';
import { Bear } from '../companion/Bear';
import { feedbackLine, type Line } from '../companion/lines';
import { usePracticeState, useStore } from '../practice/context';
import { Figure } from '../practice/Figure';
import { ExplanationPanel } from '../practice/ExplanationPanel';
import { LoadFailed, useLoad } from '../practice/load';
import type { Feedback } from '../practice/store';
import { navigate } from '../router';
import { storage } from '../storage';
import { Building, buildingState, statusText } from '../town/Building';
import { KINDS_IN_ORDER } from '../town/buildings';
import { Brand } from '../ui/Brand';

const STATUS_TEXT = {
  unanswered: '未作答',
  wrong: '答错',
  skipped: '跳过',
  solved: '已答对',
} as const;

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
      <div className="topbar">
        <Brand />
        <Progress session={session} qid={openable ? qid : null} />
      </div>
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
            <span
              className="stage-name"
              title={`第 ${i + 1} 关 ${stage.name} · ${stage.buildingName}`}
            >
              {stage.buildingName}
              <span className="visually-hidden">
                ，第 {i + 1} 关 {stage.name}，
                {statusText(buildingState(stage).status, stage.solvedCount, stage.total)}
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

  const question = session.questions.find((q) => q.questionId === qid)!;
  const status = question.status;
  const feedback = state.feedback?.questionId === qid ? state.feedback : null;

  // 图形提示：后端判为答错后出现；"再试一次"时保留，做对后消失；换题或刷新（重新挂载）时不显示
  const [hint, setHint] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const companionRef = useRef<HTMLElement>(null);
  // 窄屏时圆圆和建筑排在题目下面：出现新的判题结果时把它们滚到可见处，免得错过反馈和建造
  const resultShown = feedback?.kind === 'result' ? feedback : null;
  useEffect(() => {
    if (!resultShown || !window.matchMedia?.('(max-width: 900px)').matches) return;
    // 答对：看建筑长高；答错：只露出圆圆的话，尽量让上方的图形提示留在屏幕上
    const target = resultShown.result.correct ? panelRef.current : companionRef.current;
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [resultShown]);

  const [seenFeedback, setSeenFeedback] = useState(feedback);
  if (feedback !== seenFeedback) {
    setSeenFeedback(feedback);
    if (feedback) setHint(feedback.kind === 'result' && !feedback.result.correct);
  }
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

  const stageIndex = session.stages.findIndex((st) => st.stageId === question.stageId);
  const stage = session.stages[stageIndex]!;

  return (
    <div className="practice-layout">
      <article className="question">
        <div className="question-meta">
          <strong>
            第 {stageIndex + 1} 关 · {stage.name} · 第 {question.position} 题
          </strong>
        </div>
        <Figure figure={detail.figure} hint={hint && status !== 'solved'} />
        <p className="prompt">{detail.prompt}</p>

        {status === 'solved' ? (
          !feedback && <p className="solved">这道题已经做对了</p>
        ) : (
          <form onSubmit={submit} className="answer-form">
            <label className={`answer-field ${hint ? 'wrong' : ''}`}>
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
                onChange={(e) => {
                  // 开始改答案：收起上一次的判题结果，回到"提交"（图形提示保留）
                  if (feedback) store.clearFeedback();
                  setAnswer(e.target.value);
                }}
              />
              <span className="unit">{detail.unit}</span>
            </label>
            {feedback?.kind === 'result' && !feedback.result.correct ? (
              <button type="button" className="primary" onClick={tryAgain}>
                再试一次
              </button>
            ) : (
              <button type="submit" className="primary" disabled={locked}>
                提交
              </button>
            )}
            {(localError ?? invalid) && (
              <p role="alert" className="invalid">
                {localError ?? invalid}
              </p>
            )}
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
            <button className="link" disabled={locked} onClick={() => store.skip(qid)}>
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

      <aside className="practice-aside">
        <CompanionCard
          ref={companionRef}
          line={companionLine(feedback, status, stage.buildingName)}
        />
        <StagePanel ref={panelRef} session={session} stageIndex={stageIndex} />
      </aside>
    </div>
  );
}

/** 圆圆此刻说的话：有判题结果时按结果，否则按题目状态（companion-feedback） */
function companionLine(
  feedback: Feedback | null,
  status: SessionView['questions'][number]['status'],
  buildingName: string,
): Line {
  if (feedback?.kind === 'result') return feedbackLine(feedback.result, buildingName);
  if (feedback?.kind === 'already-solved' || status === 'solved') {
    return {
      mood: 'happy',
      kicker: '已完成',
      title: '这一题完成了',
      text: '可以看看解析，或者去当前题。',
    };
  }
  if (status === 'wrong') {
    return {
      mood: 'think',
      kicker: '再来一次',
      title: '换个角度想想',
      text: '这道题上次没答对，再试试吧。',
    };
  }
  if (status === 'skipped') {
    return {
      mood: 'idle',
      kicker: '回来了',
      title: '再试一次这道题',
      text: '之前跳过了它，现在可以慢慢来。',
    };
  }
  return {
    mood: 'idle',
    kicker: '圆圆',
    title: '算好后填上数字',
    text: '单位已经写好了，只填数字就行。',
  };
}

function CompanionCard({ ref, line }: { ref?: Ref<HTMLElement>; line: Line }) {
  return (
    <section
      ref={ref}
      className={`card companion-card ${line.mood === 'cheer' ? 'cheer' : ''}`}
      aria-label="圆圆的话"
    >
      <div className="companion" role="status">
        <div className="companion-avatar">
          <Bear key={line.mood} mood={line.mood} />
        </div>
        <div className="companion-words">
          <span className="companion-kicker">{line.kicker}</span>
          <p className="companion-title">{line.title}</p>
          <p className="companion-text">{line.text}</p>
        </div>
      </div>
    </section>
  );
}

/** 当前关卡的建筑：常驻在答题页，作答后随后端进度长高（town-display） */
function StagePanel({
  ref,
  session,
  stageIndex,
}: {
  ref?: Ref<HTMLElement>;
  session: SessionView;
  stageIndex: number;
}) {
  const stage = session.stages[stageIndex]!;
  const { status, level } = buildingState(stage);
  const left = stage.total - stage.solvedCount;
  return (
    <section
      ref={ref}
      className={`card stage-panel is-${status}`}
      aria-label={`${stage.buildingName}的进度`}
    >
      <div className="stage-panel-head">
        <h2>{stage.buildingName}</h2>
        <span className="stage-panel-state">{statusText(status, level, stage.total)}</span>
      </div>
      <Building
        kind={KINDS_IN_ORDER[stageIndex] ?? 'plaza'}
        name={stage.buildingName}
        status={status}
        level={level}
      />
      <p className="stage-panel-note">
        {status === 'lit'
          ? '这一关的三道题都做对了，建筑已经点亮。'
          : `再做对 ${left} 道${stage.name}的题，${stage.buildingName}就能点亮。`}
      </p>
    </section>
  );
}
