/**
 * inwire — Type-safe dependency injection for TypeScript.
 * Zero ceremony, full inference, no decorators, no tokens. Built-in introspection for AI tooling.
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
export type {
  InferModuleBuilt,
  InferModuleDeps,
  Module,
} from './application/define-module.js';
export { defineModule } from './application/define-module.js';
export {
  AsyncInitErrorWarning,
  CircularDependencyError,
  ContainerConfigError,
  ContainerError,
  DuplicateKeyError,
  FactoryError,
  ProviderNotFoundError,
  ReservedKeyError,
  ScopeMismatchWarning,
  UndefinedReturnError,
} from './domain/errors.js';
export type { OnDestroy, OnInit } from './domain/lifecycle.js';
export type {
  AppDeps,
  Container,
  ContainerGraph,
  ContainerHealth,
  ContainerWarning,
  Factory,
  IContainer,
  IContainerBuilder,
  ProviderInfo,
  ScopeOptions,
} from './domain/types.js';
export { transient } from './infrastructure/transient.js';
