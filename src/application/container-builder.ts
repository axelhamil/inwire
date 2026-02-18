import { ReservedKeyError } from '../domain/errors.js';
import type { Container, Factory, RESERVED_KEYS } from '../domain/types.js';
import { RESERVED_KEYS as RESERVED } from '../domain/types.js';
import { CycleDetector } from '../infrastructure/cycle-detector.js';
import { DependencyTracker } from '../infrastructure/dependency-tracker.js';
import { Resolver } from '../infrastructure/resolver.js';
import { transient as markTransient } from '../infrastructure/transient.js';
import { buildContainerProxy } from './container-proxy.js';

/**
 * Fluent builder that constructs a typed DI container incrementally.
 *
 * Two modes, one class:
 * - `container<AppDeps>()` — contract mode: keys restricted to `keyof AppDeps`, return types constrained
 * - `container()` — free mode: keys are any `string`, types inferred freely
 *
 * Each `.add()` call accumulates the type so that subsequent factories
 * receive a fully-typed `c` parameter with all previously registered deps.
 */
export class ContainerBuilder<
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures (Record<string, unknown> requires them)
  TContract extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/complexity/noBannedTypes: {} is the correct generic default for "no deps accumulated yet"
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TBuilt extends Record<string, any> = {},
> {
  private readonly factories = new Map<string, Factory>();

  /**
   * Registers a dependency — factory (lazy) or instance (eager).
   *
   * Convention: `typeof value === 'function'` → factory. Otherwise → instance (wrapped in `() => value`).
   * To register a function as a value: `add('fn', () => myFunction)`.
   */
  add<K extends string & keyof TContract, V extends TContract[K]>(
    key: K & (K extends (typeof RESERVED_KEYS)[number] ? never : K),
    factoryOrInstance:
      | ((c: TBuilt) => V)
      // biome-ignore lint/complexity/noBannedTypes: Function is the correct type-level discriminator for factory vs instance
      | (V & (V extends Function ? never : V)),
  ): ContainerBuilder<TContract, TBuilt & Record<K, V>> {
    this.validateKey(key);
    if (typeof factoryOrInstance === 'function') {
      this.factories.set(key, factoryOrInstance as Factory);
    } else {
      this.factories.set(key, () => factoryOrInstance);
    }
    return this as unknown as ContainerBuilder<TContract, TBuilt & Record<K, V>>;
  }

  /**
   * Registers a transient dependency (new instance on every access).
   */
  addTransient<K extends string & keyof TContract, V extends TContract[K]>(
    key: K & (K extends (typeof RESERVED_KEYS)[number] ? never : K),
    factory: (c: TBuilt) => V,
  ): ContainerBuilder<TContract, TBuilt & Record<K, V>> {
    this.validateKey(key);
    this.factories.set(key, markTransient(factory as Factory));
    return this as unknown as ContainerBuilder<TContract, TBuilt & Record<K, V>>;
  }

  /**
   * Applies a module — a function that chains `.add()` calls on this builder.
   * `c` in the module's factories is fully typed with all previously registered deps.
   */
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  addModule<TNew extends Record<string, any>>(
    module: (builder: ContainerBuilder<TContract, TBuilt>) => ContainerBuilder<TContract, TNew>,
  ): ContainerBuilder<TContract, TNew> {
    return module(this);
  }

  /**
   * Returns the accumulated factories as a plain record.
   * @internal Used by `module()` on the container.
   */
  _toRecord(): Record<string, Factory> {
    return Object.fromEntries(this.factories);
  }

  /**
   * Builds and returns the final container.
   */
  build(): Container<TBuilt> {
    const resolver = new Resolver({
      factories: new Map(this.factories),
      cycleDetector: new CycleDetector(),
      dependencyTracker: new DependencyTracker(),
    });
    return buildContainerProxy(resolver, () => new ContainerBuilder()) as Container<TBuilt>;
  }

  private validateKey(key: string): void {
    if ((RESERVED as readonly string[]).includes(key)) {
      throw new ReservedKeyError(key, RESERVED);
    }
  }
}

/**
 * Creates a new container builder.
 *
 * @example Contract mode (interface-first):
 * ```typescript
 * interface AppDeps { logger: Logger; db: Database }
 *
 * const app = container<AppDeps>()
 *   .add('logger', () => new ConsoleLogger())
 *   .add('db', (c) => new PgDatabase(c.logger))
 *   .build()
 * ```
 *
 * @example Free mode:
 * ```typescript
 * const app = container()
 *   .add('logger', () => new ConsoleLogger())
 *   .add('db', (c) => new PgDatabase(c.logger))
 *   .build()
 * ```
 */
export function container<
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  T extends Record<string, any> = Record<string, unknown>,
>(): ContainerBuilder<T> {
  return new ContainerBuilder<T>();
}
