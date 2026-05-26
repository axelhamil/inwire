import type { Factory, IValidator, ScopeOptions } from '../domain/types.js';
import { CycleDetector } from '../infrastructure/cycle-detector.js';
import { DependencyTracker } from '../infrastructure/dependency-tracker.js';
import { Resolver } from '../infrastructure/resolver.js';

/**
 * Builds child resolvers for `.scope()` calls.
 *
 * **Composition Root.** Instantiates concrete `Resolver` + `CycleDetector` +
 * `DependencyTracker`. Authorized alongside `container-builder.ts`,
 * `container-proxy.ts`, and `extender.ts`.
 *
 * Child semantics:
 * - Own cache (isolated from parent) — parent singletons are reused on cache
 *   miss via the resolver's parent chain.
 * - Overriding a key shadows the parent; the parent's cached instance is
 *   untouched.
 * - Ideal for per-request / per-job isolation (e.g. `requestId`, `traceId`).
 */
export class Scoper {
  constructor(private readonly validator: IValidator) {}

  scope(
    parent: Resolver,
    extra: Record<string, (c: unknown) => unknown>,
    options?: ScopeOptions,
  ): Resolver {
    this.validator.validateConfig(extra);

    const childFactories = new Map<string, Factory>();
    for (const [key, factory] of Object.entries(extra)) {
      childFactories.set(key, factory as Factory);
    }

    return new Resolver({
      factories: childFactories,
      parent,
      name: options?.name,
      cycleDetector: new CycleDetector(),
      dependencyTracker: new DependencyTracker(),
      validator: this.validator,
    });
  }
}
