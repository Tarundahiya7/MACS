// src/tests/env.test.js
import { describe, it, expect } from 'vitest';
import { resolveBaseURL } from '../utils/env';

describe('env resolution', () => {
  it('returns a non-empty string', () => {
    const url = resolveBaseURL();
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });
});