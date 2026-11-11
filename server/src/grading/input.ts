import { canonical, isDecimalString } from './decimal.js';

export const MAX_INPUT_LENGTH = 32;
export const MAX_INTEGER_DIGITS = 8;

export type InvalidReason =
  | 'empty'
  | 'too_long'
  | 'negative'
  | 'has_unit'
  | 'too_many_decimals'
  | 'too_large'
  | 'invalid_format';

/** 给学生看的提示；后端统一给出，前端直接显示 */
export const INVALID_MESSAGES: Record<InvalidReason, string> = {
  empty: '还没有填答案哦，先算一算再提交吧。',
  too_long: '答案太长啦，只填一个数字就好。',
  negative: '面积和长度不会是负数，再检查一下吧。',
  has_unit: '只填数字就好，单位已经写好了。',
  too_many_decimals: '最多保留 2 位小数，再看看你的结果。',
  too_large: '这个数太大了，再检查一下计算吧。',
  invalid_format: '请填一个数字，比如 48 或 6.5；小数点前后都要有数字，比如写成 0.5。',
};

export type ParsedInput =
  { ok: true; value: string } | { ok: false; reason: InvalidReason; message: string };

const FULLWIDTH_DIGIT = /[０-９]/g;
const MINUS = /^[-−－]/;
const NUMBER_PREFIX = /^[0-9]+(?:\.[0-9]+)?/;

/** 去首尾空白（含全角空格），全角数字、全角小数点、中文句号转半角；不动中间的字符 */
export function normalizeInput(raw: string): string {
  return raw
    .trim()
    .replace(FULLWIDTH_DIGIT, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[．。]/g, '.');
}

function invalid(reason: InvalidReason): ParsedInput {
  return { ok: false, reason, message: INVALID_MESSAGES[reason] };
}

/** 规范化并校验学生输入；合法时返回规范值（如 "007.50" → "7.5"） */
export function parseAnswerInput(raw: string): ParsedInput {
  if (raw.length > MAX_INPUT_LENGTH) return invalid('too_long');
  const s = normalizeInput(raw);
  if (s === '') return invalid('empty');

  if (isDecimalString(s)) {
    const intDigits = s.split('.')[0]!.replace(/^0+/, '');
    if (intDigits.length > MAX_INTEGER_DIGITS) return invalid('too_large');
    return { ok: true, value: canonical(s) };
  }

  if (MINUS.test(s) && isDecimalString(s.slice(1))) return invalid('negative');
  if (/^[0-9]+\.[0-9]{3,}$/.test(s)) return invalid('too_many_decimals');

  const prefix = NUMBER_PREFIX.exec(s)?.[0];
  if (prefix && isDecimalString(prefix)) {
    const rest = s.slice(prefix.length);
    if (!/[0-9.]/.test(rest)) return invalid('has_unit');
  }
  return invalid('invalid_format');
}
