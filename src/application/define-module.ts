import type { AppDeps } from '../domain/types.js';
import type { ContainerBuilder } from './container-builder.js';

/**
 * A reusable module: a function that extends a builder with new bindings.
 *
 * `TDeps` are the bindings the module **expects already present** on the target builder.
 * `TBuilt` is the full set of bindings present after the module is applied (`TDeps` + what the module adds).
 *
 * Use {@link defineModule} to build a `Module` with strong inference.
 */
export type Module<
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TDeps extends Record<string, any> = AppDeps,
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TBuilt extends Record<string, any> = TDeps,
> = (
  builder: ContainerBuilder<Record<string, unknown>, TDeps>,
) => ContainerBuilder<Record<string, unknown>, TBuilt>;

/**
 * Defines a reusable, strongly-typed module.
 *
 * Two modes, picked by whether you pass `<TDeps>` explicitly:
 *
 * - **Global mode** (`defineModule()`, no generic): `c` is typed as `AppDeps`,
 *   the augmentable global interface. Each module file augments `AppDeps` with
 *   what it provides via `declare module 'inwire' { interface AppDeps { … } }`.
 *   Cross-module forward references work transparently — `c.X` resolves even
 *   when `X` is added by another module.
 * - **Local mode** (`defineModule<TDeps>()`): `c` is typed as `TDeps`, declared
 *   locally inline. No global augmentation needed. Use when the module's
 *   prerequisites are a tight, fixed surface.
 *
 * The output type is always **inferred** from the chained `.add()` calls.
 *
 * @example Global mode (Pinia-style):
 * ```typescript
 * declare module 'inwire' {
 *   interface AppDeps {
 *     IUserRepository: IUserRepository;
 *     SignInUseCase: SignInUseCase;
 *   }
 * }
 *
 * export const authModule = defineModule()((b) =>
 *   b
 *     .add('IUserRepository', () => new DrizzleUserRepository())
 *     .add('SignInUseCase', (c) => new SignInUseCase(c.IUserRepository, c.IAuthProvider)),
 *   //                                                                   ^^^^^^^^^^^^^^^
 *   //                                          provided by another module — typed via AppDeps
 * );
 * ```
 *
 * @example Local mode (explicit prerequisites):
 * ```typescript
 * const billingModule = defineModule<{ eventBus: EventBus }>()((b) =>
 *   b.add('subscribeUseCase', (c) => new SubscribeUseCase(c.eventBus)),
 * );
 * ```
 */
export function defineModule<
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TDeps extends Record<string, any> = AppDeps,
>() {
  return <
    // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
    TBuilt extends Record<string, any>,
  >(
    fn: (
      builder: ContainerBuilder<Record<string, unknown>, TDeps>,
    ) => ContainerBuilder<Record<string, unknown>, TBuilt>,
  ): Module<TDeps, TBuilt> => fn;
}

/**
 * Extracts the prerequisite deps of a `Module`.
 */
// biome-ignore lint/suspicious/noExplicitAny: variance helper
export type InferModuleDeps<M> = M extends Module<infer D, any> ? D : never;

/**
 * Extracts the full set of bindings present after a `Module` is applied
 * (prerequisites + bindings the module adds).
 */
// biome-ignore lint/suspicious/noExplicitAny: variance helper
export type InferModuleBuilt<M> = M extends Module<any, infer B> ? B : never;
