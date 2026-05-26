import type { Factory, IValidator } from '../domain/types.js';
import { CycleDetector } from '../infrastructure/cycle-detector.js';
import { DependencyTracker } from '../infrastructure/dependency-tracker.js';
import { Resolver } from '../infrastructure/resolver.js';

/**
 * Builds new resolvers for `.extend()` calls.
 *
 * **Composition Root.** Instantiates concrete `Resolver` + `CycleDetector` +
 * `DependencyTracker`. Authorized alongside `container-builder.ts`,
 * `container-proxy.ts`, and `scoper.ts`.
 *
 * Extended semantics:
 * - Factory map is merged (existing keys overridden by new ones — same as
 *   `.add()` over an existing key).
 * - Singleton cache and `initCalled` state are snapshot-copied (instances are
 *   shared, no parent chain).
 * - Ideal for plugins, feature modules, or test overrides.
 */
export class Extender {
  constructor(private readonly validator: IValidator) {}

  extend(base: Resolver, extra: Record<string, (c: unknown) => unknown>): Resolver {
    this.validator.validateConfig(extra);

    const merged = new Map(base.getFactories());
    for (const [key, factory] of Object.entries(extra)) {
      merged.set(key, factory as Factory);
    }

    return new Resolver({
      factories: merged,
      cache: new Map(base.getCache()),
      initCalled: base.getInitCalled(),
      cycleDetector: new CycleDetector(),
      dependencyTracker: new DependencyTracker(),
      validator: this.validator,
    });
  }
}
