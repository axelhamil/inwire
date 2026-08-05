import { describe, expect, it, vi } from 'vitest';
import { Disposer } from '../src/application/disposer.js';
import type { IResolver } from '../src/domain/types.js';

function createMockResolver(
  cache: Map<string, unknown>,
  destroyed: WeakSet<object> = new WeakSet(),
): IResolver {
  return {
    getCache: () => cache,
    getDestroyedInstances: () => destroyed,
    clearAllInitState: vi.fn(),
    clearAllDepGraph: vi.fn(),
    clearWarnings: vi.fn(),
    // Unused methods — stub them out
    resolve: vi.fn(),
    isResolved: vi.fn(),
    getFactories: vi.fn(),
    getDepGraph: vi.fn(),
    getResolvedKeys: vi.fn(),
    getWarnings: vi.fn(),
    getAllRegisteredKeys: vi.fn(),
    getName: vi.fn(),
    setDeferOnInit: vi.fn(),
    callOnInit: vi.fn(),
    getInitCalled: vi.fn(),
    clearInitState: vi.fn(),
    clearWarningsForKeys: vi.fn(),
    clearDepGraph: vi.fn(),
  } as unknown as IResolver;
}

describe('Disposer', () => {
  it('calls onDestroy in reverse resolution order', async () => {
    const order: string[] = [];
    const cache = new Map<string, unknown>([
      [
        'first',
        {
          onDestroy: () => {
            order.push('first');
          },
        },
      ],
      [
        'second',
        {
          onDestroy: () => {
            order.push('second');
          },
        },
      ],
      [
        'third',
        {
          onDestroy: () => {
            order.push('third');
          },
        },
      ],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await disposer.dispose();

    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('continues on error and throws AggregateError', async () => {
    const cache = new Map<string, unknown>([
      [
        'a',
        {
          onDestroy: () => {
            throw new Error('fail-a');
          },
        },
      ],
      [
        'b',
        {
          onDestroy: () => {
            /* ok */
          },
        },
      ],
      [
        'c',
        {
          onDestroy: () => {
            throw new Error('fail-c');
          },
        },
      ],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await expect(disposer.dispose()).rejects.toThrow(AggregateError);
  });

  it('throws single error directly (not AggregateError)', async () => {
    const cache = new Map<string, unknown>([
      [
        'a',
        {
          onDestroy: () => {
            throw new Error('single-fail');
          },
        },
      ],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await expect(disposer.dispose()).rejects.toThrow('single-fail');
  });

  it('clears all state after dispose', async () => {
    const cache = new Map<string, unknown>([['a', {}]]);
    const resolver = createMockResolver(cache);

    const disposer = new Disposer(resolver);
    await disposer.dispose();

    expect(cache.size).toBe(0);
    expect(resolver.clearAllInitState).toHaveBeenCalled();
    expect(resolver.clearAllDepGraph).toHaveBeenCalled();
    expect(resolver.clearWarnings).toHaveBeenCalled();
  });

  it('skips instances without onDestroy', async () => {
    const cache = new Map<string, unknown>([
      ['plain', { value: 42 }],
      ['destroyable', { onDestroy: vi.fn() }],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await disposer.dispose(); // should not throw
  });

  it('skips instances already present in the destroyed set', async () => {
    const destroyed = new WeakSet<object>();
    const instance = { onDestroy: vi.fn() };
    destroyed.add(instance);

    const cache = new Map<string, unknown>([['svc', instance]]);
    const disposer = new Disposer(createMockResolver(cache, destroyed));
    await disposer.dispose();

    expect(instance.onDestroy).not.toHaveBeenCalled();
  });

  it('adds instance to the destroyed set before calling onDestroy', async () => {
    const destroyed = new WeakSet<object>();
    let wasInSetDuringCall = false;
    const instance = {
      onDestroy: vi.fn(() => {
        wasInSetDuringCall = destroyed.has(instance);
      }),
    };

    const cache = new Map<string, unknown>([['svc', instance]]);
    const disposer = new Disposer(createMockResolver(cache, destroyed));
    await disposer.dispose();

    expect(wasInSetDuringCall).toBe(true);
    expect(instance.onDestroy).toHaveBeenCalledOnce();
  });

  it('two disposers sharing a destroyed set run onDestroy once', async () => {
    const destroyed = new WeakSet<object>();
    const instance = { onDestroy: vi.fn() };

    const first = new Disposer(createMockResolver(new Map([['svc', instance]]), destroyed));
    const second = new Disposer(createMockResolver(new Map([['svc', instance]]), destroyed));

    await first.dispose();
    await second.dispose();

    expect(instance.onDestroy).toHaveBeenCalledOnce();
  });

  it('a throwing onDestroy is still not retried by a sibling disposer', async () => {
    const destroyed = new WeakSet<object>();
    const instance = {
      onDestroy: vi.fn(() => {
        throw new Error('boom');
      }),
    };

    const first = new Disposer(createMockResolver(new Map([['svc', instance]]), destroyed));
    const second = new Disposer(createMockResolver(new Map([['svc', instance]]), destroyed));

    await expect(first.dispose()).rejects.toThrow('boom');
    await expect(second.dispose()).resolves.toBeUndefined();
    expect(instance.onDestroy).toHaveBeenCalledOnce();
  });
});
