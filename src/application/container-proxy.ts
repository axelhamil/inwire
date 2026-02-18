import type { Container, Factory, ScopeOptions } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import { CycleDetector } from '../infrastructure/cycle-detector.js';
import { DependencyTracker } from '../infrastructure/dependency-tracker.js';
import { Resolver } from '../infrastructure/resolver.js';
import { Disposer } from './disposer.js';
import { Introspection } from './introspection.js';
import { Preloader } from './preloader.js';

const validator = new Validator();

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
  const preloader = new Preloader(resolver);
  const disposer = new Disposer(resolver);
  const methods = {
    /**
     * Creates a child container with a parent-child chain.
     * - Child gets its own cache; parent singletons are reused on cache miss (lookup walks up).
     * - Overriding a key shadows the parent — the parent's cached instance is untouched.
     * - Ideal for per-request / per-job isolation (e.g. requestId, traceId).
     */
    scope: (extra: Record<string, (c: unknown) => unknown>, options?: ScopeOptions) => {
      validator.validateConfig(extra);
      const childFactories = new Map<string, Factory>();
      for (const [key, factory] of Object.entries(extra)) {
        childFactories.set(key, factory as Factory);
      }
      const childResolver = new Resolver({
        factories: childFactories,
        parent: resolver,
        name: options?.name,
        cycleDetector: new CycleDetector(),
        dependencyTracker: new DependencyTracker(),
      });
      return buildContainerProxy(childResolver, builderFactory);
    },

    /**
     * Returns a new flat container with merged factories.
     * - Existing singleton cache is snapshot-copied (shared instances, no parent chain).
     * - New keys are added; duplicate keys override the original factory.
     * - Ideal for plugins, feature modules, or test overrides.
     */
    extend: (extra: Record<string, (c: unknown) => unknown>) => {
      validator.validateConfig(extra);
      const merged = new Map(resolver.getFactories());
      for (const [key, factory] of Object.entries(extra)) {
        merged.set(key, factory as Factory);
      }
      const newResolver = new Resolver({
        factories: merged,
        cache: new Map(resolver.getCache()),
        initCalled: resolver.getInitCalled(),
        cycleDetector: new CycleDetector(),
        dependencyTracker: new DependencyTracker(),
      });
      return buildContainerProxy(newResolver, builderFactory);
    },

    module: (fn: (b: unknown) => unknown) => {
      if (!builderFactory) throw new Error('module() is not available');
      const builder = builderFactory();
      const result = fn(builder) as { _toRecord(): Record<string, (c: unknown) => unknown> };
      return methods.extend(result._toRecord());
    },

    preload: (...keys: string[]) => preloader.preload(...keys),

    reset: (...keys: string[]) => {
      const cache = resolver.getCache();
      if (keys.length === 0) {
        cache.clear();
        resolver.clearAllInitState();
        resolver.clearAllDepGraph();
        resolver.clearWarnings();
      } else {
        for (const key of keys) cache.delete(key);
        resolver.clearInitState(...keys);
        resolver.clearDepGraph(...keys);
        resolver.clearWarningsForKeys(...keys);
      }
    },

    inspect: () => introspection.inspect(),
    describe: (key: string) => introspection.describe(key),
    health: () => introspection.health(),
    toString: () => introspection.toString(),

    dispose: () => disposer.dispose(),
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
