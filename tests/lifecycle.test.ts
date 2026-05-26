import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

describe('lifecycle', () => {
  it('calls onInit when a dependency is first resolved', () => {
    let initialized = false;

    const c = container()
      .add('service', () => ({
        value: 42,
        onInit() {
          initialized = true;
        },
      }))
      .build();

    expect(initialized).toBe(false);
    c.service;
    expect(initialized).toBe(true);
  });

  it('calls onDestroy on dispose for all resolved instances', async () => {
    const destroyed: string[] = [];

    const c = container()
      .add('db', () => ({
        onDestroy() {
          destroyed.push('db');
        },
      }))
      .add('cache', () => ({
        onDestroy() {
          destroyed.push('cache');
        },
      }))
      .add('unused', () => ({
        onDestroy() {
          destroyed.push('unused');
        },
      }))
      .build();

    // Only resolve db and cache
    c.db;
    c.cache;

    await c.dispose();

    expect(destroyed).toContain('db');
    expect(destroyed).toContain('cache');
    expect(destroyed).not.toContain('unused');
  });

  it('disposes in reverse resolution order', async () => {
    const order: string[] = [];

    const c = container()
      .add('first', () => ({
        onDestroy() {
          order.push('first');
        },
      }))
      .add('second', () => ({
        onDestroy() {
          order.push('second');
        },
      }))
      .add('third', () => ({
        onDestroy() {
          order.push('third');
        },
      }))
      .build();

    c.first;
    c.second;
    c.third;

    await c.dispose();

    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('handles async onInit', () => {
    const c = container()
      .add('db', () => ({
        async onInit() {
          await new Promise((r) => setTimeout(r, 1));
        },
      }))
      .build();

    // Lazy resolution — onInit fires but since it's async it runs in background
    c.db;
    // We can't guarantee connected=true here without await
    // preload() is the way to await async init
  });

  it('preload resolves dependencies eagerly', async () => {
    let initialized = false;

    const c = container()
      .add('service', () => {
        initialized = true;
        return { value: 'ready' };
      })
      .build();

    expect(initialized).toBe(false);
    await c.preload('service');
    expect(initialized).toBe(true);
  });

  it('preload without args resolves all deps', async () => {
    const resolved: string[] = [];

    const c = container()
      .add('db', () => {
        resolved.push('db');
        return 'db';
      })
      .add('cache', () => {
        resolved.push('cache');
        return 'cache';
      })
      .add('logger', () => {
        resolved.push('logger');
        return 'logger';
      })
      .build();

    expect(resolved).toEqual([]);
    await c.preload();
    expect(resolved).toEqual(['db', 'cache', 'logger']);
  });

  it('preload without args calls onInit on all services', async () => {
    const inited: string[] = [];

    const c = container()
      .add('db', () => ({
        onInit() {
          inited.push('db');
        },
      }))
      .add('cache', () => ({
        onInit() {
          inited.push('cache');
        },
      }))
      .build();

    await c.preload();
    expect(inited).toContain('db');
    expect(inited).toContain('cache');
  });

  it('async onInit errors are collected as warnings (fire-and-forget)', async () => {
    const c = container()
      .add('failing', () => ({
        value: 'ok',
        async onInit() {
          throw new Error('init failed!');
        },
      }))
      .build();

    // Should not throw — async error is collected, not thrown
    const instance = c.failing;
    expect(instance.value).toBe('ok');

    // Flush the microtask queue so the catch handler runs
    await Promise.resolve();

    // The error is now visible via health()
    const health = c.health();
    expect(health.warnings.length).toBe(1);
    expect(health.warnings[0].type).toBe('async_init_error');
    expect(health.warnings[0].message).toContain('init failed!');
  });

  it('dispose clears async init warnings', async () => {
    const c = container()
      .add('failing', () => ({
        async onInit() {
          throw new Error('boom');
        },
      }))
      .build();

    c.failing;
    await Promise.resolve();
    expect(c.health().warnings.length).toBe(1);

    await c.dispose();
    expect(c.health().warnings.length).toBe(0);
  });

  it('preload surfaces async onInit errors', async () => {
    const c = container()
      .add('db', () => ({
        async onInit() {
          throw new Error('connection refused');
        },
      }))
      .build();

    // preload now awaits onInit — async errors propagate
    await expect(c.preload('db')).rejects.toThrow('connection refused');
  });

  it('dispose clears cache — re-access calls factory again', async () => {
    let callCount = 0;

    const c = container()
      .add('service', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    expect(c.service.id).toBe(1);
    expect(c.service.id).toBe(1); // cached

    await c.dispose();

    // After dispose, cache is cleared — factory runs again
    expect(c.service.id).toBe(2);
    expect(callCount).toBe(2);
  });

  it('dispose calls async onDestroy and awaits it', async () => {
    let destroyed = false;

    const c = container()
      .add('service', () => ({
        async onDestroy() {
          await new Promise((r) => setTimeout(r, 5));
          destroyed = true;
        },
      }))
      .build();

    c.service;
    await c.dispose();

    expect(destroyed).toBe(true);
  });

  it('handles instances without lifecycle methods', async () => {
    const c = container()
      .add('plain', () => 'just a string')
      .add('number', () => 42)
      .build();

    c.plain;
    c.number;

    // Should not throw
    await c.dispose();
  });

  describe('lifecycle + scopes', () => {
    it('onInit fires in a scoped container', () => {
      let initialized = false;

      const parent = container()
        .add('db', () => 'postgres')
        .build();

      const child = parent.scope({
        service: () => ({
          onInit() {
            initialized = true;
          },
        }),
      });

      expect(initialized).toBe(false);
      child.service;
      expect(initialized).toBe(true);
    });

    it('onDestroy on child does not affect parent instances', async () => {
      let parentDestroyed = false;
      let childDestroyed = false;

      const parent = container()
        .add('parentSvc', () => ({
          onDestroy() {
            parentDestroyed = true;
          },
        }))
        .build();

      parent.parentSvc;

      const child = parent.scope({
        childSvc: () => ({
          onDestroy() {
            childDestroyed = true;
          },
        }),
      });

      child.childSvc;
      await child.dispose();

      expect(childDestroyed).toBe(true);
      expect(parentDestroyed).toBe(false);
    });

    it('preload on scoped container resolves parent deps', async () => {
      const inited: string[] = [];

      const parent = container()
        .add('db', () => ({
          onInit() {
            inited.push('db');
          },
        }))
        .build();

      const child = parent.scope({
        service: (c) => ({
          db: c.db,
          onInit() {
            inited.push('service');
          },
        }),
      });

      await child.preload();
      expect(inited).toContain('service');
    });

    it('reset in scope then re-access triggers onInit again', () => {
      let initCount = 0;

      const parent = container()
        .add('db', () => 'pg')
        .build();

      const child = parent.scope({
        service: () => ({
          onInit() {
            initCount++;
          },
        }),
      });

      child.service;
      expect(initCount).toBe(1);

      child.reset('service');
      child.service;
      expect(initCount).toBe(2);
    });
  });

  describe('Symbol.asyncDispose (ES2023 await using)', () => {
    it('dispose() is invoked via Symbol.asyncDispose', async () => {
      const destroyed: string[] = [];
      const c = container()
        .add('db', () => ({
          onDestroy() {
            destroyed.push('db');
          },
        }))
        .build();

      c.db;
      await c[Symbol.asyncDispose]();

      expect(destroyed).toEqual(['db']);
    });

    it('supports `await using` for automatic disposal', async () => {
      const destroyed: string[] = [];

      const run = async () => {
        await using request = container()
          .add('handler', () => ({
            onDestroy() {
              destroyed.push('handler');
            },
          }))
          .build();
        request.handler;
      };

      await run();
      expect(destroyed).toEqual(['handler']);
    });
  });

  describe('dispose idempotency', () => {
    it('double dispose is safe (onDestroy called once)', async () => {
      let destroyCount = 0;

      const c = container()
        .add('service', () => ({
          onDestroy() {
            destroyCount++;
          },
        }))
        .build();

      c.service;
      await c.dispose();
      await c.dispose();

      expect(destroyCount).toBe(1);
    });

    it('access after dispose creates fresh instances', async () => {
      let callCount = 0;

      const c = container()
        .add('service', () => ({ id: ++callCount }))
        .build();

      expect(c.service.id).toBe(1);
      await c.dispose();
      expect(c.service.id).toBe(2);
    });

    it('preload after dispose re-initializes', async () => {
      let initCount = 0;

      const c = container()
        .add('service', () => ({
          onInit() {
            initCount++;
          },
        }))
        .build();

      await c.preload();
      expect(initCount).toBe(1);

      await c.dispose();
      await c.preload();
      expect(initCount).toBe(2);
    });
  });

  describe('dispose resilience', () => {
    it('continues cleanup when one onDestroy throws', async () => {
      const destroyed: string[] = [];

      const c = container()
        .add('first', () => ({
          onDestroy() {
            destroyed.push('first');
          },
        }))
        .add('failing', () => ({
          onDestroy() {
            throw new Error('destroy failed');
          },
        }))
        .add('last', () => ({
          onDestroy() {
            destroyed.push('last');
          },
        }))
        .build();

      c.first;
      c.failing;
      c.last;

      await expect(c.dispose()).rejects.toThrow('destroy failed');

      // All other destructors ran despite the error
      expect(destroyed).toContain('first');
      expect(destroyed).toContain('last');
    });

    it('throws AggregateError when multiple onDestroy fail', async () => {
      const c = container()
        .add('a', () => ({
          onDestroy() {
            throw new Error('a failed');
          },
        }))
        .add('b', () => ({
          onDestroy() {
            throw new Error('b failed');
          },
        }))
        .build();

      c.a;
      c.b;

      try {
        await c.dispose();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toHaveLength(2);
      }
    });

    it('clears cache and state even when onDestroy throws', async () => {
      let callCount = 0;

      const c = container()
        .add('service', () => {
          callCount++;
          return {
            id: callCount,
            onDestroy() {
              throw new Error('boom');
            },
          };
        })
        .build();

      expect(c.service.id).toBe(1);

      try {
        await c.dispose();
      } catch {
        // expected
      }

      // Cache was cleared despite the error — factory runs again
      expect(c.service.id).toBe(2);
    });
  });

  describe('partial reset warnings', () => {
    it('reset(key) clears async_init_error warnings for that key', async () => {
      const c = container()
        .add('failing', () => ({
          value: 'ok',
          async onInit() {
            throw new Error('init boom');
          },
        }))
        .add('ok', () => ({ value: 1 }))
        .build();

      c.failing;
      await Promise.resolve();

      expect(c.health().warnings.length).toBe(1);
      expect(c.health().warnings[0].type).toBe('async_init_error');

      c.reset('failing');
      expect(c.health().warnings.length).toBe(0);
    });

    it('reset(key) preserves warnings for other keys', async () => {
      const c = container()
        .add('fail1', () => ({
          async onInit() {
            throw new Error('fail1');
          },
        }))
        .add('fail2', () => ({
          async onInit() {
            throw new Error('fail2');
          },
        }))
        .build();

      c.fail1;
      c.fail2;
      await Promise.resolve();

      expect(c.health().warnings.length).toBe(2);

      c.reset('fail1');
      expect(c.health().warnings.length).toBe(1);
      expect(c.health().warnings[0].message).toContain('fail2');
    });
  });
});
