/**
 * 最多 2 位小数的非负十进制数，用"以 0.01 为单位的 bigint"表示，避免浮点误差。
 * 只接受 ASCII 数字；不用 Number()/parseFloat（它们接受 1e3、0x10、Infinity）。
 */
const DECIMAL_RE = /^([0-9]+)(?:\.([0-9]{1,2}))?$/;

export function isDecimalString(s: string): boolean {
  return DECIMAL_RE.test(s);
}

/** "30" → 3000n，"6.5" → 650n，"6.50" → 650n；格式不合法时抛错 */
export function parseDecimal(s: string): bigint {
  const m = DECIMAL_RE.exec(s);
  if (!m) throw new Error(`不是合法的小数：${JSON.stringify(s)}`);
  const frac = (m[2] ?? '').padEnd(2, '0');
  return BigInt(m[1]!) * 100n + BigInt(frac);
}

export function decimalEquals(a: string, b: string): boolean {
  return parseDecimal(a) === parseDecimal(b);
}

/** 规范值：去掉整数部分前导零和小数部分末尾的零，"007.50" → "7.5"，"30.00" → "30" */
export function canonical(s: string): string {
  const cents = parseDecimal(s);
  const int = (cents / 100n).toString();
  const frac = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
