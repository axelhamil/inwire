import { describe, it, expect } from 'vitest';
import { container, CircularDependencyError } from '../src/index.js';

describe('circular dependency detection', () => {
  it('detects direct circular dependency (A -> B -> A)', () => {
    const c = container()
      .add('a', (c: any) => c.b)
      .add('b', (c: any) => c.a)
      .build();

    expect(() => c.a).toThrow(CircularDependencyError);
  });

  it('detects indirect circular dependency (A -> B -> C -> A)', () => {
    const c = container()
      .add('a', (c: any) => c.b)
      .add('b', (c: any) => c.c)
      .add('c', (c: any) => c.a)
      .build();

    expect(() => c.a).toThrow(CircularDependencyError);
  });

  it('includes the full cycle chain in the error', () => {
    const c = container()
      .add('auth', (c: any) => c.user)
      .add('user', (c: any) => c.auth)
      .build();

    try {
      c.auth;
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
    const c = container()
      .add('self', (c: any) => c.self)
      .build();

    expect(() => c.self).toThrow(CircularDependencyError);
  });

  it('diamond dependencies are OK (not circular)', () => {
    const c = container()
      .add('d', () => 'base')
      .add('b', (c) => `b(${c.d})`)
      .add('c', (c) => `c(${c.d})`)
      .add('a', (deps) => `a(${deps.b}, ${deps.c})`)
      .build();

    expect(c.a).toBe('a(b(base), c(base))');
  });

  it('diamond with singleton sharing works correctly', () => {
    let dCount = 0;
    const c = container()
      .add('d', () => ++dCount)
      .add('b', (c) => c.d)
      .add('c', (c) => c.d)
      .add('a', (deps) => ({ b: deps.b, c: deps.c }))
      .build();

    const result = c.a;
    expect(result.b).toBe(1);
    expect(result.c).toBe(1); // same singleton
    expect(dCount).toBe(1);
  });
});
