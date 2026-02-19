import type { ContainerBuilder } from '../application/container-builder.js';
import type { AnyWarning } from './errors.js';

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
 * Reserved method names on the container that cannot be used as dependency keys.
 * These methods are part of the public API of the built container.
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
 * Options for creating a scoped container.
 */
export interface ScopeOptions {
  /**
   * Optional name for the scope, useful for debugging and introspection.
   * If provided, `String(container)` will return `Scope(name)`.
   */
  name?: string;
}

/**
 * Full container type exposed to the user.
 * Combines resolved dependencies with container methods.
 *
 * @example
 * ```typescript
 * const c = container()
 *   .add('logger', () => new LoggerService())
 *   .build();
 * c.logger; // LoggerService (lazy, singleton)
 * c.inspect(); // ContainerGraph
 * ```
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
   * Child inherits all parent singletons via a parent Resolver chain.
   *
   * Scoped singletons are independent — they are cached in the child's own cache.
   * Child can override parent keys with different types/factories.
   *
   * @param extra - Map of factories for new/overridden dependencies
   * @param options - Optional configuration like scope name
   *
   * @example
   * ```typescript
   * const request = app.scope({
   *   requestId: () => crypto.randomUUID(),
   *   handler: (c) => new Handler(c.logger),  // c typed as parent
   * });
   * ```
   */
  scope<E extends Record<string, (c: T) => unknown>>(
    extra: E,
    options?: ScopeOptions,
  ): Container<
    Omit<T, keyof { [K in keyof E]: ReturnType<E[K]> }> & { [K in keyof E]: ReturnType<E[K]> }
  >;

  /**
   * Returns a new container with additional dependencies merging with the current ones.
   * Unlike `scope()`, the existing singleton cache is SHARED (copied).
   * Already-resolved singletons from the original container are reused.
   *
   * The original container remains unmodified.
   *
   * @param extra - Map of factories for new/overridden dependencies
   *
   * @example
   * ```typescript
   * const full = app.extend({
   *   cache: (c) => new Redis(c.logger),  // c typed as parent
   * });
   * ```
   */
  extend<E extends Record<string, (c: T) => unknown>>(
    extra: E,
  ): Container<
    Omit<T, keyof { [K in keyof E]: ReturnType<E[K]> }> & { [K in keyof E]: ReturnType<E[K]> }
  >;

  /**
   * Applies a module post-build using the builder pattern for incremental type accumulation.
   * Semantically equivalent to `extend()` but provides a `ContainerBuilder` to the callback.
   * This allows factories to see types of dependencies added earlier in the same module.
   *
   * @param fn - Callback receiving a builder initialized with current container state
   *
   * @example
   * ```typescript
   * const withDb = app.module((b) => b
   *   .add('db', (c) => new Database(c.config))
   *   .add('cache', (c) => new Redis(c.db)) // c knows about 'db'
   * );
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  module<TNew extends Record<string, any>>(
    fn: (
      builder: ContainerBuilder<Record<string, unknown>, T>,
    ) => ContainerBuilder<Record<string, unknown>, TNew>,
  ): Container<TNew>;

  /**
   * Pre-resolves dependencies (warm-up) and awaits their `onInit` lifecycle hooks.
   * Resolves only requested keys if provided, otherwise resolves all registered dependencies.
   *
   * Performance optimization: dependencies are resolved in parallel based on topological sort levels.
   *
   * @param keys - Optional specific keys to preload
   * @returns Promise that resolves once all preloaded dependencies and their `onInit` hooks complete
   *
   * @example
   * ```typescript
   * await container.preload('db', 'cache'); // specific deps
   * await container.preload();              // all deps
   * ```
   */
  preload(...keys: (keyof T)[]): Promise<void>;

  /**
   * Returns the full dependency graph as a serializable JSON object.
   * Includes provider status, discovered dependencies, and resolution state.
   *
   * @example
   * ```typescript
   * const graph = container.inspect();
   * console.log(JSON.stringify(graph, null, 2));
   * ```
   */
  inspect(): ContainerGraph;

  /**
   * Returns detailed information about a specific provider.
   *
   * @param key - The dependency key to describe
   *
   * @example
   * ```typescript
   * container.describe('userService');
   * // { key: 'userService', resolved: true, deps: ['userRepo', 'logger'], scope: 'singleton' }
   * ```
   */
  describe(key: keyof T | string): ProviderInfo;

  /**
   * Returns container health status including counts and warnings.
   * Use this to detect issues like scope mismatches or async initialization errors.
   *
   * @example
   * ```typescript
   * const { totalProviders, warnings } = container.health();
   * if (warnings.length > 0) console.warn(warnings);
   * ```
   */
  health(): ContainerHealth;

  /**
   * Invalidates cached singletons, forcing re-creation on next access.
   * Does not affect parent containers in a scope chain.
   *
   * @param keys - Keys to reset. If none provided, this is a no-op.
   *
   * @example
   * ```typescript
   * container.reset('db');       // reset one
   * container.reset('db', 'cache'); // reset multiple
   * ```
   */
  reset(...keys: (keyof T)[]): void;

  /**
   * Disposes the container by calling `onDestroy()` on all resolved instances.
   * Hooks are executed in reverse resolution order (LIFO).
   *
   * Resilient: continues calling other hooks even if one fails.
   *
   * @example
   * ```typescript
   * await container.dispose();
   * ```
   */
  dispose(): Promise<void>;
}

