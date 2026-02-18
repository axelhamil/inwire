import { describe, expect, it, vi } from 'vitest';
import { Disposer } from '../src/application/disposer.js';
import type { IResolver } from '../src/domain/types.js';

function createMockResolver(cache: Map<string, unknown>): IResolver {
  return {
    getCache: () => cache,
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
      ['first', { onDestroy: () => { order.push('first'); } }],
      ['second', { onDestroy: () => { order.push('second'); } }],
      ['third', { onDestroy: () => { order.push('third'); } }],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await disposer.dispose();

    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('continues on error and throws AggregateError', async () => {
    const cache = new Map<string, unknown>([
      ['a', { onDestroy: () => { throw new Error('fail-a'); } }],
      ['b', { onDestroy: () => { /* ok */ } }],
      ['c', { onDestroy: () => { throw new Error('fail-c'); } }],
    ]);

    const disposer = new Disposer(createMockResolver(cache));
    await expect(disposer.dispose()).rejects.toThrow(AggregateError);
  });

  it('throws single error directly (not AggregateError)', async () => {
    const cache = new Map<string, unknown>([
      ['a', { onDestroy: () => { throw new Error('single-fail'); } }],
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
});
