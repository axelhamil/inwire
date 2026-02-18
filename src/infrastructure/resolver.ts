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
import type { Factory, ICycleDetector, IDependencyTracker, IResolver } from '../domain/types.js';
import { Validator } from '../domain/validation.js';
import { isTransient } from './transient.js';

export interface ResolverDeps {
  factories: Map<string, Factory>;
  cache?: Map<string, unknown>;
  parent?: Resolver;
  name?: string;
  initCalled?: Set<string>;
  cycleDetector: ICycleDetector;
  dependencyTracker: IDependencyTracker;
}

/**
 * Core resolver — lazy singleton resolution with parent chain support.
 * Delegates cycle detection and dependency tracking to injected collaborators.
 */
export class Resolver implements IResolver {
  private readonly factories: Map<string, Factory>;
  private readonly cache: Map<string, unknown>;
  private readonly warnings: AnyWarning[] = [];
  private readonly validator = new Validator();
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
  }

  getName(): string | undefined {
    return this.name;
  }

  resolve(key: string, chain: string[] = []): unknown {
    const factory = this.factories.get(key);

    if (factory && !isTransient(factory) && this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (!factory) {
      if (this.parent) {
        return this.parent.resolve(key, chain);
      }
      const allKeys = this.getAllRegisteredKeys();
      const suggestion = this.validator.suggestKey(key, allKeys);
      throw new ProviderNotFoundError(key, chain, allKeys, suggestion);
    }

    if (this.cycleDetector.isResolving(key)) {
      throw new CircularDependencyError(key, [...chain]);
    }

    this.cycleDetector.enter(key);
    const currentChain = [...chain, key];

    try {
      const deps: string[] = [];
      const trackingProxy = this.dependencyTracker.createTrackingProxy(
        deps,
        currentChain,
        (depKey, depChain) => this.resolve(depKey, depChain),
      );

      const instance = factory(trackingProxy);

      if (instance === undefined) {
        throw new UndefinedReturnError(key, currentChain);
      }

      this.dependencyTracker.recordDeps(key, deps);

      if (!isTransient(factory)) {
        for (const dep of deps) {
          const depFactory = this.getFactory(dep);
          if (depFactory && isTransient(depFactory)) {
            this.warnings.push(new ScopeMismatchWarning(key, dep));
          }
        }
      }

      if (!isTransient(factory)) {
        this.cache.set(key, instance);
      }

      if (!this.deferOnInit && !this.initCalled.has(key) && hasOnInit(instance)) {
        this.initCalled.add(key);
        const initResult = instance.onInit();
        if (initResult instanceof Promise) {
          initResult.catch((error) => {
            this.warnings.push(new AsyncInitErrorWarning(key, error));
          });
        }
      }

      return instance;
    } catch (error) {
      if (
        error instanceof CircularDependencyError ||
        error instanceof ProviderNotFoundError ||
        error instanceof UndefinedReturnError ||
        error instanceof FactoryError
      ) {
        throw error;
      }
      throw new FactoryError(key, currentChain, error);
    } finally {
      this.cycleDetector.leave(key);
    }
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
