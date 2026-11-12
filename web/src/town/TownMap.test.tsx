import { describe, expect, it } from 'vitest';
import { STAGES } from '../../../server/src/content/questions';
import { DEFAULT_STAGES } from './TownMap';

describe('DEFAULT_STAGES', () => {
  it('与后端题库的关卡名和建筑名一致', () => {
    expect(DEFAULT_STAGES.map((s) => ({ ...s }))).toEqual(
      STAGES.map((s) => ({ name: s.name, buildingName: s.buildingName })),
    );
  });
});
