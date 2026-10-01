import { DuplicateKeyError, ProviderNotFoundError, ReservedKeyError } from '../domain/errors.js';
import type {
  AddBuilt,
  BindingOptions,
  BuilderKey,
  Container,
  ContainerOptions,
  Factory,
  FactoryOrInstance,
  IContainerBuilder,
  ModuleCheck,
  ModuleProvides,
  NonReservedKey,
  Override,
} from '../domain/types.js';
import { RESERVED_KEYS as RESERVED } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import { describeBinding } from '../infrastructure/binding.js';
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
  private readonly options: ContainerOptions;

  constructor(options: ContainerOptions = {}) {
    this.options = options;
  }

  /**
   * Registers a dependency — factory (lazy) or instance (eager).
   *
   * Convention: `typeof value === 'function'` → factory. Otherwise → instance (wrapped in `() => value`).
   * To register a function as a value: `add('fn', () => myFunction)`.
   *
   * `options.dispose` declares how `dispose()` tears the instance down, for objects
   * without `onDestroy()`: `.add('pool', () => new Pool(), { dispose: (p) => p.end() })`.
   */
  add<K extends BuilderKey<TContract>, V extends TContract[K]>(
    key: NonReservedKey<K>,
    factoryOrInstance: FactoryOrInstance<TBuilt, V>,
    options?: BindingOptions<V>,
  ): ContainerBuilder<TContract, AddBuilt<TBuilt, K, V>> {
    this.validateKey(key);
    this.factories.set(key, toFactory(factoryOrInstance, options));
    return this as unknown as ContainerBuilder<TContract, AddBuilt<TBuilt, K, V>>;
  }

  /**
   * Registers a transient dependency (new instance on every access).
   */
  addTransient<K extends BuilderKey<TContract>, V extends TContract[K]>(
    key: NonReservedKey<K>,
    factory: (c: TBuilt) => V,
  ): ContainerBuilder<TContract, AddBuilt<TBuilt, K, V>> {
    this.validateKey(key);
    this.factories.set(key, markTransient(factory as Factory));
    return this as unknown as ContainerBuilder<TContract, AddBuilt<TBuilt, K, V>>;
  }

  /**
   * Replaces a registered binding before the container is built, typically in tests.
   * Every dependent, direct or not, receives the replacement, since nothing has been
   * resolved yet. The binding keeps its type: the replacement must be assignable to it.
   * Throws `ProviderNotFoundError` for a key that is not registered.
   *
   * The original `dispose` hook is dropped with the original factory; pass `options`
   * to give the replacement its own.
   *
   * @example
   * ```typescript
   * const app = createApp() // returns the builder, before .build()
   *   .override('db', new InMemoryDb())
   *   .override('mailer', () => ({ send: async () => {} }))
   *   .build();
   * ```
   */
  override<K extends string & keyof TBuilt>(
    key: K,
    factoryOrInstance: ((c: TBuilt) => TBuilt[K]) | TBuilt[K],
    options?: BindingOptions<TBuilt[K]>,
  ): ContainerBuilder<TContract, TBuilt> {
    if (!this.factories.has(key)) {
      const registered = [...this.factories.keys()];
      const suggestion = new Validator(this.options.similarityThreshold).suggestKey(
        key,
        registered,
      );
      throw new ProviderNotFoundError(key, [], registered, suggestion);
    }
    this.factories.set(key, toFactory(factoryOrInstance, options));
    return this;
  }

  /**
   * Applies a module, typically one made with {@link defineModule}.
   *
   * Checked at compile time for modules with explicit prerequisites
   * (`defineModule<{ db: Db }>()`):
   * - every prerequisite must already be on this builder with a compatible type,
   *   otherwise the error names the missing keys (`'missing prerequisites': 'db'`);
   * - the keys the module provides must be new (`'duplicate keys': 'users'`),
   *   which `.add()` would reject at runtime anyway with `DuplicateKeyError`.
   *
   * Only the keys the module adds join the builder type: the host keeps its own,
   * more precise, types for the prerequisites.
   *
   * Global-mode modules (`defineModule()` typed against `AppDeps`) skip the check:
   * their prerequisites are the whole app, complete only once every module is added.
   * A key still missing at that point raises `ProviderNotFoundError` on resolution.
   *
   * @example
   * ```typescript
   * const usersModule = defineModule<{ db: Db }>()((b) =>
   *   b.add('users', (c) => new UserService(c.db)),
   * );
   *
   * container().add('db', () => new PgDb()).addModule(usersModule); // ok
   * container().addModule(usersModule); // error: 'missing prerequisites': 'db'
   * ```
   */
  addModule<
    // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
    TDepsM extends Record<string, any> = TBuilt,
    // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
    TNew extends Record<string, any> = TBuilt,
  >(
    module: ((
      builder: IContainerBuilder<TContract, TDepsM>,
    ) => IContainerBuilder<TContract, TNew>) &
      ModuleCheck<TBuilt, TDepsM, TNew>,
  ): ContainerBuilder<TContract, Override<TBuilt, ModuleProvides<TDepsM, TNew>>> {
    return module(
      this as unknown as IContainerBuilder<TContract, TDepsM>,
    ) as unknown as ContainerBuilder<TContract, Override<TBuilt, ModuleProvides<TDepsM, TNew>>>;
  }

  /**
   * Merges a standalone builder into this one. All factories of `other` are copied.
   * The accumulated type becomes `TBuilt & TOther`, so subsequent factories can
   * consume keys from either side.
   *
   * Use this to compose builders that were defined independently:
   * ```typescript
   * const dbModule = container().add('db', () => new DB());
   * const di = container().add('logger', () => new Logger()).merge(dbModule).build();
   * ```
   *
   * Cross-builder dependencies are resolved at build time. Reserved keys throw.
   *
   * Duplicate keys do NOT throw here: the merged builder wins (last write wins), which
   * is what makes `.merge()` usable for overriding a module in tests. `.add()` is the
   * strict path — it throws `DuplicateKeyError`.
   */
  merge<TOther extends Record<string, unknown>>(
    other: ContainerBuilder<Record<string, unknown>, TOther>,
  ): ContainerBuilder<TContract, Override<TBuilt, TOther>> {
    for (const [key, factory] of Object.entries(other._toRecord())) {
      this.validateReservedKey(key);
      this.factories.set(key, factory);
    }
    return this as unknown as ContainerBuilder<TContract, Override<TBuilt, TOther>>;
  }

  /**
   * Returns the accumulated factories as a plain record.
   * @internal Used by `module()` on the container and `merge()` on builders.
   */
  _toRecord(): Record<string, Factory> {
    return Object.fromEntries(this.factories);
  }

  /**
   * Builds and returns the final container.
   */
  build(): Container<TBuilt> {
    const validator = new Validator(this.options.similarityThreshold);
    const resolver = new Resolver({
      factories: new Map(this.factories),
      cycleDetector: new CycleDetector(),
      dependencyTracker: new DependencyTracker(),
      validator,
    });
    return buildContainerProxy(
      resolver,
      () => new ContainerBuilder(this.options),
      validator,
      this.options.disposeTimeout,
    ) as Container<TBuilt>;
  }

  private validateKey(key: string): void {
    this.validateReservedKey(key);
    if (this.factories.has(key)) {
      throw new DuplicateKeyError(key);
    }
  }

  private validateReservedKey(key: string): void {
    if ((RESERVED as readonly string[]).includes(key)) {
      throw new ReservedKeyError(key, RESERVED);
    }
  }
}

/**
 * Turns the value given to `.add()` into a factory. Eager instances and bindings with
 * a `dispose` hook carry their metadata, so `dispose()` can reach an eager instance
 * that was never read.
 */
function toFactory<V>(value: unknown, options: BindingOptions<V> = {}): Factory {
  const dispose = options.dispose as ((instance: unknown) => unknown) | undefined;
  if (typeof value === 'function') {
    return dispose ? describeBinding(value as Factory, { dispose }) : (value as Factory);
  }
  return describeBinding(() => value, { dispose, eager: { value } });
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
>(options?: ContainerOptions): ContainerBuilder<T> {
  return new ContainerBuilder<T>(options);
}
