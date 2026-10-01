import { describe, expect, it, vi } from 'vitest';
import { ContainerError, container, DisposeTimeoutError } from '../src/index.js';

const never = () => new Promise<void>(() => {});

describe('disposeTimeout', () => {
  it('gives up on a hook that never settles and keeps tearing down the others', async () => {
    const end = vi.fn();
    const app = container({ disposeTimeout: 10 })
      .add('pool', () => ({ end }), { dispose: (p) => p.end() })
      .add('stuck', () => ({ onDestroy: never }))
      .build();
    void app.pool;
    void app.stuck;

    const error = await app.dispose().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DisposeTimeoutError);
    expect(error).toBeInstanceOf(ContainerError);
    expect((error as DisposeTimeoutError).details).toEqual({ key: 'stuck', timeout: 10 });
    expect((error as DisposeTimeoutError).hint).toContain('disposeTimeout');
    expect(end).toHaveBeenCalledOnce();
  });

  it('applies to scopes, extensions and modules built from the container', async () => {
    const app = container({ disposeTimeout: 10 }).build();
    const scoped = app.scope({ stuck: () => ({ onDestroy: never }) });
    const extended = app.extend({ stuck: () => ({ onDestroy: never }) });
    const moduled = app.module((b) => b.add('stuck', () => ({ onDestroy: never })));

    for (const c of [scoped, extended, moduled]) {
      void c.stuck;
      await expect(c.dispose()).rejects.toBeInstanceOf(DisposeTimeoutError);
    }
  });

  it('lets a hook that settles in time finish normally', async () => {
    const app = container({ disposeTimeout: 1000 })
      .add('fast', () => ({ onDestroy: async () => {} }))
      .build();
    void app.fast;

    await expect(app.dispose()).resolves.toBeUndefined();
  });

  it('waits for every hook when no timeout is set', async () => {
    let settled = false;
    const app = container()
      .add('slow', () => ({
        onDestroy: () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              settled = true;
              resolve();
            }, 20),
          ),
      }))
      .build();
    void app.slow;

    await app.dispose();

    expect(settled).toBe(true);
  });
});
