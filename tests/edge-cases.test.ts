import { describe, expect, it } from 'vitest';
import {
  AsyncInitErrorWarning,
  ContainerError,
  container,
  FactoryError,
  ProviderNotFoundError,
  ReservedKeyError,
  ScopeMismatchWarning,
  UndefinedReturnError,
} from '../src/index.js';

describe('empty-string keys', () => {
  it('resolving an empty key throws a ContainerError, never a raw TypeError', () => {
    const c = container()
      .add('a', () => 1)
      .build();

    let caught: unknown;
    try {
      (c as unknown as Record<string, unknown>)[''];
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ContainerError);
    expect(caught).toBeInstanceOf(ProviderNotFoundError);
    expect(caught).not.toBeInstanceOf(TypeError);
  });

  it('builds a usable hint for an empty key', () => {
    const c = container()
      .add('a', () => 1)
      .build();

    try {
      (c as unknown as Record<string, unknown>)[''];
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ProviderNotFoundError).hint).toContain("Add ''");
    }
  });

  it('registers and resolves an empty key when explicitly declared', () => {
    const c = container()
      .add('', () => 'empty-key-value')
      .build();

    expect((c as unknown as Record<string, unknown>)['']).toBe('empty-key-value');
  });

  it('an empty key in a scope-mismatch warning does not crash', () => {
    const warning = new ScopeMismatchWarning('', '');
    expect(warning.hint).toBeTypeOf('string');
    expect(warning.details).toEqual({ singleton: '', transient: '' });
  });

  it('an empty key in a reserved-key error does not crash', () => {
    const error = new ReservedKeyError('', ['scope']);
    expect(error.hint).toBeTypeOf('string');
    expect(error).toBeInstanceOf(ContainerError);
  });
});

describe('fuzzy suggestion edge cases', () => {
  it('suggests nothing when the container is empty', () => {
    const c = container().build();

    try {
      (c as unknown as Record<string, unknown>).anything;
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ProviderNotFoundError).details.suggestion).toBeUndefined();
    }
  });

  it('handles a registered empty key as a suggestion candidate', () => {
    const c = container()
      .add('', () => 1)
      .build();

    try {
      (c as unknown as Record<string, unknown>).somethingLong;
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderNotFoundError);
    }
  });
});

describe('error message branches', () => {
  it('UndefinedReturnError omits the chain when resolved directly', () => {
    const error = new UndefinedReturnError('db', ['db']);
    expect(error.message).not.toContain('Resolution chain');
  });

  it('UndefinedReturnError includes the chain when nested', () => {
    const error = new UndefinedReturnError('db', ['app', 'db']);
    expect(error.message).toContain('Resolution chain');
  });

  it('FactoryError omits the chain when resolved directly', () => {
    const error = new FactoryError('db', ['db'], new Error('boom'));
    expect(error.message).not.toContain('Resolution chain');
  });

  it('FactoryError stringifies a non-Error throw', () => {
    const error = new FactoryError('db', ['app', 'db'], 'plain string throw');
    expect(error.message).toContain('plain string throw');
    expect(error.details.originalError).toBe('plain string throw');
    expect(error.originalError).toBe('plain string throw');
  });

  it('ProviderNotFoundError omits the chain at the root', () => {
    const error = new ProviderNotFoundError('db', [], ['a'], undefined);
    expect(error.message).not.toContain('Resolution chain');
  });

  it('AsyncInitErrorWarning stringifies a non-Error rejection', () => {
    const warning = new AsyncInitErrorWarning('db', 'plain rejection');
    expect(warning.message).toContain('plain rejection');
    expect(warning.details.error).toBe('plain rejection');
  });
});

