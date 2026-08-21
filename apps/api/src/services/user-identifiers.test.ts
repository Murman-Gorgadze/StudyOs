import { describe, expect, it } from 'vitest';
import { buildLookupValues, normalizeIdentifierValue } from './user-identifiers.js';

describe('user identifiers', () => {
  it('normalizes gmail and unique ids for lookup', () => {
    expect(normalizeIdentifierValue('  Alice.Smith+tag@Gmail.com  ')).toBe('alice.smith@gmail.com');
    expect(normalizeIdentifierValue('  @goal-42  ')).toBe('goal-42');
    expect(normalizeIdentifierValue('  GOAL_42  ')).toBe('goal_42');
  });

  it('builds a set of lookup values that match email, gmail and unique id variants', () => {
    const values = buildLookupValues({
      email: 'alice.smith@gmail.com',
      handle: 'goal-42',
      name: 'Alice Smith',
    });

    expect(values).toContain('alice.smith@gmail.com');
    expect(values).toContain('alice.smith');
    expect(values).toContain('goal-42');
    expect(values).toContain('alice smith');
  });
});
