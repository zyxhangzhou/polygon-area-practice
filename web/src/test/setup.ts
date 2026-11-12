import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  // 默认已看过首次引导，免得它出现在与引导无关的页面测试里；引导的测试自己清除
  try {
    localStorage.setItem('polygon.guideSeen', '1');
  } catch {
    // 存储不可用时忽略
  }
});

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // 存储不可用时忽略
  }
  window.history.replaceState(null, '', '/');
});
