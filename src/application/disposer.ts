import { hasOnDestroy } from '../domain/lifecycle.js';
import type { IResolver } from '../domain/types.js';

/**
 * Use Case: dispose all resolved instances in reverse resolution order.
 * Calls onDestroy() on each, collects errors, clears all state.
 */
export class Disposer {
  constructor(private readonly resolver: IResolver) {}

  async dispose(): Promise<void> {
    const cache = this.resolver.getCache();
    const entries = [...cache.entries()].reverse();
    const errors: unknown[] = [];

    // Shared across `extend()` siblings, which copy the cache and thus share instances.
    // Marked before the call so a throwing `onDestroy()` still never runs twice.
    const destroyed = this.resolver.getDestroyedInstances();

    for (const [, instance] of entries) {
      if (!hasOnDestroy(instance)) continue;
      if (destroyed.has(instance)) continue;
      destroyed.add(instance);
      try {
        await instance.onDestroy();
      } catch (error) {
        errors.push(error);
      }
    }

    cache.clear();
    this.resolver.clearAllInitState();
    this.resolver.clearAllDepGraph();
    this.resolver.clearWarnings();

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `dispose() encountered ${errors.length} errors`);
    }
  }
}
