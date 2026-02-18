import type { ICycleDetector } from '../domain/types.js';

/**
 * Tracks which keys are currently being resolved to detect circular dependencies.
 * Uses a Set<string> internally — enter/leave must be balanced (use try/finally).
 */
export class CycleDetector implements ICycleDetector {
  private readonly resolving = new Set<string>();

  enter(key: string): void {
    this.resolving.add(key);
  }

  leave(key: string): void {
    this.resolving.delete(key);
  }

  isResolving(key: string): boolean {
    return this.resolving.has(key);
  }
}
