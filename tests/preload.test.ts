import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('preload', () => {
  it('awaits async onInit', async () => {
    let connected = false;

    const c = container()
      .add('db', () => ({
        async onInit() {
          await sleep(10);
          connected = true;
        },
      }))
      .build();

    await c.preload('db');
    expect(connected).toBe(true);
  });

  it('initializes independent branches in parallel', async () => {
    const events: string[] = [];

    const c = container()
      .add('db', () => ({
        async onInit() {
          events.push('db:start');
          await sleep(10);
          events.push('db:end');
        },
      }))
      .add('cache', () => ({
        async onInit() {
          events.push('cache:start');
          await sleep(10);
          events.push('cache:end');
        },
      }))
      .build();

    await c.preload();

    // If parallel, both start before either ends
    const dbStart = events.indexOf('db:start');
    const cacheStart = events.indexOf('cache:start');
    const dbEnd = events.indexOf('db:end');
    const cacheEnd = events.indexOf('cache:end');

    expect(Math.max(dbStart, cacheStart)).toBeLessThan(Math.min(dbEnd, cacheEnd));
  });

  it('respects topological order (deps before dependents)', async () => {
    const order: string[] = [];

    const c = container()
      .add('db', () => ({
        async onInit() {
          await sleep(5);
          order.push('db');
        },
      }))
      .add('userService', (c) => ({
        db: c.db,
        async onInit() {
          order.push('userService');
        },
      }))
      .build();

    await c.preload();
    expect(order).toEqual(['db', 'userService']);
  });

  it('parallelizes within levels, sequences between levels', async () => {
    const order: string[] = [];

    const c = container()
      .add('config', () => ({
        async onInit() {
          await sleep(5);
          order.push('config');
        },
      }))
      .add('db', (c) => ({
        config: c.config,
        async onInit() {
          await sleep(5);
          order.push('db');
        },
      }))
      .add('cache', (c) => ({
        config: c.config,
        async onInit() {
          await sleep(5);
          order.push('cache');
        },
      }))
      .add('api', (c) => ({
        db: c.db,
        cache: c.cache,
        async onInit() {
          order.push('api');
        },
      }))
      .build();

    await c.preload();

    // Level 0: config | Level 1: db, cache (parallel) | Level 2: api
    expect(order.indexOf('config')).toBe(0);
    expect(order.indexOf('api')).toBe(3);
    // db and cache are both at index 1 or 2
    expect(order.indexOf('db')).toBeGreaterThan(0);
    expect(order.indexOf('cache')).toBeGreaterThan(0);
    expect(order.indexOf('db')).toBeLessThan(3);
    expect(order.indexOf('cache')).toBeLessThan(3);
  });

  it('does not double-init: preload then lazy access', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        async onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    c.service; // lazy access after preload
    expect(initCount).toBe(1);
  });

  it('does not double-init: lazy access then preload', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    c.service; // lazy access first
    await c.preload('service'); // preload after
    expect(initCount).toBe(1);
  });

  it('reset clears init state — re-preload calls onInit again', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    expect(initCount).toBe(1);

    c.reset('service');
    await c.preload('service');
    expect(initCount).toBe(2);
  });

  it('dispose clears init state — re-preload calls onInit again', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    expect(initCount).toBe(1);

    await c.dispose();
    await c.preload('service');
    expect(initCount).toBe(2);
  });

  it('propagates onInit errors', async () => {
    const c = container()
      .add('db', () => ({
        async onInit() {
          throw new Error('connection failed');
        },
      }))
      .build();

    await expect(c.preload('db')).rejects.toThrow('connection failed');
  });

  it('initializes transitive deps', async () => {
    const inited: string[] = [];

    const c = container()
      .add('config', () => ({
        onInit() {
          inited.push('config');
        },
      }))
      .add('db', (c) => ({
        config: c.config,
        onInit() {
          inited.push('db');
        },
      }))
      .build();

    // Only request 'db', but 'config' is a transitive dep
    await c.preload('db');
    expect(inited).toContain('config');
    expect(inited).toContain('db');
  });

  it('second preload is a no-op', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload();
    await c.preload();
    expect(initCount).toBe(1);
  });

  it('handles deps without onInit in topo sort', async () => {
    const inited: string[] = [];

    const c = container()
      .add('config', () => ({ url: 'localhost' }))
      .add('db', (c) => ({
        config: c.config,
        onInit() {
          inited.push('db');
        },
      }))
      .build();

    await c.preload();
    expect(inited).toEqual(['db']);
  });

  it('preload on scoped container resolves parent deps transitively', async () => {
    const inited: string[] = [];

    const parent = container()
      .add('config', () => ({
        onInit() {
          inited.push('config');
        },
      }))
      .build();

    const child = parent.scope({
      service: (c) => ({
        config: c.config,
        onInit() {
          inited.push('service');
        },
      }),
    });

    await child.preload();
    expect(inited).toContain('service');
    expect(inited).toContain('config');
  });

  it('preload on empty container is a no-op', async () => {
    const c = container().build();
    // Should not throw
    await c.preload();
  });

  it('preload with transient deps', async () => {
    const inited: string[] = [];

    const c = container()
      .add('config', () => ({
        onInit() {
          inited.push('config');
        },
      }))
      .addTransient('id', () => Math.random())
      .build();

    await c.preload();
    expect(inited).toContain('config');
  });

  describe('error recovery', () => {
    it('onInit fires on lazy access after preload fails in resolve phase', async () => {
      let inited = false;

      const c = container()
        .add('bad', () => {
          throw new Error('factory boom');
        })
        .add('good', () => ({
          onInit() {
            inited = true;
          },
        }))
        .build();

      await expect(c.preload()).rejects.toThrow('factory boom');

      // deferOnInit must be reset via finally — onInit should still fire
      c.good;
      expect(inited).toBe(true);
    });

    it('retry preload calls onInit again for previously failed keys', async () => {
      let attempt = 0;

      const c = container()
        .add('db', () => ({
          async onInit() {
            attempt++;
            if (attempt === 1) throw new Error('connection refused');
          },
        }))
        .build();

      await expect(c.preload()).rejects.toThrow('connection refused');

      // Retry — should succeed now (initCalled not set for failed keys)
      await c.preload();
      expect(attempt).toBe(2);
    });

    it('preload collects all onInit errors as AggregateError', async () => {
      const c = container()
        .add('a', () => ({
          async onInit() {
            throw new Error('a failed');
          },
        }))
        .add('b', () => ({
          async onInit() {
            throw new Error('b failed');
          },
        }))
        .build();

      try {
        await c.preload();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toHaveLength(2);
      }
    });

    it('preload initializes healthy deps even when others fail', async () => {
      let goodInited = false;

      const c = container()
        .add('good', () => ({
          onInit() {
            goodInited = true;
          },
        }))
        .add('bad', () => ({
          async onInit() {
            throw new Error('boom');
          },
        }))
        .build();

      await expect(c.preload()).rejects.toThrow('boom');
      expect(goodInited).toBe(true);
    });

    it('onInit fires after preload caches then fails on a later key', async () => {
      let inited = false;

      const c = container()
        .add('good', () => ({
          onInit() {
            inited = true;
          },
        }))
        .add('bad', () => {
          throw new Error('factory boom');
        })
        .build();

      await expect(c.preload()).rejects.toThrow('factory boom');

      // good was cached during deferred phase, then evicted on failure
      // lazy access must re-resolve and fire onInit
      c.good;
      expect(inited).toBe(true);
    });

    it('does not evict pre-existing cache entries when resolve phase fails', async () => {
      let initCount = 0;

      const c = container()
        .add('pre', () => ({
          onInit() {
            initCount++;
          },
        }))
        .add('bad', () => {
          throw new Error('factory boom');
        })
        .build();

      c.pre; // lazy-resolve 'pre' before preload — it enters the cache
      expect(initCount).toBe(1);

      // preload fails on 'bad'; 'pre' was already cached before preload started
      // so the cleanup loop must NOT evict it (covers the false branch of !cacheKeysBefore.has)
      await expect(c.preload()).rejects.toThrow('factory boom');

      c.pre; // still cached — onInit must not fire again
      expect(initCount).toBe(1);
    });

    it('transient onInit fires after preload', async () => {
      let inited = false;

      const c = container()
        .addTransient('svc', () => ({
          onInit() {
            inited = true;
          },
        }))
        .build();

      await c.preload();

      // preload can't call onInit for transients (not in cache)
      // but lazy access must still fire it
      c.svc;
      expect(inited).toBe(true);
    });
  });
});
