/**
 * Public types — everything users see and consume from `import 'inwire'`.
 * No internal collaborator interfaces here (those live in `./internal.ts`).
 */

/**
 * A factory function that receives the container and returns an instance.
 *
 * @example
 * ```typescript
 * const factory: Factory<MyService> = (c) => new MyService(c.db);
 * ```
 */
export type Factory<T = unknown> = (container: unknown) => T;

/**
 * Utility: `T` with keys of `U` overridden by `U` — avoids the `A & A → never`
 * collapse when classes have private members and the same key is declared on
 * both sides (e.g. global `AppDeps` + module `.add()`).
 */
export type Override<T, U> = Omit<T, keyof U> & U;

/**
 * Reserved method names on the container that cannot be used as dependency keys.
 */
export const RESERVED_KEYS = [
  'scope',
  'extend',
  'module',
  'preload',
  'reset',
  'inspect',
  'describe',
  'health',
  'dispose',
  'toString',
] as const;

export type ReservedKey = (typeof RESERVED_KEYS)[number];

/**
 * String key constrained to `TContract`'s keys. Equivalent to `string & keyof TContract`,
 * just named for readability in builder signatures.
 */
export type BuilderKey<TContract> = string & keyof TContract;

/**
 * Rejects {@link ReservedKey} values at the type level (collapses to `never`).
 * Used to gate `.add()` / `.addTransient()` against container method names.
 */
export type NonReservedKey<K extends string> = K & (K extends ReservedKey ? never : K);

/**
 * Argument type for `.add()` — accepts either a lazy factory or a non-function
 * eager instance. The `V extends Function ? never : V` clause excludes functions
 * from the instance variant (functions are always treated as factories).
 */
export type FactoryOrInstance<TBuilt, V> =
  | ((c: TBuilt) => V)
  // biome-ignore lint/complexity/noBannedTypes: Function is the type-level discriminator between factory and instance
  | (V & (V extends Function ? never : V));

/**
 * Resulting `TBuilt` after `.add(key, value)` — same as `Override<TBuilt, Record<K, V>>`,
 * just named for readability.
 */
export type AddBuilt<TBuilt, K extends string, V> = Override<TBuilt, Record<K, V>>;

/**
 * Global, augmentable interface describing the application's dependency shape.
 *
 * Empty by default. Each module file augments it with the bindings IT provides,
 * enabling **cross-module forward references** in factories — `c.X` resolves
 * even when `X` is added by another module loaded later.
 *
 * @example Augment from a module file:
 * ```typescript
 * declare module 'inwire' {
 *   interface AppDeps {
 *     IUserRepository: IUserRepository;
 *     SignInUseCase: SignInUseCase;
 *   }
 * }
 * ```
 *
 * When `defineModule()` is called without an explicit `<TDeps>` generic, the
 * builder's `c` parameter is typed as `AppDeps` — the union of every module's
 * augmentations. TypeScript merges these declarations across files.
 */
// biome-ignore lint/suspicious/noEmptyInterface: empty interface IS the augmentation surface — required so users can `declare module 'inwire' { interface AppDeps { ... } }`
export interface AppDeps {}

/**
 * Options for creating a scoped container.
 */
export interface ScopeOptions {
  /** Optional name for the scope, useful for debugging and introspection. */
  name?: string;
}

/**
 * Full container type exposed to the user.
 * Combines resolved dependencies with container methods.
 */
// biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
export type Container<T extends Record<string, any> = Record<string, unknown>> = T & IContainer<T>;

/**
 * Container methods interface. Defines the API available on every container.
 */
// biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
export interface IContainer<T extends Record<string, any> = Record<string, unknown>> {
  /**
   * Creates a child container with additional dependencies.
   * Child inherits all parent singletons and can add/override deps.
   */
  scope<E extends Record<string, (c: T) => unknown>>(
    extra: E,
    options?: ScopeOptions,
  ): Container<
    Omit<T, keyof { [K in keyof E]: ReturnType<E[K]> }> & { [K in keyof E]: ReturnType<E[K]> }
  >;

