/**
 * 浏览器里只保存学生标识和会话标识；进度一律从后端获取。
 * 隐私模式等情况下 localStorage 可能不可用，读写失败时退化为只在当前页面有效。
 */
const KEYS = { learnerId: 'polygon.learnerId', sessionId: 'polygon.sessionId' } as const;
type Key = keyof typeof KEYS;

const memory = new Map<Key, string>();

function read(key: Key): string | null {
  try {
    return localStorage.getItem(KEYS[key]);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: Key, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(KEYS[key]);
    else localStorage.setItem(KEYS[key], value);
  } catch {
    // 不可用时只保留在内存中
  }
}

/** 引导是否看过：只是本机的界面偏好，不是学习数据；清除学生时不清它 */
const GUIDE_KEY = 'polygon.guideSeen';
export const storage = {
  /** 读取失败时按"看过"处理，避免每次都弹出引导 */
  getGuideSeen(): boolean {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      return true;
    }
  },
  setGuideSeen() {
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // 不可用时读取也会失败，按"看过"处理
    }
  },
  getLearnerId: () => read('learnerId'),
  setLearnerId: (id: string | null) => write('learnerId', id),
  getSessionId: () => read('sessionId'),
  setSessionId: (id: string | null) => write('sessionId', id),
  clearAll() {
    write('learnerId', null);
    write('sessionId', null);
  },
};
