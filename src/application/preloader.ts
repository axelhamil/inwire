import type { IResolver } from '../domain/types.js';

/**
 * Groups keys into topological levels using Kahn's algorithm (BFS).
 * Each level can be initialized in parallel; levels must run sequentially.
 */
export function topologicalLevels(depGraph: Map<string, string[]>, keys: Set<string>): string[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const key of keys) {
    inDegree.set(key, 0);
  }

  for (const key of keys) {
    const deps = depGraph.get(key) ?? [];
    for (const dep of deps) {
      if (keys.has(dep)) {
        inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
        const list = dependents.get(dep) ?? [];
        list.push(key);
        dependents.set(dep, list);
      }
    }
  }

  const levels: string[][] = [];
  let queue = [...keys].filter((k) => inDegree.get(k) === 0);

  while (queue.length > 0) {
    levels.push(queue);
    const next: string[] = [];
    for (const key of queue) {
      for (const dep of dependents.get(key) ?? []) {
        const d = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, d);
        if (d === 0) next.push(dep);
      }
    }
    queue = next;
  }

  const processedCount = levels.reduce((sum, l) => sum + l.length, 0);
  if (processedCount < keys.size) {
    const processedSet = new Set(levels.flat());
    const remaining = [...keys].filter((k) => !processedSet.has(k));
    throw new Error(
      `Incomplete topological sort: [${remaining.join(', ')}] could not be ordered. This may indicate a cycle in the dependency graph.`,
    );
  }

  return levels;
}

/**
 * Use Case: pre-resolve and initialize container dependencies in topological order.
 * Independent deps at the same depth level are initialized in parallel.
 */
export class Preloader {
  constructor(private readonly resolver: IResolver) {}

  async preload(...keys: string[]): Promise<void> {
    const toResolve = keys.length > 0 ? keys : [...this.resolver.getFactories().keys()];

    const cacheKeysBefore = new Set(this.resolver.getCache().keys());
    this.resolver.setDeferOnInit(true);
    try {
      for (const key of toResolve) {
        this.resolver.resolve(key);
      }
    } catch (error) {
      const cache = this.resolver.getCache();
      for (const key of cache.keys()) {
        if (!cacheKeysBefore.has(key)) cache.delete(key);
      }
      throw error;
    } finally {
      this.resolver.setDeferOnInit(false);
    }

    const depGraph = this.resolver.getDepGraph();
    const allKeys = new Set<string>();
    const collectDeps = (key: string) => {
      if (allKeys.has(key)) return;
      allKeys.add(key);
      for (const dep of depGraph.get(key) ?? []) {
        collectDeps(dep);
      }
    };
    for (const key of toResolve) {
      collectDeps(key);
    }

    const levels = topologicalLevels(depGraph, allKeys);
    const initErrors: unknown[] = [];
    for (const level of levels) {
      const results = await Promise.allSettled(level.map((k) => this.resolver.callOnInit(k)));
      for (const result of results) {
        if (result.status === 'rejected') initErrors.push(result.reason);
      }
    }
    if (initErrors.length === 1) throw initErrors[0];
    if (initErrors.length > 1) {
      throw new AggregateError(
        initErrors,
        `preload() encountered ${initErrors.length} onInit errors`,
      );
    }
  }
}
