import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

describe('extend', () => {
  it('shares existing singleton cache with extended container', () => {
    let callCount = 0;

    const base = container()
      .add('logger', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    // Resolve in base — cached
    const baseLogger = base.logger;
    expect(callCount).toBe(1);

    const extended = base.extend({
      db: () => 'database',
    });

    // Extended gets the same cached instance — factory not called again
    expect(extended.logger).toEqual(baseLogger);
    expect(callCount).toBe(1);
  });

  it('new singletons in extended do NOT propagate back to original', () => {
    const base = container()
      .add('a', () => 'a-value')
      .build();

    const extended = base.extend({
      b: () => 'b-value',
    });

    // Resolve b in extended
    expect(extended.b).toBe('b-value');

    // b is not accessible in base
    expect(() => (base as any).b).toThrow();
  });

  it('does not mutate the original container', () => {
    const base = container()
      .add('logger', () => 'log')
      .build();

    const extended = base.extend({
      db: () => 'pg',
    });

    const baseKeys = Object.keys(base);
    expect(baseKeys).toContain('logger');
    expect(baseKeys).not.toContain('db');

    const extendedKeys = Object.keys(extended);
    expect(extendedKeys).toContain('logger');
    expect(extendedKeys).toContain('db');
  });

  it('extended container can depend on base deps', () => {
    const base = container()
      .add('config', () => ({ host: 'localhost' }))
      .build();

    const extended = base.extend({
      db: (c) => `db@${c.config.host}`,
    });

    expect(extended.db).toBe('db@localhost');
  });

  it('chaining multiple extends', () => {
    const base = container()
      .add('a', () => 'a')
      .build();

    const ext1 = base.extend({ b: (c) => `${c.a}+b` });
    const ext2 = ext1.extend({ c: (c) => `${c.b}+c` });

    expect(ext2.c).toBe('a+b+c');
  });

  it('extend validates config like builder', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    expect(() => base.extend({ bad: 'not a function' } as any)).toThrow();
  });

  describe('dispose across extend() siblings', () => {
    it('does not call onDestroy twice when ext is disposed before root', async () => {
      let destroyed = 0;
      const root = container()
        .add('svc', () => ({
          onDestroy() {
            destroyed++;
          },
        }))
        .build();
      root.svc;
      const ext = root.extend({ other: () => 1 });
      await ext.dispose();
      await root.dispose();
      expect(destroyed).toBe(1);
    });

    it('does not call onDestroy twice when root is disposed before ext', async () => {
      let destroyed = 0;
      const root = container()
        .add('svc', () => ({
          onDestroy() {
            destroyed++;
          },
        }))
        .build();
      root.svc;
      const ext = root.extend({ other: () => 1 });
      await root.dispose();
      await ext.dispose();
      expect(destroyed).toBe(1);
    });

    it('handles chained extends — one onDestroy per instance across all siblings', async () => {
      let destroyed = 0;
      const root = container()
        .add('svc', () => ({
          onDestroy() {
            destroyed++;
          },
        }))
        .build();
      root.svc;
      const ext1 = root.extend({ a: () => 1 });
      const ext2 = ext1.extend({ b: () => 2 });
      await root.dispose();
      await ext1.dispose();
      await ext2.dispose();
      expect(destroyed).toBe(1);
    });

    it('extended-only instances are still destroyed by their own container', async () => {
      let rootDestroyed = 0;
      let extDestroyed = 0;
      const root = container()
        .add('rootSvc', () => ({
          onDestroy() {
            rootDestroyed++;
          },
        }))
        .build();
      root.rootSvc;
      const ext = root.extend({
        extSvc: () => ({
          onDestroy() {
            extDestroyed++;
          },
        }),
      });
      ext.extSvc;
      await ext.dispose();
      await root.dispose();
      expect(rootDestroyed).toBe(1);
      expect(extDestroyed).toBe(1);
    });

    it('instance not yet resolved before extend is still destroyable exactly once', async () => {
      let destroyed = 0;
      const root = container()
        .add('lazy', () => ({
          onDestroy() {
            destroyed++;
          },
        }))
        .build();
      const ext = root.extend({ extra: () => 42 });
      ext.lazy; // resolved through ext, lands in ext's copied cache
      await ext.dispose();
      await root.dispose();
      expect(destroyed).toBe(1);
    });
  });

  describe('scope vs extend differences', () => {
    it('scope creates parent-child chain, extend creates flat merge', () => {
      let parentCallCount = 0;
      const base = container()
        .add('service', () => {
          parentCallCount++;
          return { id: parentCallCount };
        })
        .build();

      // Resolve in base
      base.service;
      expect(parentCallCount).toBe(1);

      // Scope: child delegates to parent — same instance from parent cache
      const scoped = base.scope({ extra: () => 'x' });
      expect(scoped.service.id).toBe(1);
      expect(parentCallCount).toBe(1); // parent's cached singleton

      // Extend: copies cache snapshot — same instance from copied cache
      const extended = base.extend({ extra: () => 'x' });
      expect(extended.service.id).toBe(1);
      expect(parentCallCount).toBe(1); // copied cache
    });

    it('scope isolates child singletons, extend does not pollute base', () => {
      const base = container()
        .add('shared', () => 'shared')
        .build();

      const scoped = base.scope({
        childOnly: () => 'scoped-value',
      });

      const extended = base.extend({
        childOnly: () => 'extended-value',
      });

      expect(scoped.childOnly).toBe('scoped-value');
      expect(extended.childOnly).toBe('extended-value');

      // Neither affects base
      expect(() => (base as any).childOnly).toThrow();
    });
  });
});
