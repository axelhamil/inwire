import { describe, it, expect } from 'vitest';
import { createContainer } from '../src/index.js';

describe('createContainer', () => {
  it('creates a container with simple factories', () => {
    const container = createContainer({
      value: () => 42,
      name: () => 'test',
    });

    expect(container.value).toBe(42);
    expect(container.name).toBe('test');
  });

  it('resolves dependencies between factories', () => {
    const container = createContainer({
      base: () => 10,
      doubled: (c) => c.base * 2,
      message: (c) => `Result: ${c.doubled}`,
    });

    expect(container.doubled).toBe(20);
    expect(container.message).toBe('Result: 20');
  });

  it('caches singletons — same instance on repeated access', () => {
    let callCount = 0;
    const container = createContainer({
      service: () => {
        callCount++;
        return { id: callCount };
      },
    });

    const first = container.service;
    const second = container.service;

    expect(first).toBe(second);
    expect(callCount).toBe(1);
  });

  it('resolves lazily — factory not called until accessed', () => {
    let called = false;
    const container = createContainer({
      lazy: () => {
        called = true;
        return 'resolved';
      },
    });

    expect(called).toBe(false);
    expect(container.lazy).toBe('resolved');
    expect(called).toBe(true);
  });

  it('supports complex dependency chains', () => {
    const container = createContainer({
      config: () => ({ host: 'localhost', port: 5432 }),
      db: (c) => ({ connect: () => `${c.config.host}:${c.config.port}` }),
      userRepo: (c) => ({ find: () => `from ${c.db.connect()}` }),
      userService: (c) => ({ getUser: () => c.userRepo.find() }),
    });

    expect(container.userService.getUser()).toBe('from localhost:5432');
  });

  it('supports "in" operator (has trap)', () => {
    const container = createContainer({
      db: () => 'database',
      logger: () => 'logger',
    });

    expect('db' in container).toBe(true);
    expect('logger' in container).toBe(true);
    expect('nonExistent' in container).toBe(false);
    // Container methods are also "in"
    expect('inspect' in container).toBe(true);
    expect('dispose' in container).toBe(true);
  });

  it('supports Object.keys() (ownKeys trap)', () => {
    const container = createContainer({
      db: () => 'database',
      logger: () => 'logger',
    });

    const keys = Object.keys(container);
    expect(keys).toContain('db');
    expect(keys).toContain('logger');
  });

  it('String() coercion works via Symbol.toPrimitive', () => {
    const container = createContainer({
      db: () => 'pg',
      logger: () => 'log',
    });

    container.db;

    const str = String(container);
    expect(str).toContain('Container');
    expect(str).toContain('db');
    expect(str).toContain('(resolved)');
    expect(str).toContain('logger');
    expect(str).toContain('(pending)');
  });

  it('symbol property access returns undefined for unknown symbols', () => {
    const container = createContainer({
      a: () => 1,
    });

    expect((container as any)[Symbol.iterator]).toBeUndefined();
    expect((container as any)[Symbol.for('random')]).toBeUndefined();
  });

  it('container methods are not enumerable in Object.keys()', () => {
    const container = createContainer({
      db: () => 'database',
    });

    const keys = Object.keys(container);
    expect(keys).not.toContain('inspect');
    expect(keys).not.toContain('dispose');
    expect(keys).not.toContain('scope');
    expect(keys).not.toContain('extend');
    expect(keys).not.toContain('health');
    expect(keys).not.toContain('describe');
    expect(keys).not.toContain('preload');
    expect(keys).not.toContain('toString');
  });

  it('resolves only the necessary dependency tree', () => {
    const resolved: string[] = [];

    const container = createContainer({
      a: () => { resolved.push('a'); return 'a'; },
      b: () => { resolved.push('b'); return 'b'; },
      c: (deps) => { resolved.push('c'); return deps.a; },
    });

    container.c;
    expect(resolved).toEqual(['c', 'a']);
    expect(resolved).not.toContain('b');
  });
});
