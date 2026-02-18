import type {
  ContainerGraph,
  ContainerHealth,
  ContainerWarning,
  IResolver,
  ProviderInfo,
} from '../domain/types.js';
import { isTransient } from '../infrastructure/transient.js';

/**
 * Builds introspection data from a Resolver instance.
 * Provides `inspect()`, `describe()`, `health()`, and `toString()`.
 */
export class Introspection {
  constructor(private readonly resolver: IResolver) {}

  /**
   * Returns the full dependency graph as a serializable JSON object.
   */
  inspect(): ContainerGraph {
    const providers: Record<string, ProviderInfo> = {};
    for (const [key, factory] of this.resolver.getFactories()) {
      providers[key] = {
        key,
        resolved: this.resolver.isResolved(key),
        deps: this.resolver.getDepGraph().get(key) ?? [],
        scope: isTransient(factory) ? 'transient' : 'singleton',
      };
    }
    const name = this.resolver.getName();
    return name ? { name, providers } : { providers };
  }

  /**
   * Returns detailed information about a specific provider.
   */
  describe(key: string): ProviderInfo {
    const factory = this.resolver.getFactories().get(key);
    if (!factory) {
      return { key, resolved: false, deps: [], scope: 'singleton' };
    }
    return {
      key,
      resolved: this.resolver.isResolved(key),
      deps: this.resolver.getDepGraph().get(key) ?? [],
      scope: isTransient(factory) ? 'transient' : 'singleton',
    };
  }

  /**
   * Returns container health status with warnings.
   */
  health(): ContainerHealth {
    const allKeys = [...this.resolver.getFactories().keys()];
    const resolvedKeys = this.resolver.getResolvedKeys();
    const resolvedSet = new Set(resolvedKeys);

    const warnings: ContainerWarning[] = this.resolver.getWarnings().map((w) => ({
      type: w.type,
      message: w.message,
      details: w.details,
    }));

    return {
      totalProviders: allKeys.length,
      resolved: resolvedKeys,
      unresolved: allKeys.filter((k) => !resolvedSet.has(k)),
      warnings,
    };
  }

  /**
   * Returns a human-readable representation of the container.
   */
  toString(): string {
    const parts: string[] = [];
    for (const [key] of this.resolver.getFactories()) {
      const resolved = this.resolver.isResolved(key);
      const deps = this.resolver.getDepGraph().get(key);
      const depsStr = deps && deps.length > 0 ? ` -> [${deps.join(', ')}]` : '';
      const status = resolved ? '(resolved)' : '(pending)';
      parts.push(`${key}${depsStr} ${status}`);
    }
    const name = this.resolver.getName();
    const label = name ? `Scope(${name})` : 'Container';
    return `${label} { ${parts.join(', ')} }`;
  }
}
