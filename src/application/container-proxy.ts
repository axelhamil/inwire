import { hasOnDestroy } from '../domain/lifecycle.js';
import type { Container, Factory, ScopeOptions } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import { Resolver } from '../infrastructure/resolver.js';
import { Introspection } from './introspection.js';

const validator = new Validator();

/**
 * Groups keys into topological levels using Kahn's algorithm (BFS).
 * Each level can be initialized in parallel; levels must run sequentially.
 */
function topologicalLevels(depGraph: Map<string, string[]>, keys: Set<string>): string[][] {
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

  return levels;
}

/**
 * Builds the Proxy-based container from a Resolver.
 * Scope and extend are inlined here.
 * @internal
 */
export function buildContainerProxy(
  resolver: Resolver,
  builderFactory?: () => { _toRecord(): Record<string, (c: unknown) => unknown> },
): Container<Record<string, unknown>> {
  const introspection = new Introspection(resolver);
  const methods = {
    scope: (extra: Record<string, (c: unknown) => unknown>, options?: ScopeOptions) => {
      const childFactories = new Map<string, Factory>();
      for (const [key, factory] of Object.entries(extra)) {
        childFactories.set(key, factory as Factory);
      }
      const childResolver = new Resolver(childFactories, new Map(), resolver, options?.name);
      return buildContainerProxy(childResolver, builderFactory);
    },

    extend: (extra: Record<string, (c: unknown) => unknown>) => {
      validator.validateConfig(extra);
      const merged = new Map(resolver.getFactories());
      for (const [key, factory] of Object.entries(extra)) {
        merged.set(key, factory as Factory);
      }
      const newResolver = new Resolver(
        merged,
        new Map(resolver.getCache()),
        undefined,
        undefined,
        resolver.getInitCalled(),
      );
      return buildContainerProxy(newResolver, builderFactory);
    },

    module: (fn: (b: unknown) => unknown) => {
      if (!builderFactory) throw new Error('module() is not available');
      const builder = builderFactory();
      const result = fn(builder) as { _toRecord(): Record<string, (c: unknown) => unknown> };
      return methods.extend(result._toRecord());
    },

    preload: async (...keys: string[]) => {
      const toResolve = keys.length > 0 ? keys : [...resolver.getFactories().keys()];

      resolver.setDeferOnInit(true);
      for (const key of toResolve) {
        resolver.resolve(key);
      }
      resolver.setDeferOnInit(false);

      const depGraph = resolver.getDepGraph();
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
      for (const level of levels) {
        await Promise.all(level.map((k) => resolver.callOnInit(k)));
      }
    },

    reset: (...keys: string[]) => {
      const cache = resolver.getCache();
      for (const key of keys) {
        cache.delete(key);
      }
      resolver.clearInitState(...keys);
    },

    inspect: () => introspection.inspect(),
    describe: (key: string) => introspection.describe(key),
    health: () => introspection.health(),
    toString: () => introspection.toString(),

    dispose: async () => {
      const cache = resolver.getCache();
      const entries = [...cache.entries()].reverse();
      for (const [, instance] of entries) {
        if (hasOnDestroy(instance)) {
          await instance.onDestroy();
        }
      }
      cache.clear();
      resolver.clearAllInitState();
    },
  };

  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') {
          if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) {
            return () => introspection.toString();
          }
          return undefined;
        }

        const key = prop;

        if (key in methods) {
          return methods[key as keyof typeof methods];
        }

        return resolver.resolve(key);
      },

      has(_target, prop) {
        if (typeof prop === 'symbol') return false;
        const key = prop;
        return (
          key in methods ||
          resolver.getFactories().has(key) ||
          resolver.getAllRegisteredKeys().includes(key)
        );
      },

      ownKeys() {
        return [...resolver.getAllRegisteredKeys(), ...Object.keys(methods)];
      },

      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        const key = prop;
        if (
          key in methods ||
          resolver.getFactories().has(key) ||
          resolver.getAllRegisteredKeys().includes(key)
        ) {
          return {
            configurable: true,
            enumerable: !(key in methods),
            writable: false,
          };
        }
        return undefined;
      },
    },
  );

  return proxy as Container<Record<string, unknown>>;
}
