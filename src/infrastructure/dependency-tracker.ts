import type { IDependencyTracker } from '../domain/types.js';

/**
 * Tracks dependencies accessed by each factory via a Proxy.
 * Builds the dependency graph automatically from runtime access patterns.
 */
export class DependencyTracker implements IDependencyTracker {
  private readonly depGraph = new Map<string, string[]>();

  /**
   * Creates a Proxy that records every property access into `deps`
   * and delegates resolution to the provided `resolve` callback.
   */
  createTrackingProxy(
    deps: string[],
    chain: string[],
    resolve: (key: string, chain: string[]) => unknown,
  ): unknown {
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop === 'symbol') return undefined;
          const depKey = prop as string;
          deps.push(depKey);
          return resolve(depKey, chain);
        },
      },
    );
  }

  getDepGraph(): Map<string, string[]> {
    return new Map(this.depGraph);
  }

  recordDeps(key: string, deps: string[]): void {
    this.depGraph.set(key, deps);
  }

  clearDepGraph(...keys: string[]): void {
    for (const key of keys) this.depGraph.delete(key);
  }

  clearAllDepGraph(): void {
    this.depGraph.clear();
  }
}
