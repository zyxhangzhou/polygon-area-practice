import { expect, it } from 'vitest';

it('jsdom 环境可用', () => {
  expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
});
