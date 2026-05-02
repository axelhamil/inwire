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
  // biome-ignore lint/complexity/noBannedTypes: {} is the correct generic default for "no required deps"
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TDeps extends Record<string, any> = {},
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TBuilt extends Record<string, any> = TDeps,
> = (
  builder: ContainerBuilder<Record<string, unknown>, TDeps>,
) => ContainerBuilder<Record<string, unknown>, TBuilt>;

/**
 * Defines a reusable, strongly-typed module without importing the host's deps interface.
 *
 * Pattern: `defineModule<Prerequisites>()(builder => builder.add(...))`.
 * Prerequisites are declared **locally**, not pulled from a global `AppDeps`.
 * The output type is **inferred** from the chained `.add()` calls — no manual signature.
 *
 * @example
 * ```typescript
 * import { defineModule } from 'inwire';
 *
 * const billingModule = defineModule<{ eventBus: EventBus }>()((b) =>
 *   b.add('subscribeUseCase', (c) => new SubscribeUseCase(c.eventBus)),
 * );
 *
 * const di = container()
 *   .add('eventBus', () => new EventBus())
 *   .addModule(billingModule)
 *   .build();
 * ```
 */
export function defineModule<
  // biome-ignore lint/complexity/noBannedTypes: {} is the correct generic default for "no prerequisites"
  // biome-ignore lint/suspicious/noExplicitAny: `any` allows interfaces without index signatures
  TDeps extends Record<string, any> = {},
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
