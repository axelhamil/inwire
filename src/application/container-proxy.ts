import type { Container, ScopeOptions } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import type { Resolver } from '../infrastructure/resolver.js';
import { Disposer } from './disposer.js';
import { Extender } from './extender.js';
import { Introspection } from './introspection.js';
import { Preloader } from './preloader.js';
import { Scoper } from './scoper.js';

const validator = new Validator();
const scoper = new Scoper(validator);
const extender = new Extender(validator);

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
): Container<Record<string, unknown>> {
  const introspection = new Introspection(resolver);
  const preloader = new Preloader(resolver);
  const disposer = new Disposer(resolver);

  const methods = {
    scope: (extra: Record<string, (c: unknown) => unknown>, options?: ScopeOptions) =>
      buildContainerProxy(scoper.scope(resolver, extra, options), builderFactory),

    extend: (extra: Record<string, (c: unknown) => unknown>) =>
      buildContainerProxy(extender.extend(resolver, extra), builderFactory),

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
          if (prop === Symbol.asyncDispose) {
            return () => disposer.dispose();
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
