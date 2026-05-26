/**
 * Internal collaborator interfaces — implemented by `infrastructure/` classes,
 * consumed by `application/` orchestrators. NOT part of the public API.
 *
 * Users should never need to import these. They exist so application code
 * depends on contracts, not on concrete `Resolver` / `CycleDetector` / etc.
 */

import type { AnyWarning } from '../errors.js';
import type { Factory } from './public.js';

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