/**
 * Full dependency graph representation of a container.
 */
export interface ContainerGraph {
  /** Optional name of the container/scope. */
  name?: string;
  /** Map of registered provider information. */
  providers: Record<string, ProviderInfo>;
}

/**
 * Detailed metadata about a single dependency provider.
 */
export interface ProviderInfo {
  /** The unique identifier for this dependency. */
  key: string;
  /** Whether the dependency has been resolved into a value/singleton. */
  resolved: boolean;
  /** List of dependency keys discovered during resolution of this provider. */
  deps: string[];
  /** Lifecycle scope: singleton (cached) or transient (new instance every time). */
  scope: 'singleton' | 'transient';
}

/**
 * Snapshot of container health state and diagnostic warnings.
 */
export interface ContainerHealth {
  /** Total number of registered providers. */
  totalProviders: number;
  /** List of keys already resolved. */
  resolved: string[];
  /** List of keys not yet resolved (lazy). */
  unresolved: string[];
  /** Diagnostic warnings discovered during runtime or resolution. */
  warnings: ContainerWarning[];
}

/**
 * A diagnostic warning detected by the container's runtime analysis.
 */
export interface ContainerWarning {
  /**
   * Warning type:
   * - `scope_mismatch`: A singleton depends on a transient (value gets frozen inside the singleton).
   * - `async_init_error`: An async `onInit` hook failed during fire-and-forget lazy resolution.
   */
  type: 'scope_mismatch' | 'async_init_error';
  /** Human-readable warning message. */
  message: string;
  /** Structured context for the warning. */
  details: Record<string, unknown>;
}

/**
 * Interface for config and runtime validation.
 */
export interface IValidator {
  validateConfig(config: Record<string, unknown>): void;
  suggestKey(key: string, registered: string[]): string | undefined;
}

/**
 * Tracks which dependencies each factory accesses at resolution time.
 * Builds the dependency graph automatically via a tracking Proxy.
 */
export interface IDependencyTracker {
  createTrackingProxy(
    deps: string[],
    chain: string[],
    resolve: (key: string, chain: string[]) => unknown,
  ): unknown;
  getDepGraph(): Map<string, string[]>;
  recordDeps(key: string, deps: string[]): void;
  clearDepGraph(...keys: string[]): void;
  clearAllDepGraph(): void;
}

/**
 * Detects circular dependencies during resolution.
 */
export interface ICycleDetector {
  enter(key: string): void;
  leave(key: string): void;
  isResolving(key: string): boolean;
}

/**
 * Core resolver contract — resolves dependencies by key.
 * Used by application layer (Introspection, Preloader, Disposer, ContainerProxy).
 */
export interface IResolver {
  resolve(key: string, chain?: string[]): unknown;
  isResolved(key: string): boolean;
  getFactories(): Map<string, Factory>;
  getCache(): Map<string, unknown>;
  getDepGraph(): Map<string, string[]>;
  getResolvedKeys(): string[];
  getWarnings(): AnyWarning[];
  getAllRegisteredKeys(): string[];
  getName(): string | undefined;

  // Lifecycle delegation
  setDeferOnInit(defer: boolean): void;
  callOnInit(key: string): Promise<void>;
  getInitCalled(): Set<string>;
  clearInitState(...keys: string[]): void;
  clearAllInitState(): void;
  clearWarnings(): void;
  clearWarningsForKeys(...keys: string[]): void;
  clearDepGraph(...keys: string[]): void;
  clearAllDepGraph(): void;
}
