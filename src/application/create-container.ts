import type { Container, DepsDefinition, Factory, ResolvedDeps } from '../domain/types.js';
import { hasOnDestroy } from '../domain/lifecycle.js';
import { Validator } from '../domain/validation.js';
import { Resolver } from '../infrastructure/proxy-handler.js';
import { Introspection } from './introspection.js';
import { createScope } from './scope.js';

const validator = new Validator();

/**
 * Creates a dependency injection container from an object of factory functions.
 * Each factory receives the container and returns an instance.
 * Dependencies are resolved lazily and cached as singletons by default.
 *
 * @example
 * ```typescript
 * const container = createContainer({
 *   logger: () => new LoggerService(),
 *   db: () => new Database(process.env.DB_URL!),
 *   userRepo: (c): UserRepository => new PgUserRepo(c.db),
 *   userService: (c) => new UserService(c.userRepo, c.logger),
 * });
 *
 * container.userService; // type: UserService — lazy, singleton, fully resolved
 * ```
 */
export function createContainer<T extends DepsDefinition>(
  defs: T,
): Container<ResolvedDeps<T>> {
  // Validate config
  validator.validateConfig(defs);

  // Build factories map
  const factories = new Map<string, Factory>();
  for (const [key, factory] of Object.entries(defs)) {
    factories.set(key, factory as Factory);
  }

  // Detect duplicate keys (warn, don't throw)
  // This is useful when spreading multiple modules
  // We check by looking at the property descriptor — if a key was overwritten
  // during spread, JS already picked the last one. We can't detect this post-spread,
  // so the user needs to use detectDuplicateKeys() explicitly or we warn at a higher level.

  const resolver = new Resolver(factories);
  return buildContainerProxy(resolver) as Container<ResolvedDeps<T>>;
}

/**
 * Builds the Proxy-based container from a Resolver.
 * Used by both `createContainer` and `createScope`.
 * @internal
 */
export function buildContainerProxy(resolver: Resolver): Container<any> {
  const introspection = new Introspection(resolver);
  const methods: Record<string, Function> = {
    scope: (extra: DepsDefinition) => createScope(resolver, extra),

    extend: (extra: DepsDefinition) => {
      validator.validateConfig(extra);
      const merged = new Map(resolver.getFactories());
      for (const [key, factory] of Object.entries(extra)) {
        merged.set(key, factory as Factory);
      }
      // Share existing cache (singletons already resolved)
      const newResolver = new Resolver(merged, new Map(resolver.getCache()));
      return buildContainerProxy(newResolver);
    },

    preload: async (...keys: string[]) => {
      for (const key of keys) {
        resolver.resolve(key);
      }
    },

    inspect: () => introspection.inspect(),
    describe: (key: string) => introspection.describe(key),
    health: () => introspection.health(),
    toString: () => introspection.toString(),

    dispose: async () => {
      const cache = resolver.getCache();
      // Dispose in reverse order of resolution (LIFO)
      const entries = [...cache.entries()].reverse();
      for (const [, instance] of entries) {
        if (hasOnDestroy(instance)) {
          await instance.onDestroy();
        }
      }
      cache.clear();
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

        const key = prop as string;

        // Container methods
        if (key in methods) {
          return methods[key];
        }

        // Dependency resolution
        return resolver.resolve(key);
      },

      has(_target, prop) {
        if (typeof prop === 'symbol') return false;
        const key = prop as string;
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
        const key = prop as string;
        if (
          key in methods ||
          resolver.getFactories().has(key) ||
          resolver.getAllRegisteredKeys().includes(key)
        ) {
          return {
            configurable: true,
            enumerable: key in methods ? false : true,
            writable: false,
          };
        }
        return undefined;
      },
    },
  );

  return proxy as Container<any>;
}
