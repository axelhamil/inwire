import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

describe('reset', () => {
  it('reset forces re-creation on next access', () => {
    let callCount = 0;

    const c = container()
      .add('db', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    expect(c.db.id).toBe(1);
    expect(c.db.id).toBe(1); // cached

    c.reset('db');

    expect(c.db.id).toBe(2); // new instance
    expect(callCount).toBe(2);
  });

  it('reset does not affect other singletons', () => {
    let dbCount = 0;
    let cacheCount = 0;

    const c = container()
      .add('db', () => ({ id: ++dbCount }))
      .add('cache', () => ({ id: ++cacheCount }))
      .build();

    c.db;
    c.cache;

    c.reset('db');

    expect(c.db.id).toBe(2); // re-created
    expect(c.cache.id).toBe(1); // untouched
  });

  it('reset on unresolved key is a silent no-op', () => {
    const c = container()
      .add('db', () => 'database')
      .build();

    // Should not throw
    c.reset('db');
  });

  it('reset + onInit: next access calls onInit again', () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        value: 'svc',
        onInit() {
          initCount++;
        },
      }))
      .build();

    c.service;
    expect(initCount).toBe(1);

    c.reset('service');

    c.service;
    expect(initCount).toBe(2);
  });

  it('reset in scope does not affect parent cache', () => {
    let parentCount = 0;

    const parent = container()
      .add('db', () => ({ id: ++parentCount }))
      .build();

    // Resolve in parent
    expect(parent.db.id).toBe(1);

    const child = parent.scope({
      db: () => ({ id: 999 }),
    });

    expect(child.db.id).toBe(999);

    child.reset('db');

    // Child re-creates its own
    expect(child.db.id).toBe(999);
    // Parent untouched
    expect(parent.db.id).toBe(1);
    expect(parentCount).toBe(1);
  });

  describe('reset + introspection', () => {
    it('after reset, inspect() shows resolved=false', () => {
      const c = container()
        .add('db', () => 'postgres')
        .build();

      c.db;
      expect(c.inspect().providers.db?.resolved).toBe(true);

      c.reset('db');
      expect(c.inspect().providers.db?.resolved).toBe(false);
    });

    it('after reset, describe() shows resolved=false and deps=[]', () => {
      const c = container()
        .add('config', () => ({ host: 'localhost' }))
        .add('db', (c) => `pg://${c.config.host}`)
        .build();

      c.db;
      expect(c.describe('db').resolved).toBe(true);
      expect(c.describe('db').deps).toEqual(['config']);

      c.reset('db');
      expect(c.describe('db').resolved).toBe(false);
      expect(c.describe('db').deps).toEqual([]);
    });

    it('after reset, health() updates resolved/unresolved', () => {
      const c = container()
        .add('a', () => 1)
        .add('b', () => 2)
        .build();

      c.a;
      c.b;
      expect(c.health().resolved).toEqual(['a', 'b']);
      expect(c.health().unresolved).toEqual([]);

      c.reset('a');
      expect(c.health().resolved).toEqual(['b']);
      expect(c.health().unresolved).toEqual(['a']);
    });

    it('reset without args clears all cache + depGraph', () => {
      const c = container()
        .add('a', () => 1)
        .add('b', (deps) => deps.a + 1)
        .build();

      c.b;
      expect(c.health().resolved).toEqual(['a', 'b']);
      expect(c.describe('b').deps).toEqual(['a']);

      c.reset();
      expect(c.health().resolved).toEqual([]);
      expect(c.health().unresolved).toEqual(['a', 'b']);
      expect(c.describe('b').deps).toEqual([]);
    });
  });
});
