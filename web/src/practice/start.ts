import { request } from '../api/api';
import type { LearnerResponse, SessionView } from '../api/types';
import { navigate } from '../router';
import { storage } from '../storage';
import type { PracticeStore } from './store';

export const OFFLINE_MESSAGE = '暂时连不上服务器，请稍后再试';

async function ensureLearner(): Promise<string | null> {
  const saved = storage.getLearnerId();
  if (saved) return saved;
  const res = await request<LearnerResponse>('POST', '/api/learners', {});
  if (res.kind !== 'ok') return null;
  storage.setLearnerId(res.data.learnerId);
  return res.data.learnerId;
}

/**
 * 开始练习 / 再练一次（design D4）：没有学生就先创建；后端在没有进行中的会话时新建一个。
 * 保存的学生已失效时清除并重新创建一次。成功后进入当前题。
 */
export async function startPractice(
  store: PracticeStore,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (let tries = 0; tries < 2; tries++) {
    const learnerId = await ensureLearner();
    if (!learnerId) break;
    const res = await request<SessionView>('POST', '/api/sessions', { learnerId });
    if (res.kind === 'ok') {
      const view = res.data;
      storage.setSessionId(view.session.id);
      store.useSession(view.session.id, view);
      navigate(view.currentQuestionId ? `/practice/${view.currentQuestionId}` : '/practice');
      return { ok: true };
    }
    if (res.kind === 'rejected' && res.code === 'LEARNER_NOT_FOUND') {
      storage.clearAll();
      continue;
    }
    break;
  }
  return { ok: false, message: OFFLINE_MESSAGE };
}
