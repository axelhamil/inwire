import type { Factory } from '../domain/types.js';

/**
 * Symbol used to mark a factory as transient.
 * Transient factories create a new instance on every access.
 */
export const TRANSIENT_MARKER = Symbol.for('deps-injector:transient');

/**
 * A factory wrapper that marks it as transient.
 */
export interface TransientFactory<T = any> {
  (container: any): T;
  [TRANSIENT_MARKER]: true;
}

/**
 * Wraps a factory function to produce a new instance on every access,
 * instead of the default singleton behavior.
 *
 * @example
 * ```typescript
 * import { createContainer, transient } from 'deps-injector';
 *
 * const container = createContainer({
 *   logger: () => new LoggerService(),                  // singleton (default)
 *   requestId: transient(() => crypto.randomUUID()),   // new instance every access
 * });
 *
 * container.requestId; // 'abc-123'
 * container.requestId; // 'def-456' (different!)
 * ```
 */
export function transient<T>(factory: Factory<T>): Factory<T> {
  const wrapper = ((container: any) => factory(container)) as TransientFactory<T>;
  wrapper[TRANSIENT_MARKER] = true;
  return wrapper;
}

/** Checks if a factory is marked as transient. */
export function isTransient(factory: unknown): factory is TransientFactory {
  return (
    typeof factory === 'function' &&
    TRANSIENT_MARKER in factory &&
    (factory as any)[TRANSIENT_MARKER] === true
  );
}
