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
  /** Optional name for the scope, useful for debugging and introspection. */
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
 * c.logger; // LoggerService
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
   * Child inherits all parent singletons and can add/override deps.
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
   * Returns a new container with additional dependencies.
   * Existing singletons are shared. The original container is not modified.
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
   * Applies a module post-build using the builder pattern.
   * Semantically equivalent to `extend()` but uses `ContainerBuilder` for
   * incremental type accumulation of `c` in factories.
   *
   * @example
   * ```typescript
   * const withDb = app.module((b) => b
   *   .add('db', (c) => new Database(c.config))
   *   .add('cache', (c) => new Redis(c.config))
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
   * Pre-resolves dependencies (warm-up).
   * Call with specific keys to resolve only those, or without arguments to resolve all.
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
   * Useful for AI analysis of the architecture.
   *
   * @example
   * ```typescript
   * container.inspect();
   * // { providers: { logger: { key: 'logger', resolved: true, deps: [], scope: 'singleton' } } }
   * ```
   */
  inspect(): ContainerGraph;

  /**
   * Returns detailed information about a specific provider.
   *
   * @example
   * ```typescript
   * container.describe('userService');
   * // { key: 'userService', resolved: true, deps: ['userRepo', 'logger'], scope: 'singleton' }
   * ```
   */
  describe(key: keyof T | string): ProviderInfo;

  /**
   * Returns container health status and warnings.
   *
   * @example
   * ```typescript
   * container.health();
   * // { totalProviders: 12, resolved: ['db', 'logger'], unresolved: ['cache'], warnings: [] }
   * ```
   */
  health(): ContainerHealth;

  /**
   * Invalidates cached singletons, forcing re-creation on next access.
   * Does not affect parent scopes.
   *
   * @example
   * ```typescript
   * container.reset('db');       // reset one
   * container.reset('db', 'cache'); // reset multiple
   * ```
   */
  reset(...keys: (keyof T)[]): void;

  /**
   * Disposes the container. Calls `onDestroy()` on all resolved instances
   * that implement it, in reverse resolution order.
   *
   * @example
   * ```typescript
   * await container.dispose();
   * ```
   */
  dispose(): Promise<void>;
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
  createTrackingProxy(deps: string[], chain: string[], resolve: (key: string, chain: string[]) => unknown): unknown;
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
