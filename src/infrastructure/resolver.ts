import type { AnyWarning } from '../domain/errors.js';
import {
  AsyncInitErrorWarning,
  CircularDependencyError,
  FactoryError,
  ProviderNotFoundError,
  ScopeMismatchWarning,
  UndefinedReturnError,
} from '../domain/errors.js';
import { hasOnInit } from '../domain/lifecycle.js';
import type {
  Factory,
  ICycleDetector,
  IDependencyTracker,
  IResolver,
  IValidator,
} from '../domain/types.js';
import { isTransient } from './transient.js';

export interface ResolverDeps {
  factories: Map<string, Factory>;
  cache?: Map<string, unknown>;
  parent?: Resolver;
  name?: string;
  initCalled?: Set<string>;
  cycleDetector: ICycleDetector;
  dependencyTracker: IDependencyTracker;
  validator: IValidator;
}

/**
 * Core resolver — lazy singleton resolution with parent chain support.
 * Delegates cycle detection and dependency tracking to injected collaborators.
 */
export class Resolver implements IResolver {
  private readonly factories: Map<string, Factory>;
  private readonly cache: Map<string, unknown>;
  private readonly warnings: AnyWarning[] = [];
  private readonly validator: IValidator;
  private readonly initCalled: Set<string>;
  private deferOnInit = false;

  private readonly parent?: Resolver;
  private readonly name?: string;
  private readonly cycleDetector: ICycleDetector;
  private readonly dependencyTracker: IDependencyTracker;

  constructor(deps: ResolverDeps) {
    this.factories = deps.factories;
    this.cache = deps.cache ?? new Map();
    this.parent = deps.parent;
    this.name = deps.name;
    this.initCalled = deps.initCalled ? new Set(deps.initCalled) : new Set();
    this.cycleDetector = deps.cycleDetector;
    this.dependencyTracker = deps.dependencyTracker;
    this.validator = deps.validator;
  }

  getName(): string | undefined {
    return this.name;
  }

  resolve(key: string, chain: string[] = []): unknown {
    const factory = this.factories.get(key);

    // Fast path: singleton cache hit.
    if (factory && !isTransient(factory) && this.cache.has(key)) {
      return this.cache.get(key);
    }

    // No local factory — walk parent chain or throw with fuzzy suggestion.
    if (!factory) return this.delegateToParentOrThrow(key, chain);

    // Circular dependency guard.
    if (this.cycleDetector.isResolving(key)) {
      throw new CircularDependencyError(key, [...chain]);
    }

    // Resolution: run the factory + finalize the instance.
    this.cycleDetector.enter(key);
    const currentChain = [...chain, key];
    try {
      const { instance, deps } = this.executeFactory(factory, currentChain);
      this.finalizeInstance(key, factory, instance, deps);
      return instance;
    } catch (error) {
      throw this.classifyError(key, currentChain, error);
    } finally {
      this.cycleDetector.leave(key);
    }
  }

  /** Delegate to parent scope; throw `ProviderNotFoundError` at the root. */
  private delegateToParentOrThrow(key: string, chain: string[]): unknown {
    if (this.parent) return this.parent.resolve(key, chain);
    const allKeys = this.getAllRegisteredKeys();
    const suggestion = this.validator.suggestKey(key, allKeys);
    throw new ProviderNotFoundError(key, chain, allKeys, suggestion);
  }

  /**
   * Invokes the factory through a tracking Proxy that records every accessed
   * dependency key — that's how the dependency graph is built automatically.
   */
  private executeFactory(
    factory: Factory,
    currentChain: string[],
  ): { instance: unknown; deps: string[] } {
    const deps: string[] = [];
    const trackingProxy = this.dependencyTracker.createTrackingProxy(
      deps,
      currentChain,
      (depKey, depChain) => this.resolve(depKey, depChain),
    );
    const instance = factory(trackingProxy);
    if (instance === undefined) {
      throw new UndefinedReturnError(currentChain.at(-1) ?? '', currentChain);
    }
    return { instance, deps };
  }

