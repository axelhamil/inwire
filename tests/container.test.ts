import { describe, expect, it } from 'vitest';
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
      .add('a', () => {
        resolved.push('a');
        return 'a';
      })
      .add('b', () => {
        resolved.push('b');
        return 'b';
      })
      .add('c', (deps) => {
        resolved.push('c');
        return deps.a;
      })
      .build();

    c.c;
    expect(resolved).toEqual(['c', 'a']);
    expect(resolved).not.toContain('b');
  });

  describe('proxy behavior', () => {
    it('Object.entries() returns deps (not methods)', () => {
      const c = container()
        .add('db', () => 'postgres')
        .add('cache', () => 'redis')
        .build();

      c.db;
      c.cache;

      const entries = Object.entries(c);
      const keys = entries.map(([k]) => k);
      expect(keys).toContain('db');
      expect(keys).toContain('cache');
      expect(keys).not.toContain('inspect');
      expect(keys).not.toContain('dispose');
    });

    it('for...in iterates deps only', () => {
      const c = container()
        .add('a', () => 1)
        .add('b', () => 2)
        .build();

      const keys: string[] = [];
      for (const key in c) {
        keys.push(key);
      }

      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).not.toContain('inspect');
      expect(keys).not.toContain('scope');
    });

    it('spread {...container} copies resolved values', () => {
      const c = container()
        .add('x', () => 10)
        .add('y', () => 20)
        .build();

      c.x;
      c.y;

      const spread = { ...c };
      expect(spread.x).toBe(10);
      expect(spread.y).toBe(20);
    });

    it('JSON.stringify({...container}) serializes resolved deps', () => {
      const c = container()
        .add('name', () => 'inwire')
        .add('version', () => 1)
        .build();

      c.name;
      c.version;

      const json = JSON.stringify({ ...c });
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('inwire');
      expect(parsed.version).toBe(1);
    });

    it('Object.getOwnPropertyNames() includes deps + methods', () => {
      const c = container()
        .add('db', () => 'pg')
        .build();

      const names = Object.getOwnPropertyNames(c);
      expect(names).toContain('db');
      expect(names).toContain('inspect');
      expect(names).toContain('dispose');
    });
  });
});

describe('toJSON()', () => {
  it('JSON.stringify(container) returns valid JSON with only resolved deps', () => {
    const c = container()
      .add('name', () => 'inwire')
      .add('version', () => 1)
      .add('lazy', () => 'not-yet')
      .build();

    c.name;
    c.version;
    // 'lazy' is not resolved

    const json = JSON.stringify(c);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('inwire');
    expect(parsed.version).toBe(1);
    expect('lazy' in parsed).toBe(false);
  });

  it('does not trigger lazy resolution of unresolved deps', () => {
    let called = false;
    const c = container()
      .add('eager', () => 'yes')
      .add('lazy', () => {
        called = true;
        return 'triggered';
      })
      .build();

    c.eager;
    expect(called).toBe(false);
    JSON.stringify(c);
    expect(called).toBe(false);
  });

  it('returns empty object for a container with no resolved deps', () => {
    const c = container()
      .add('a', () => 1)
      .add('b', () => 2)
      .build();

    const json = JSON.stringify(c);
    expect(JSON.parse(json)).toEqual({});
  });

  it('toJSON() method returns a plain Record', () => {
    const c = container()
      .add('x', () => 42)
      .build();

    c.x;
    const obj = c.toJSON();
    expect(obj).toEqual({ x: 42 });
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
  });
});

