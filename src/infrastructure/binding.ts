import type { Factory } from '../domain/types.js';

/**
 * Symbol carrying a binding's teardown metadata on its factory. Like the transient
 * marker, it rides on the factory itself so it survives `merge()`, `module()`,
 * `extend()` and `scope()` (which all copy factories by reference) and realm or
 * bundler duplication.
 */
const BINDING_MARKER = Symbol.for('inwire:binding');

export interface BindingMeta {
  /** Teardown hook declared with `.add(key, value, { dispose })`. */
  dispose?: (instance: unknown) => unknown;
  /** Present for eager bindings: the instance given to `.add()` at build time. */
  eager?: { value: unknown };
}

/** Wraps a factory so it carries `meta`, leaving the caller's function untouched. */
export function describeBinding(factory: Factory, meta: BindingMeta): Factory {
  const wrapper = ((container: unknown) => factory(container)) as Factory & {
    [BINDING_MARKER]: BindingMeta;
  };
  wrapper[BINDING_MARKER] = meta;
  return wrapper;
}

/** Reads the metadata attached by {@link describeBinding}, if any. */
export function bindingMeta(factory: Factory | undefined): BindingMeta | undefined {
  return (factory as { [BINDING_MARKER]?: BindingMeta } | undefined)?.[BINDING_MARKER];
}