  /**
   * Post-resolution bookkeeping: record deps, emit scope-mismatch warnings,
   * populate the singleton cache, and dispatch `onInit()` (lazy mode only).
   */
  private finalizeInstance(key: string, factory: Factory, instance: unknown, deps: string[]): void {
    this.dependencyTracker.recordDeps(key, deps);

    if (!isTransient(factory)) {
      this.detectScopeMismatch(key, deps);
      this.cache.set(key, instance);
    }

    this.dispatchOnInitIfNeeded(key, instance);
  }

  /** Emit a warning when a singleton depends on a transient (almost always a bug). */
  private detectScopeMismatch(singletonKey: string, deps: string[]): void {
    for (const dep of deps) {
      const depFactory = this.getFactory(dep);
      if (depFactory && isTransient(depFactory)) {
        this.warnings.push(new ScopeMismatchWarning(singletonKey, dep));
      }
    }
  }

  /**
   * Fire `onInit()` once per key. Async rejections are captured as warnings —
   * the lazy access path can't await, so users must call `preload()` to surface
   * async init errors as proper exceptions.
   */
  private dispatchOnInitIfNeeded(key: string, instance: unknown): void {
    if (this.deferOnInit || this.initCalled.has(key) || !hasOnInit(instance)) return;
    this.initCalled.add(key);
    const initResult = instance.onInit();
    if (initResult instanceof Promise) {
      initResult.catch((error) => {
        this.warnings.push(new AsyncInitErrorWarning(key, error));
      });
    }
  }

  /**
   * Preserve already-categorized container errors; wrap anything else as a
   * `FactoryError` with the full resolution chain attached.
   */
  private classifyError(key: string, currentChain: string[], error: unknown): Error {
    if (
      error instanceof CircularDependencyError ||
      error instanceof ProviderNotFoundError ||
      error instanceof UndefinedReturnError ||
      error instanceof FactoryError
    ) {
      return error;
    }
    return new FactoryError(key, currentChain, error);
  }

  isResolved(key: string): boolean {
    return this.cache.has(key);
  }

  getDepGraph(): Map<string, string[]> {
    return this.dependencyTracker.getDepGraph();
  }

  getResolvedKeys(): string[] {
    return [...this.cache.keys()];
  }

  getFactories(): Map<string, Factory> {
    return this.factories;
  }

  getCache(): Map<string, unknown> {
    return this.cache;
  }

  getWarnings(): AnyWarning[] {
    return [...this.warnings];
  }

  getAllRegisteredKeys(): string[] {
    const keys = new Set<string>(this.factories.keys());
    if (this.parent) {
      for (const key of this.parent.getAllRegisteredKeys()) {
        keys.add(key);
      }
    }
    return [...keys];
  }

  setDeferOnInit(defer: boolean): void {
    this.deferOnInit = defer;
  }

  async callOnInit(key: string): Promise<void> {
    if (this.initCalled.has(key)) return;
    if (!this.cache.has(key)) return;
    const instance = this.cache.get(key);
    if (hasOnInit(instance)) {
      await instance.onInit();
    }
    this.initCalled.add(key);
  }

  clearInitState(...keys: string[]): void {
    for (const key of keys) {
      this.initCalled.delete(key);
    }
  }

  clearAllInitState(): void {
    this.initCalled.clear();
  }

  clearDepGraph(...keys: string[]): void {
    this.dependencyTracker.clearDepGraph(...keys);
  }

  clearAllDepGraph(): void {
    this.dependencyTracker.clearAllDepGraph();
  }

  clearWarnings(): void {
    this.warnings.length = 0;
  }

  clearWarningsForKeys(...keys: string[]): void {
    const keySet = new Set(keys);
    const keep = this.warnings.filter((w) => {
      if (w.type === 'async_init_error') return !keySet.has(w.details.key);
      if (w.type === 'scope_mismatch') {
        return !keySet.has(w.details.singleton) && !keySet.has(w.details.transient);
      }
      return true;
    });
    this.warnings.length = 0;
    this.warnings.push(...keep);
  }

  getInitCalled(): Set<string> {
    return this.initCalled;
  }

  /** Look up a factory in this resolver or its parent chain. */
  private getFactory(key: string): Factory | undefined {
    return this.factories.get(key) ?? this.parent?.getFactory(key);
  }
}
