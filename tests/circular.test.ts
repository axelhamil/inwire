import { describe, it, expect } from 'vitest';
import { createContainer, CircularDependencyError } from '../src/index.js';

describe('circular dependency detection', () => {
  it('detects direct circular dependency (A -> B -> A)', () => {
    const container = createContainer({
      a: (c) => c.b,
      b: (c) => c.a,
    });

    expect(() => container.a).toThrow(CircularDependencyError);
  });

  it('detects indirect circular dependency (A -> B -> C -> A)', () => {
    const container = createContainer({
      a: (c) => c.b,
      b: (c) => c.c,
      c: (c) => c.a,
    });

    expect(() => container.a).toThrow(CircularDependencyError);
  });

  it('includes the full cycle chain in the error', () => {
    const container = createContainer({
      auth: (c) => c.user,
      user: (c) => c.auth,
    });

    try {
      container.auth;
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CircularDependencyError);
      const err = e as CircularDependencyError;
      expect(err.message).toContain('auth');
      expect(err.message).toContain('user');
      expect(err.message).toContain('Cycle:');
      expect(err.hint).toBeTruthy();
    }
  });

  it('self-referencing dependency is detected', () => {
    const container = createContainer({
      self: (c) => c.self,
    });

    expect(() => container.self).toThrow(CircularDependencyError);
  });

  it('diamond dependencies are OK (not circular)', () => {
    // A depends on B and C; B and C both depend on D
    const container = createContainer({
      d: () => 'base',
      b: (c) => `b(${c.d})`,
      c: (c) => `c(${c.d})`,
      a: (deps) => `a(${deps.b}, ${deps.c})`,
    });

    expect(container.a).toBe('a(b(base), c(base))');
  });

  it('diamond with singleton sharing works correctly', () => {
    let dCount = 0;
    const container = createContainer({
      d: () => ++dCount,
      b: (c) => c.d,
      c: (c) => c.d,
      a: (deps) => ({ b: deps.b, c: deps.c }),
    });

    const result = container.a as { b: number; c: number };
    expect(result.b).toBe(1);
    expect(result.c).toBe(1); // same singleton
    expect(dCount).toBe(1);
  });
});
