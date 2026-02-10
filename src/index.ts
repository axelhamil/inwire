/**
 * inwire — AI-First dependency injection.
 * Zero ceremony, full TypeScript inference, no decorators, no tokens.
 *
 * @example
 * ```typescript
 * import { container, transient } from 'inwire';
 *
 * const app = container()
 *   .add('logger', () => new LoggerService())
 *   .add('db', (c) => new Database(c.logger))
 *   .build();
 *
 * app.db; // lazy, singleton, fully typed
 * ```
 *
 * @packageDocumentation
 */

// Core API
export { container, ContainerBuilder } from './application/container-builder.js';
export { transient } from './infrastructure/transient.js';

// Types
export type {
  Container,
  ContainerGraph,
  ContainerHealth,
  ContainerWarning,
  IContainer,
  ProviderInfo,
  ScopeOptions,
} from './domain/types.js';

// Lifecycle interfaces
export type { OnInit, OnDestroy } from './domain/lifecycle.js';

// Errors (classes, so exported as values)
export {
  ContainerError,
  ContainerConfigError,
  ReservedKeyError,
  ProviderNotFoundError,
  CircularDependencyError,
  UndefinedReturnError,
  FactoryError,
  ScopeMismatchWarning,
} from './domain/errors.js';

// Validation utilities
export { detectDuplicateKeys } from './domain/validation.js';
