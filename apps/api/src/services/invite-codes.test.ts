import { describe, expect, it } from 'vitest';
import { normalizeCode } from './invite-codes.js';

describe('invite code normalisation', () => {
  it('accepts whatever casing or spacing the user pasted', () => {
    expect(normalizeCode('abcd2345')).toBe('ABCD2345');
    expect(normalizeCode('  ABCD 2345  ')).toBe('ABCD2345');
    expect(normalizeCode('ABCD-2345')).toBe('ABCD2345');
  });

  it('strips anything that could not be part of a code', () => {
    expect(normalizeCode("'; DROP TABLE Goal;--")).toBe('DROPTABLEGOAL');
    expect(normalizeCode('<script>')).toBe('SCRIPT');
    expect(normalizeCode('')).toBe('');
  });
});
