import { describe, expect, it } from 'vitest';
import { describeError } from '../src/errors.js';

describe('describeError', () => {
  it('展开 Drizzle 包装的 pg 错误，不输出 SQL 与参数', () => {
    const pgErr = Object.assign(new Error('column "knowledge_point" does not exist'), {
      code: '42703',
    });
    const wrapped = new Error(
      'Failed query: insert into "questions" ... params: 1,{"huge":"json"}',
      {
        cause: pgErr,
      },
    );
    const text = describeError(wrapped);
    expect(text).toBe('42703 column "knowledge_point" does not exist');
  });

  it('保留外层说明并附上原因', () => {
    const inner = Object.assign(new Error('canceling statement due to lock timeout'), {
      code: '55P03',
    });
    const outer = new Error('等待迁移锁超过 30 秒', { cause: inner });
    expect(describeError(outer)).toBe(
      '等待迁移锁超过 30 秒 ← 55P03 canceling statement due to lock timeout',
    );
  });

  it('展开 AggregateError（连接被拒绝时 message 为空）', () => {
    const agg = new AggregateError(
      [
        Object.assign(new Error('connect ECONNREFUSED ::1:1'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }),
      ],
      '',
    );
    expect(describeError(agg)).toContain('ECONNREFUSED connect ECONNREFUSED 127.0.0.1:1');
  });
});
