import type { Container, IValidator, ScopeOptions } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import type { Resolver } from '../infrastructure/resolver.js';
import { Disposer } from './disposer.js';
import { Extender } from './extender.js';
import { Introspection } from './introspection.js';
import { Preloader } from './preloader.js';
import { Scoper } from './scoper.js';

const defaultValidator = new Validator();

/**
 * Wraps a {@link Resolver} in the user-facing ES Proxy:
 * - Property access → lazy resolution via `resolver.resolve(key)`.
 * - Method names (`.scope`, `.extend`, `.module`, `.preload`, `.reset`,
 *   `.inspect`, `.describe`, `.health`, `.dispose`, `Symbol.asyncDispose`)
 *   → dispatched to the appropriate use case class.
 *
 * Resolver creation for `.scope()` / `.extend()` is delegated to
 * {@link Scoper} / {@link Extender} (their own composition roots).
 *
 * @internal
 */
export function buildContainerProxy(
  resolver: Resolver,
  builderFactory?: () => { _toRecord(): Record<string, (c: unknown) => unknown> },
  validator: IValidator = defaultValidator,
): Container<Record<string, unknown>> {
  const introspection = new Introspection(resolver);
  const preloader = new Preloader(resolver);
  const disposer = new Disposer(resolver);
  const scoper = new Scoper(validator);
  const extender = new Extender(validator);

  const methods = {
    scope: (extra: Record<string, (c: unknown) => unknown>, options?: ScopeOptions) =>
      buildContainerProxy(scoper.scope(resolver, extra, options), builderFactory, validator),

    extend: (extra: Record<string, (c: unknown) => unknown>) =>
      buildContainerProxy(extender.extend(resolver, extra), builderFactory, validator),

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
    toJSON: (): Record<string, unknown> => Object.fromEntries(resolver.getCache()),

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
          if (prop === Symbol.asyncDispose) {
            return () => disposer.dispose();
          }
          if (prop === Symbol.iterator) {
            return function* () {
              for (const key of resolver.getFactories().keys()) {
                yield [key, resolver.resolve(key)] as [string, unknown];
              }
            };
          }
          return undefined;
        }

        const key = prop;

        if (key === 'size') {
          return resolver.getFactories().size;
        }

        if (key in methods) {
          return methods[key as keyof typeof methods];
        }

        return resolver.resolve(key);
      },

      // `in` mirrors resolution, which walks the parent chain — unlike the own-key
      // traps below, which report this container's own bindings (prototype-like split).
      has(_target, prop) {
        if (typeof prop === 'symbol') {
          return (
            prop === Symbol.asyncDispose ||
            prop === Symbol.iterator ||
            prop === Symbol.toPrimitive ||
            prop === Symbol.toStringTag
          );
        }
        const key = prop;
        return key === 'size' || key in methods || resolver.getAllRegisteredKeys().includes(key);
      },

      ownKeys() {
        return [...resolver.getFactories().keys(), ...Object.keys(methods), 'size'];
      },

      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        const key = prop;
        if (key === 'size') {
          return { configurable: true, enumerable: false, writable: false };
        }
        if (key in methods) {
          return { configurable: true, enumerable: false, writable: false };
        }
        if (resolver.getFactories().has(key)) {
          // Accessor descriptor: reading `.value` would force eager resolution and
          // break laziness, so the getter defers it to the caller.
          return {
            configurable: true,
            enumerable: true,
            get: () => resolver.resolve(key),
          };
        }
        return undefined;
      },
    },
  );

  return proxy as Container<Record<string, unknown>>;
}
