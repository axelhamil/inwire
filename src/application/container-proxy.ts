import type { Container, Factory, ScopeOptions } from '../domain/types.js';
import { hasOnDestroy } from '../domain/lifecycle.js';
import { Validator } from '../domain/validation.js';
import { Resolver } from '../infrastructure/resolver.js';
import { Introspection } from './introspection.js';

const validator = new Validator();

/**
 * Builds the Proxy-based container from a Resolver.
 * Scope and extend are inlined here.
 * @internal
 */
export function buildContainerProxy(
  resolver: Resolver,
  builderFactory?: () => { _toRecord(): Record<string, (c: any) => any> },
): Container<any> {
  const introspection = new Introspection(resolver);
  const methods = {
    scope: (extra: Record<string, (c: any) => any>, options?: ScopeOptions) => {
      const childFactories = new Map<string, Factory>();
      for (const [key, factory] of Object.entries(extra)) {
        childFactories.set(key, factory as Factory);
      }
      const childResolver = new Resolver(childFactories, new Map(), resolver, options?.name);
      return buildContainerProxy(childResolver, builderFactory);
    },

    extend: (extra: Record<string, (c: any) => any>) => {
      validator.validateConfig(extra);
      const merged = new Map(resolver.getFactories());
      for (const [key, factory] of Object.entries(extra)) {
        merged.set(key, factory as Factory);
      }
      const newResolver = new Resolver(merged, new Map(resolver.getCache()));
      return buildContainerProxy(newResolver, builderFactory);
    },

    module: (fn: (b: any) => any) => {
      if (!builderFactory) throw new Error('module() is not available');
      const builder = builderFactory();
      const result = fn(builder);
      const record = result._toRecord();
      return methods.extend(record);
    },

    preload: async (...keys: string[]) => {
      const toResolve = keys.length > 0 ? keys : [...resolver.getFactories().keys()];
      for (const key of toResolve) {
        resolver.resolve(key);
      }
    },

    reset: (...keys: string[]) => {
      const cache = resolver.getCache();
      for (const key of keys) {
        cache.delete(key);
      }
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
