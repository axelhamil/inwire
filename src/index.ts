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

export { ContainerBuilder, container } from './application/container-builder.js';
export {
  CircularDependencyError,
  ContainerConfigError,
  ContainerError,
  FactoryError,
  ProviderNotFoundError,
  ReservedKeyError,
  ScopeMismatchWarning,
  UndefinedReturnError,
} from './domain/errors.js';
export type { OnDestroy, OnInit } from './domain/lifecycle.js';
export type {
  Container,
  ContainerGraph,
  ContainerHealth,
  ContainerWarning,
  IContainer,
  ProviderInfo,
  ScopeOptions,
} from './domain/types.js';
export { detectDuplicateKeys } from './domain/validation.js';
export { transient } from './infrastructure/transient.js';
