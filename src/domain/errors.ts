/**
 * Base class for all container errors.
 * Every error includes a human-readable `hint` and structured `details`
 * so that AI tools and developers can auto-correct issues.
 *
 * @example
 * ```typescript
 * try { container.userService; }
 * catch (e) {
 *   if (e instanceof ContainerError) {
 *     console.log(e.hint);    // actionable fix
 *     console.log(e.details); // structured context
 *   }
 * }
 * ```
 */
export abstract class ContainerError extends Error {
  abstract readonly hint: string;
  abstract readonly details: Record<string, unknown>;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when a non-function value is passed in the deps definition.
 *
 * @example
 * ```typescript
 * createContainer({ apiKey: 'sk-123' });
 * // ContainerConfigError: 'apiKey' must be a factory function, got string.
 * // hint: "Wrap it: apiKey: () => 'sk-123'"
 * ```
 */
export class ContainerConfigError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(key: string, actualType: string) {
    super(`'${key}' must be a factory function, got ${actualType}.`);
    this.hint = `Wrap it: ${key}: () => ${JSON.stringify(key === key ? `<your ${actualType} value>` : key)}`;
    this.details = { key, actualType };
  }
}

/**
 * Thrown when a reserved container method name is used as a dependency key.
 *
 * @example
 * ```typescript
 * createContainer({ inspect: () => 'foo' });
 * // ReservedKeyError: 'inspect' is a reserved container method.
 * // hint: "Rename this dependency, e.g. 'inspectService' or 'dataInspector'."
 * ```
 */
export class ReservedKeyError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(key: string, reserved: readonly string[]) {
    super(`'${key}' is a reserved container method.`);
    this.hint = `Rename this dependency, e.g. '${key}Service' or 'my${key[0].toUpperCase()}${key.slice(1)}'.`;
    this.details = { key, reserved: [...reserved] };
  }
}

/**
 * Thrown when a dependency cannot be found during resolution.
 * Includes fuzzy suggestion if a similar key exists.
 *
 * @example
 * ```typescript
 * container.userService;
 * // ProviderNotFoundError: Cannot resolve 'userService': dependency 'userRepo' not found.
 * // hint: "Did you mean 'userRepository'?"
 * ```
 */
export class ProviderNotFoundError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(
    key: string,
    chain: string[],
    registered: string[],
    suggestion?: string,
  ) {
    const chainStr =
      chain.length > 0
        ? `\n\nResolution chain: ${[...chain, `${key} (not found)`].join(' -> ')}`
        : '';
    const registeredStr = `\nRegistered keys: [${registered.join(', ')}]`;
    const suggestionStr = suggestion ? `\n\nDid you mean '${suggestion}'?` : '';

    super(
      `Cannot resolve '${chain[0] ?? key}': dependency '${key}' not found.${chainStr}${registeredStr}${suggestionStr}`,
    );

    this.hint = suggestion
      ? `Did you mean '${suggestion}'? Or add '${key}' to your container:\n  createContainer({\n    ...existing,\n    ${key}: (c) => new Your${key[0].toUpperCase()}${key.slice(1)}(/* deps */),\n  });`
      : `Add '${key}' to your container:\n  createContainer({\n    ...existing,\n    ${key}: (c) => new Your${key[0].toUpperCase()}${key.slice(1)}(/* deps */),\n  });`;
    this.details = { key, chain, registered, suggestion };
  }
}

/**
 * Thrown when a circular dependency is detected.
 *
 * @example
 * ```typescript
 * // CircularDependencyError: Circular dependency detected while resolving 'authService'.
 * // Cycle: authService -> userService -> authService
 * ```
 */
export class CircularDependencyError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(key: string, chain: string[]) {
    const cycle = [...chain, key].join(' -> ');
    super(
      `Circular dependency detected while resolving '${chain[0]}'.\n\nCycle: ${cycle}`,
    );
    this.hint = [
      'To fix:',
      '  1. Extract shared logic into a new dependency both can use',
      '  2. Restructure so one doesn\'t depend on the other',
      '  3. Use a mediator/event pattern to decouple them',
    ].join('\n');
    this.details = { key, chain, cycle };
  }
}

/**
 * Thrown when a factory function returns `undefined`.
 *
 * @example
 * ```typescript
 * container.db;
 * // UndefinedReturnError: Factory 'db' returned undefined.
 * // hint: "Did you forget a return statement?"
 * ```
 */
export class UndefinedReturnError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(key: string, chain: string[]) {
    const chainStr =
      chain.length > 1
        ? `\n\nResolution chain: ${chain.join(' -> ')}`
        : '';
    super(`Factory '${key}' returned undefined.${chainStr}`);
    this.hint =
      'Your factory function returned undefined. Did you forget a return statement?';
    this.details = { key, chain };
  }
}

/**
 * Thrown when a factory function throws an error during resolution.
 * Wraps the original error with resolution context.
 *
 * @example
 * ```typescript
 * container.db;
 * // FactoryError: Factory 'db' threw an error: "Connection refused"
 * ```
 */
export class FactoryError extends ContainerError {
  readonly hint: string;
  readonly details: Record<string, unknown>;
  readonly originalError: unknown;

  constructor(key: string, chain: string[], originalError: unknown) {
    const origMessage =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);
    const chainStr =
      chain.length > 1
        ? `\n\nResolution chain: ${[...chain.slice(0, -1), `${key} (factory threw)`].join(' -> ')}`
        : '';
    super(`Factory '${key}' threw an error: "${origMessage}"${chainStr}`);
    this.hint = `Check the factory function for '${key}'. The error occurred during instantiation.`;
    this.details = { key, chain, originalError: origMessage };
    this.originalError = originalError;
  }
}

/**
 * Warning emitted when a singleton depends on a transient dependency.
 * The transient value gets frozen inside the singleton — almost always a bug.
 *
 * @example
 * ```typescript
 * // ScopeMismatchWarning: Singleton 'userService' depends on transient 'requestId'.
 * ```
 */
export class ScopeMismatchWarning {
  readonly type = 'scope_mismatch' as const;
  readonly message: string;
  readonly hint: string;
  readonly details: Record<string, unknown>;

  constructor(singletonKey: string, transientKey: string) {
    this.message = `Singleton '${singletonKey}' depends on transient '${transientKey}'.`;
    this.hint = [
      'The transient value was resolved once and is now frozen inside the singleton.',
      'This is almost always a bug.',
      '',
      'To fix:',
      `  1. Make '${singletonKey}' transient too: transient((c) => new ${singletonKey[0].toUpperCase()}${singletonKey.slice(1)}(c.${transientKey}))`,
      `  2. Make '${transientKey}' singleton if it doesn't need to change`,
      `  3. Inject a factory instead: ${transientKey}Factory: () => () => <your value>`,
    ].join('\n');
    this.details = { singleton: singletonKey, transient: transientKey };
  }
}