describe('size', () => {
  it('returns count of registered providers', () => {
    const c = container()
      .add('a', () => 1)
      .add('b', () => 2)
      .add('c', () => 3)
      .build();

    expect(c.size).toBe(3);
  });

  it('empty container has size 0', () => {
    const c = container().build();
    expect(c.size).toBe(0);
  });

  it('is not affected by resolution state', () => {
    const c = container()
      .add('x', () => 10)
      .add('y', () => 20)
      .build();

    expect(c.size).toBe(2);
    c.x;
    expect(c.size).toBe(2);
  });

  it('includes parent keys in scoped container', () => {
    const parent = container()
      .add('a', () => 1)
      .add('b', () => 2)
      .build();

    const child = parent.scope({ c: () => 3 });
    expect(child.size).toBe(3);
  });

  it('includes all keys in extended container', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    const extended = base.extend({ b: () => 2, c: () => 3 });
    expect(extended.size).toBe(3);
  });

  it('size is not enumerable in Object.keys()', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    const keys = Object.keys(c);
    expect(keys).not.toContain('size');
  });
});

describe('Symbol.iterator', () => {
  it('for...of iterates [key, value] pairs and triggers resolution', () => {
    const c = container()
      .add('a', () => 1)
      .add('b', () => 2)
      .build();

    const entries: [string, unknown][] = [];
    for (const entry of c) {
      entries.push(entry);
    }

    expect(entries).toContainEqual(['a', 1]);
    expect(entries).toContainEqual(['b', 2]);
    expect(entries.length).toBe(2);
  });

  it('spread via Array.from works', () => {
    const c = container()
      .add('x', () => 10)
      .add('y', () => 20)
      .build();

    const entries = Array.from(c);
    expect(entries).toContainEqual(['x', 10]);
    expect(entries).toContainEqual(['y', 20]);
  });

  it('[...container] spread works', () => {
    const c = container()
      .add('p', () => 'ping')
      .build();

    const entries = [...c];
    expect(entries).toContainEqual(['p', 'ping']);
  });

  it('only iterates registered dep keys, not container methods', () => {
    const c = container()
      .add('db', () => 'pg')
      .add('cache', () => 'redis')
      .build();

    const keys = [...c].map(([k]) => k);
    expect(keys).not.toContain('inspect');
    expect(keys).not.toContain('dispose');
    expect(keys).not.toContain('scope');
    expect(keys).not.toContain('size');
    expect(keys).toContain('db');
    expect(keys).toContain('cache');
  });

  it('iterating triggers lazy resolution', () => {
    let called = false;
    const c = container()
      .add('lazy', () => {
        called = true;
        return 'resolved';
      })
      .build();

    expect(called).toBe(false);
    const entries = [...c];
    expect(called).toBe(true);
    expect(entries).toContainEqual(['lazy', 'resolved']);
  });

  it('works on scoped containers', () => {
    const parent = container()
      .add('a', () => 1)
      .build();

    const child = parent.scope({ b: () => 2 });
    const entries = [...child];
    const keys = entries.map(([k]) => k);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('works on extended containers', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    const extended = base.extend({ b: () => 2 });
    const entries = [...extended];
    expect(entries).toContainEqual(['a', 1]);
    expect(entries).toContainEqual(['b', 2]);
  });
});

describe('coercion', () => {
  it('String(container) returns the inspect string', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    const str = String(c);
    expect(typeof str).toBe('string');
    expect(str).toContain('Container');
  });

  it('template literal coercion returns the inspect string', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    const str = `${c}`;
    expect(typeof str).toBe('string');
    expect(str).toContain('Container');
  });

  it('string concatenation returns the inspect string', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    // biome-ignore lint/style/useTemplate: intentional string coercion test
    const str = c + '';
    expect(typeof str).toBe('string');
    expect(str).toContain('Container');
  });

  it('+container (numeric coercion) produces NaN', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    // Symbol.toPrimitive returns the inspect string for any hint;
    // coercing a non-numeric string to number yields NaN.
    const num = +c;
    expect(Number.isNaN(num)).toBe(true);
  });

  it('loose equality with a string is false', () => {
    const c = container()
      .add('db', () => 'pg')
      .build();

    // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality coercion test
    expect(c == 'something').toBe(false);
  });
});
