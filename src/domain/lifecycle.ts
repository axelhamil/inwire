/**
 * Implement this interface (or just add an `onInit` method) to run
 * initialization logic when the dependency is first resolved.
 *
 * @example
 * ```typescript
 * class Database implements OnInit {
 *   async onInit() { await this.connect(); }
 * }
 * ```
 */
export interface OnInit {
  onInit(): void | Promise<void>;
}

/**
 * Implement this interface (or just add an `onDestroy` method) to run
 * cleanup logic when `container.dispose()` is called.
 *
 * @example
 * ```typescript
 * class Database implements OnDestroy {
 *   async onDestroy() { await this.disconnect(); }
 * }
 * ```
 */
export interface OnDestroy {
  onDestroy(): void | Promise<void>;
}

/** Duck-type check: does the value have an `onInit` method? */
export function hasOnInit(value: unknown): value is OnInit {
  return (
    value !== null &&
    typeof value === 'object' &&
    'onInit' in value &&
    typeof (value as any).onInit === 'function'
  );
}

/** Duck-type check: does the value have an `onDestroy` method? */
export function hasOnDestroy(value: unknown): value is OnDestroy {
  return (
    value !== null &&
    typeof value === 'object' &&
    'onDestroy' in value &&
    typeof (value as any).onDestroy === 'function'
  );
}
