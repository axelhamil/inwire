/**
 * deps-injector — AI-First dependency injection.
 * Zero ceremony, full TypeScript inference, no decorators, no tokens.
 *
 * @example
 * ```typescript
 * import { createContainer, transient } from 'deps-injector';
 *
 * const container = createContainer({
 *   logger: () => new LoggerService(),
 *   db: () => new Database(process.env.DB_URL!),
 *   userRepo: (c): UserRepository => new PgUserRepo(c.db),
 *   userService: (c) => new UserService(c.userRepo, c.logger),
 * });
 *
 * container.userService; // lazy, singleton, fully typed
 * ```
 *
 * @packageDocumentation
 */

// Core API
export { createContainer } from './application/create-container.js';
export { transient } from './infrastructure/transient.js';

// Types
export type {
  Container,
  ContainerGraph,
  ContainerHealth,
  ContainerWarning,
  DepsDefinition,
  Factory,
  IContainer,
  ProviderInfo,
  ResolvedDeps,
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
