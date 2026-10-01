/**
 * inwire: type-safe dependency injection for TypeScript.
 * Zero ceremony, full inference, no decorators, no tokens. Built-in introspection for AI tooling.
 *
 * @example One module per business module, one composition root per app:
 * ```typescript
 * import { container, defineModule } from 'inwire';
 *
 * // users.module.ts: declares what it consumes, checked by addModule()
 * export const usersModule = defineModule<{ pool: Pool }>()((b) =>
 *   b.add('users', (c) => new UserRepository(c.pool)),
 * );
 *
 * // api.ts: the composition root returns the builder, so tests can override()
 * export const createApi = () =>
 *   container({ disposeTimeout: 5_000 })
 *     .add('pool', () => new Pool(), { dispose: (pool) => pool.end() })
 *     .addModule(usersModule);
 *
 * const app = createApi().build();
 * app.users; // lazy, singleton, fully typed
 * process.on('SIGTERM', () => void app.dispose());
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
  ContainerDisposedError,
  ContainerError,
  DisposeTimeoutError,
  DuplicateKeyError,
  FactoryError,
  ProviderNotFoundError,
  ReservedKeyError,
  ScopeMismatchWarning,
  TopologicalSortError,
  UndefinedReturnError,
} from './domain/errors.js';
export type { OnDestroy, OnInit } from './domain/lifecycle.js';
export type {
  AppDeps,
  BindingOptions,
  Container,
  ContainerGraph,
  ContainerHealth,
  ContainerOptions,
  ContainerWarning,
  Factory,
  IContainer,
  IContainerBuilder,
  ProviderInfo,
  ScopeOptions,
} from './domain/types.js';
export { transient } from './infrastructure/transient.js';
