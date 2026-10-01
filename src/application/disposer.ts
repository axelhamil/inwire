import { DisposeTimeoutError } from '../domain/errors.js';
import { hasOnDestroy } from '../domain/lifecycle.js';
import type { IResolver } from '../domain/types.js';
import { bindingMeta } from '../infrastructure/binding.js';

/**
 * Use Case: tear down every resolved instance in reverse resolution order, then the
 * eager instances that were never read (created at build time, so torn down last).
 * Runs the binding's `dispose` hook when declared, otherwise `onDestroy()`.
 * Collects errors, clears all state.
 */
export class Disposer {
  constructor(
    private readonly resolver: IResolver,
    private readonly timeout?: number,
  ) {}

  /**
   * Without keys, tears down the whole container. With keys, tears down only those
   * bindings and leaves the others usable. Either way, a disposed binding refuses
   * any later access with `ContainerDisposedError` instead of being recreated.
   */
  async dispose(...keys: string[]): Promise<void> {
    const errors: unknown[] = [];
    this.resolver.markDisposed(...keys);

    // Shared across `extend()` siblings, which copy the cache and thus share instances.
    // Marked before the call so a throwing hook still never runs twice.
    const destroyed = this.resolver.getDestroyedInstances();

    for (const [key, instance] of this.teardownOrder(keys)) {
      const teardown = this.teardownOf(key, instance);
      if (!teardown) continue;
      if (isReference(instance)) {
        if (destroyed.has(instance)) continue;
        destroyed.add(instance);
      }
      try {
        await this.settle(key, teardown);
      } catch (error) {
        errors.push(error);
      }
    }

    this.release(keys);

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `dispose() encountered ${errors.length} errors`);
    }
  }

  /** Awaits `teardown`, or gives up with a `DisposeTimeoutError` after `timeout` ms. */
  private async settle(key: string, teardown: () => unknown): Promise<void> {
    const timeout = this.timeout;
    if (timeout === undefined) {
      await teardown();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DisposeTimeoutError(key, timeout)), timeout);
    });
    try {
      await Promise.race([teardown(), expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  private teardownOrder(keys: string[]): [string, unknown][] {
    const cache = this.resolver.getCache();
    const entries = [...cache.entries()].reverse();
    for (const [key, factory] of this.resolver.getFactories()) {
      const eager = bindingMeta(factory)?.eager;
      if (eager && !cache.has(key)) entries.push([key, eager.value]);
    }
    return keys.length === 0 ? entries : entries.filter(([key]) => keys.includes(key));
  }

  private release(keys: string[]): void {
    if (keys.length === 0) {
      this.resolver.getCache().clear();
      this.resolver.clearAllInitState();
      this.resolver.clearAllDepGraph();
      this.resolver.clearWarnings();
      return;
    }
    for (const key of keys) this.resolver.getCache().delete(key);
    this.resolver.clearInitState(...keys);
    this.resolver.clearDepGraph(...keys);
    this.resolver.clearWarningsForKeys(...keys);
  }

  private teardownOf(key: string, instance: unknown): (() => unknown) | undefined {
    const hook = bindingMeta(this.resolver.getFactories().get(key))?.dispose;
    if (hook) return () => hook(instance);
    if (hasOnDestroy(instance)) return () => instance.onDestroy();
    return undefined;
  }
}

/** Values a `WeakSet` can hold: objects and functions (a stop function is an instance too). */
function isReference(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
