import { describe, expect, it } from 'vitest';
import { canonical, decimalEquals, parseDecimal } from '../src/grading/decimal.js';
import { parseAnswerInput } from '../src/grading/input.js';

describe('十进制', () => {
  it('不同写法相等', () => {
    expect(decimalEquals('30', '30.0')).toBe(true);
    expect(decimalEquals('30', '30.00')).toBe(true);
    expect(decimalEquals('6.50', '6.5')).toBe(true);
    expect(decimalEquals('0.3', '0.30')).toBe(true);
    expect(decimalEquals('0.3', '0.31')).toBe(false);
  });

  it('定标整数', () => {
    expect(parseDecimal('30')).toBe(3000n);
    expect(parseDecimal('6.5')).toBe(650n);
    expect(parseDecimal('0.05')).toBe(5n);
  });

  it('规范值', () => {
    expect(canonical('007.50')).toBe('7.5');
    expect(canonical('30.00')).toBe('30');
    expect(canonical('0.0')).toBe('0');
    expect(canonical('0.05')).toBe('0.05');
  });

  it.each(['1e3', '0x10', 'Infinity', '', '-1', '.5', '5.', '1.234', '１'])('拒绝 %j', (s) => {
    expect(() => parseDecimal(s)).toThrow();
  });
});

describe('输入规范化与校验', () => {
  it.each([
    ['48', '48'],
    ['6.5', '6.5'],
    ['0.25', '0.25'],
    ['007', '7'],
    ['00000001', '1'],
    ['12345678.99', '12345678.99'],
    ['３０．５', '30.5'],
    ['30。5', '30.5'],
    ['　 48 ', '48'],
    ['30.00', '30'],
  ])('%j 合法，规范值 %j', (raw, value) => {
    expect(parseAnswerInput(raw)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['　', 'empty'],
    ['1'.repeat(33), 'too_long'],
    ['-5', 'negative'],
    ['-0', 'negative'],
    ['－3.5', 'negative'],
    ['−2', 'negative'],
    ['30cm²', 'has_unit'],
    ['30平方厘米', 'has_unit'],
    ['30 cm', 'has_unit'],
    ['6.125', 'too_many_decimals'],
    ['30.000', 'too_many_decimals'],
    ['123456789', 'too_large'],
    ['abc', 'invalid_format'],
    ['.5', 'invalid_format'],
    ['5.', 'invalid_format'],
    ['+5', 'invalid_format'],
    ['1e3', 'invalid_format'],
    ['1,200', 'invalid_format'],
    ['1 2', 'invalid_format'],
    ['3.2.1', 'invalid_format'],
  ])('%j 不合法：%s', (raw, reason) => {
    const r = parseAnswerInput(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(reason);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('32 个字符以内不触发 too_long', () => {
    const r = parseAnswerInput(' '.repeat(30) + '48');
    expect(r).toEqual({ ok: true, value: '48' });
  });
});
