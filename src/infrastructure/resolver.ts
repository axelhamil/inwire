import type { DepsDefinition, Factory } from '../domain/types.js';
import { hasOnInit } from '../domain/lifecycle.js';
import {
  CircularDependencyError,
  FactoryError,
  ProviderNotFoundError,
  ScopeMismatchWarning,
  UndefinedReturnError,
} from '../domain/errors.js';
import { Validator } from '../domain/validation.js';
import { isTransient } from './transient.js';

/**
 * Core resolver that powers the container's Proxy.
 * Handles lazy resolution, singleton caching, cycle detection,
 * dependency tracking, and scope mismatch warnings.
 */
export class Resolver {
  private readonly factories: Map<string, Factory>;
  private readonly cache: Map<string, unknown>;
  private readonly resolving = new Set<string>();
  private readonly depGraph = new Map<string, string[]>();
  private readonly warnings: ScopeMismatchWarning[] = [];
  private readonly validator = new Validator();

  /** Parent resolver for scoped containers */
  private readonly parent?: Resolver;

  /** Optional name for debugging/introspection */
  private readonly name?: string;

  constructor(
    factories: Map<string, Factory>,
    cache?: Map<string, unknown>,
    parent?: Resolver,
    name?: string,
  ) {
    this.factories = factories;
    this.cache = cache ?? new Map();
    this.parent = parent;
    this.name = name;
  }

  getName(): string | undefined {
    return this.name;
  }

  /**
   * Resolves a dependency by key.
   * - Returns cached singleton if available
   * - Detects circular dependencies
   * - Tracks dependencies accessed by each factory
   * - Calls `onInit()` on newly created instances
   * - Emits scope mismatch warnings
   */
  resolve(key: string, chain: string[] = []): unknown {
    // Check singleton cache (non-transient only)
    const factory = this.factories.get(key);

    if (factory && !isTransient(factory) && this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Try parent if we don't have the factory
    if (!factory) {
      if (this.parent) {
        return this.parent.resolve(key, chain);
      }
      const allKeys = this.getAllRegisteredKeys();
      const suggestion = this.validator.suggestKey(key, allKeys);
      throw new ProviderNotFoundError(key, chain, allKeys, suggestion);
    }

    // Circular dependency detection
    if (this.resolving.has(key)) {
      throw new CircularDependencyError(key, [...chain]);
    }

    this.resolving.add(key);
    const currentChain = [...chain, key];

    try {
      // Create a tracking proxy to record which deps this factory accesses
      const deps: string[] = [];
      const trackingProxy = this.createTrackingProxy(key, deps, currentChain);

      const instance = factory(trackingProxy);

      if (instance === undefined) {
        throw new UndefinedReturnError(key, currentChain);
      }

      // Record the dependency graph
      this.depGraph.set(key, deps);

      // Check scope mismatch: singleton depending on transient
      if (!isTransient(factory)) {
        for (const dep of deps) {
          const depFactory = this.getFactory(dep);
          if (depFactory && isTransient(depFactory)) {
            this.warnings.push(new ScopeMismatchWarning(key, dep));
          }
        }
      }

      // Cache singleton
      if (!isTransient(factory)) {
        this.cache.set(key, instance);
      }

      // Call onInit if present
      if (hasOnInit(instance)) {
        const initResult = instance.onInit();
        // If onInit returns a promise, we don't await it here (sync resolution)
        // Users should use preload() for async init
        if (initResult instanceof Promise) {
          initResult.catch(() => {
            // onInit errors are swallowed during lazy resolution
            // Use preload() to catch async init errors
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
      this.resolving.delete(key);
    }
  }

  isResolved(key: string): boolean {
    return this.cache.has(key);
  }

  getDepGraph(): Map<string, string[]> {
    return new Map(this.depGraph);
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

  getWarnings(): ScopeMismatchWarning[] {
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

  /**
   * Creates a Proxy that records which keys a factory accesses.
   * This builds the dependency graph automatically.
   */
  private createTrackingProxy(
    factoryKey: string,
    deps: string[],
    chain: string[],
  ): unknown {
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop === 'symbol') return undefined;
          const depKey = prop;
          deps.push(depKey);
          return this.resolve(depKey, chain);
        },
      },
    );
  }

  /** Look up a factory in this resolver or its parent chain. */
  private getFactory(key: string): Factory | undefined {
    return this.factories.get(key) ?? this.parent?.getFactory(key);
  }
}