describe('configurable similarity threshold', () => {
  const suggestionFor = (c: unknown, missing: string): string | undefined => {
    try {
      (c as Record<string, unknown>)[missing];
      return undefined;
    } catch (error) {
      return (error as ProviderNotFoundError).details.suggestion;
    }
  };

  it('suggests a close key at the default threshold', () => {
    const c = container()
      .add('userRepository', () => 1)
      .build();

    expect(suggestionFor(c, 'userRepo')).toBe('userRepository');
  });

  it('a high threshold rejects a loose match', () => {
    const c = container({ similarityThreshold: 0.95 })
      .add('userRepository', () => 1)
      .build();

    expect(suggestionFor(c, 'userRepo')).toBeUndefined();
  });

  it('a low threshold accepts a distant match', () => {
    const c = container({ similarityThreshold: 0.1 })
      .add('userRepository', () => 1)
      .build();

    expect(suggestionFor(c, 'usr')).toBe('userRepository');
  });

  it('propagates through scope()', () => {
    const parent = container({ similarityThreshold: 0.95 })
      .add('userRepository', () => 1)
      .build();
    const child = parent.scope({ reqId: () => 'r' });

    expect(suggestionFor(child, 'userRepo')).toBeUndefined();
  });

  it('propagates through extend()', () => {
    const base = container({ similarityThreshold: 0.95 })
      .add('userRepository', () => 1)
      .build();
    const extended = base.extend({ other: () => 2 });

    expect(suggestionFor(extended, 'userRepo')).toBeUndefined();
  });

  it('propagates through module()', () => {
    const base = container({ similarityThreshold: 0.95 })
      .add('userRepository', () => 1)
      .build();
    const extended = base.module((b) => b.add('other', () => 2));

    expect(suggestionFor(extended, 'userRepo')).toBeUndefined();
  });
});

describe('well-known symbols are detectable with `in`', () => {
  const build = () =>
    container()
      .add('db', () => 'pg')
      .build();

  it('reports the symbols the proxy actually implements', () => {
    const c = build();
    expect(Symbol.asyncDispose in c).toBe(true);
    expect(Symbol.iterator in c).toBe(true);
    expect(Symbol.toPrimitive in c).toBe(true);
    expect(Symbol.toStringTag in c).toBe(true);
  });

  it('reports false for unrelated symbols', () => {
    const c = build();
    expect(Symbol('nope') in c).toBe(false);
    expect(Symbol.hasInstance in c).toBe(false);
  });

  it('feature-detecting asyncDispose matches the working implementation', async () => {
    const c = build();
    expect(Symbol.asyncDispose in c).toBe(true);
    await (c as unknown as AsyncDisposable)[Symbol.asyncDispose]();
  });
});

describe('own vs inherited views on a scope', () => {
  it('separates own bindings from resolvable ones', () => {
    const parent = container()
      .add('a', () => 1)
      .add('b', () => 2)
      .build();
    const child = parent.scope({ c: () => 3 });

    expect(child.size).toBe(1);
    expect(Object.keys(child)).toEqual(['c']);
    expect(Object.keys(child.inspect().providers)).toEqual(['c']);
    expect(child.health().totalProviders).toBe(1);
    expect([...child].map(([k]) => k)).toEqual(['c']);

    expect(child.a).toBe(1);
    expect(child.b).toBe(2);
    expect('a' in child).toBe(true);
    expect('missing' in child).toBe(false);
  });

  it('extend() flattens, so its own view contains everything', () => {
    const base = container()
      .add('a', () => 1)
      .build();
    const extended = base.extend({ b: () => 2 });

    expect(extended.size).toBe(2);
    expect(Object.keys(extended).sort()).toEqual(['a', 'b']);
  });
});

describe('proxy property descriptors', () => {
  it('reports no descriptor for an unknown key', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    expect(Object.getOwnPropertyDescriptor(c, 'nope')).toBeUndefined();
  });

  it('reports no descriptor for a symbol', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    expect(Object.getOwnPropertyDescriptor(c, Symbol('x'))).toBeUndefined();
  });

  it('exposes a lazy accessor descriptor for registered keys', () => {
    let built = 0;
    const c = container()
      .add('db', () => {
        built++;
        return 'pg';
      })
      .build();

    const descriptor = Object.getOwnPropertyDescriptor(c, 'db');
    expect(descriptor?.get).toBeTypeOf('function');
    expect(built).toBe(0);

    expect(descriptor?.get?.()).toBe('pg');
    expect(built).toBe(1);
  });

  it('spreads resolved values', () => {
    const c = container()
      .add('db', () => 'pg')
      .add('port', () => 5432)
      .build();

    expect({ ...c }).toEqual({ db: 'pg', port: 5432 });
  });

  it('marks registered keys enumerable and methods non-enumerable', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    expect(Object.getOwnPropertyDescriptor(c, 'db')?.enumerable).toBe(true);
    expect(Object.getOwnPropertyDescriptor(c, 'inspect')?.enumerable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(c, 'size')?.enumerable).toBe(false);
  });
});
