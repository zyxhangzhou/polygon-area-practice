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

export const storage = {
  getLearnerId: () => read('learnerId'),
  setLearnerId: (id: string | null) => write('learnerId', id),
  getSessionId: () => read('sessionId'),
  setSessionId: (id: string | null) => write('sessionId', id),
  clearAll() {
    write('learnerId', null);
    write('sessionId', null);
  },
};
