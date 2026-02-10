import { describe, it, expect } from 'vitest';
import { container } from '../src/index.js';

describe('container builder', () => {
  it('creates a container with simple factories', () => {
    const c = container()
      .add('value', () => 42)
      .add('name', () => 'test')
      .build();

    expect(c.value).toBe(42);
    expect(c.name).toBe('test');
  });

  it('resolves dependencies between factories', () => {
    const c = container()
      .add('base', () => 10)
      .add('doubled', (c) => c.base * 2)
      .add('message', (c) => `Result: ${c.doubled}`)
      .build();

    expect(c.doubled).toBe(20);
    expect(c.message).toBe('Result: 20');
  });

  it('caches singletons — same instance on repeated access', () => {
    let callCount = 0;
    const c = container()
      .add('service', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    const first = c.service;
    const second = c.service;

    expect(first).toBe(second);
    expect(callCount).toBe(1);
  });

  it('resolves lazily — factory not called until accessed', () => {
    let called = false;
    const c = container()
      .add('lazy', () => {
        called = true;
        return 'resolved';
      })
      .build();

    expect(called).toBe(false);
    expect(c.lazy).toBe('resolved');
    expect(called).toBe(true);
  });

  it('supports complex dependency chains', () => {
    const c = container()
      .add('config', () => ({ host: 'localhost', port: 5432 }))
      .add('db', (c) => ({ connect: () => `${c.config.host}:${c.config.port}` }))
      .add('userRepo', (c) => ({ find: () => `from ${c.db.connect()}` }))
      .add('userService', (c) => ({ getUser: () => c.userRepo.find() }))
      .build();

    expect(c.userService.getUser()).toBe('from localhost:5432');
  });

  it('supports "in" operator (has trap)', () => {
    const c = container()
      .add('db', () => 'database')
      .add('logger', () => 'logger')
      .build();

    expect('db' in c).toBe(true);
    expect('logger' in c).toBe(true);
    expect('nonExistent' in c).toBe(false);
    // Container methods are also "in"
    expect('inspect' in c).toBe(true);
    expect('dispose' in c).toBe(true);
  });

  it('supports Object.keys() (ownKeys trap)', () => {
    const c = container()
      .add('db', () => 'database')
      .add('logger', () => 'logger')
      .build();

    const keys = Object.keys(c);
    expect(keys).toContain('db');
    expect(keys).toContain('logger');
  });

  it('String() coercion works via Symbol.toPrimitive', () => {
    const c = container()
      .add('db', () => 'pg')
      .add('logger', () => 'log')
      .build();

    c.db;

    const str = String(c);
    expect(str).toContain('Container');
    expect(str).toContain('db');
    expect(str).toContain('(resolved)');
    expect(str).toContain('logger');
    expect(str).toContain('(pending)');
  });

  it('symbol property access returns undefined for unknown symbols', () => {
    const c = container()
      .add('a', () => 1)
      .build();

    expect((c as any)[Symbol.iterator]).toBeUndefined();
    expect((c as any)[Symbol.for('random')]).toBeUndefined();
  });

  it('container methods are not enumerable in Object.keys()', () => {
    const c = container()
      .add('db', () => 'database')
      .build();

    const keys = Object.keys(c);
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

    const c = container()
      .add('a', () => { resolved.push('a'); return 'a'; })
      .add('b', () => { resolved.push('b'); return 'b'; })
      .add('c', (deps) => { resolved.push('c'); return deps.a; })
      .build();

    c.c;
    expect(resolved).toEqual(['c', 'a']);
    expect(resolved).not.toContain('b');
  });
});
