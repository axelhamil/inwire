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
  constructor(private readonly resolver: IResolver) {}

  async dispose(): Promise<void> {
    const errors: unknown[] = [];

    // Shared across `extend()` siblings, which copy the cache and thus share instances.
    // Marked before the call so a throwing hook still never runs twice.
    const destroyed = this.resolver.getDestroyedInstances();

    for (const [key, instance] of this.teardownOrder()) {
      const teardown = this.teardownOf(key, instance);
      if (!teardown) continue;
      if (isReference(instance)) {
        if (destroyed.has(instance)) continue;
        destroyed.add(instance);
      }
      try {
        await teardown();
      } catch (error) {
        errors.push(error);
      }
    }

    this.resolver.getCache().clear();
    this.resolver.clearAllInitState();
    this.resolver.clearAllDepGraph();
    this.resolver.clearWarnings();

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `dispose() encountered ${errors.length} errors`);
    }
  }

  private teardownOrder(): [string, unknown][] {
    const cache = this.resolver.getCache();
    const entries = [...cache.entries()].reverse();
    for (const [key, factory] of this.resolver.getFactories()) {
      const eager = bindingMeta(factory)?.eager;
      if (eager && !cache.has(key)) entries.push([key, eager.value]);
    }
    return entries;
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