  /**
   * Returns a new container with additional dependencies.
   * Existing singletons are shared. The original container is not modified.
   */
  extend<E extends Record<string, (c: T) => unknown>>(
    extra: E,
  ): Container<
    Omit<T, keyof { [K in keyof E]: ReturnType<E[K]> }> & { [K in keyof E]: ReturnType<E[K]> }
  >;

  /**
   * Applies a module post-build using the builder pattern.
   * Semantically equivalent to `extend()` but uses `IContainerBuilder` for
   * incremental type accumulation of `c` in factories.
   */
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  module<TNew extends Record<string, any>>(
    fn: (
      builder: IContainerBuilder<Record<string, unknown>, T>,
    ) => IContainerBuilder<Record<string, unknown>, T & TNew>,
  ): Container<T & TNew>;

  /** Pre-resolves dependencies (warm-up). No args = preload everything. */
  preload(...keys: (keyof T)[]): Promise<void>;

  /** Returns the full dependency graph as a serializable JSON object. */
  inspect(): ContainerGraph;

  /** Returns detailed information about a specific provider. */
  describe(key: keyof T | string): ProviderInfo;

  /** Returns container health status and warnings. */
  health(): ContainerHealth;

  /** Invalidates cached singletons, forcing re-creation on next access. */
  reset(...keys: (keyof T)[]): void;

  /** LIFO `onDestroy()` on all resolved instances. */
  dispose(): Promise<void>;

  /** ES2023 explicit resource management hook — alias of {@link IContainer.dispose}. */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Domain-level contract of the fluent builder.
 *
 * The concrete `ContainerBuilder` class in `application/` implements this
 * structurally — keeping the dependency rule one-way (`domain ← application`).
 * Consumers writing builder callbacks (e.g. inside `.module()` or `defineModule()`)
 * receive a value of this interface; they should never need the concrete class.
 */
export interface IContainerBuilder<
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TContract extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/complexity/noBannedTypes: {} is the correct default for "no deps accumulated yet"
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TBuilt extends Record<string, any> = {},
> {
  /** Registers a dependency — factory (lazy) or instance (eager). */
  add<K extends BuilderKey<TContract>, V extends TContract[K]>(
    key: NonReservedKey<K>,
    factoryOrInstance: FactoryOrInstance<TBuilt, V>,
  ): IContainerBuilder<TContract, AddBuilt<TBuilt, K, V>>;

  /** Registers a transient dependency (new instance on every access). */
  addTransient<K extends BuilderKey<TContract>, V extends TContract[K]>(
    key: NonReservedKey<K>,
    factory: (c: TBuilt) => V,
  ): IContainerBuilder<TContract, AddBuilt<TBuilt, K, V>>;

  /** Applies a module — a function that chains `.add()` calls on this builder. */
  addModule<
    // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
    TDepsM extends Record<string, any>,
    // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
    TNew extends Record<string, any>,
  >(
    module: (builder: IContainerBuilder<TContract, TDepsM>) => IContainerBuilder<TContract, TNew>,
  ): IContainerBuilder<TContract, Override<TBuilt, TNew>>;

  /** Merges a standalone builder's factories into this one. */
  merge<TOther extends Record<string, unknown>>(
    other: IContainerBuilder<Record<string, unknown>, TOther>,
  ): IContainerBuilder<TContract, Override<TBuilt, TOther>>;

  /** Builds and returns the final container. */
  build(): Container<TBuilt>;

  /**
   * Returns the accumulated factories as a plain record.
   * @internal Used by `module()` on the container and `merge()` on builders.
   */
  _toRecord(): Record<string, Factory>;
}

/**
 * Full dependency graph of the container.
 */
export interface ContainerGraph {
  name?: string;
  providers: Record<string, ProviderInfo>;
}

/**
 * Detailed information about a single provider/dependency.
 */
export interface ProviderInfo {
  key: string;
  resolved: boolean;
  deps: string[];
  scope: 'singleton' | 'transient';
}

/**
 * Container health status with warnings.
 */
export interface ContainerHealth {
  totalProviders: number;
  resolved: string[];
  unresolved: string[];
  warnings: ContainerWarning[];
}

/**
 * A warning detected by the container's runtime analysis.
 */
export interface ContainerWarning {
  type: 'scope_mismatch' | 'async_init_error';
  message: string;
  details: Record<string, unknown>;
}
