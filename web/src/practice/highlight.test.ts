import { describe, expect, it } from 'vitest';
import { INVALID_CASES, VALID_CASES } from '../../../server/test/highlight-cases';
import { parseHighlights, splitStepLabel, toSegments } from './highlight';

describe('重点标记的解析（与后端同一组用例）', () => {
  it.each(VALID_CASES)('合法：$text', ({ text, segments }) => {
    expect(parseHighlights(text)).toEqual({ segments });
  });

  it.each(INVALID_CASES)('不合法：%s', (text) => {
    expect(parseHighlights(text)).toHaveProperty('error');
  });

  it('不合法时显示为去掉花括号的普通文字', () => {
    expect(toSegments('{x:未知}类型')).toEqual([{ kind: null, text: 'x:未知类型' }]);
  });
});

describe('步骤小标题', () => {
  it('拆出"："前的小标题', () => {
    expect(splitStepLabel('看图找条件：{c:底是 8 cm}。')).toEqual({
      label: '看图找条件',
      body: '{c:底是 8 cm}。',
    });
  });

  it('没有"："或"："在标记里时不拆', () => {
    expect(splitStepLabel('没有小标题')).toEqual({ label: null, body: '没有小标题' });
    expect(splitStepLabel('{c:比例：1}')).toEqual({ label: null, body: '{c:比例：1}' });
  });
});
