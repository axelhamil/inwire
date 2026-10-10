import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineModule } from '../src/index.js';
import { DEEP_CHAIN_LENGTH, deepChain } from './fixtures/deep-chain.js';

/**
 * Guards the reading depth of a key in a long chain. Every case reads `k0`, declared
 * 400 bindings earlier: if the accumulated type nests one level per binding again,
 * the read raises TS2589 and `k0` becomes `any`, which `toEqualTypeOf` refuses.
 */
describe('a key declared 400 bindings earlier keeps its type', () => {
  it('in a factory given to add()', () => {
    const app = deepChain()
      .add('far', (c) => {
        expectTypeOf(c.k0).toEqualTypeOf<0>();
        expectTypeOf(c.k200).toEqualTypeOf<200>();
        return c.k0;
      })
      .build();

    expectTypeOf(app.far).toEqualTypeOf<0>();
    expect(app.far).toBe(0);
  });

  it('through addModule(), in the module and after it', () => {
    const farModule = defineModule<{ k0: 0 }>()((b) => b.add('fromModule', (c) => c.k0));

    const app = deepChain()
      .addModule(farModule)
      .add('afterModule', (c) => {
        expectTypeOf(c.k0).toEqualTypeOf<0>();
        expectTypeOf(c.fromModule).toEqualTypeOf<0>();
        return c.k1;
      })
      .build();

    expectTypeOf(app.afterModule).toEqualTypeOf<1>();
    expect(app.fromModule).toBe(0);
    expect(app.afterModule).toBe(1);
  });

  it('on the built container', () => {
    const app = deepChain().build();

    expectTypeOf(app.k0).toEqualTypeOf<0>();
    expectTypeOf(app.k399).toEqualTypeOf<399>();
    expect(app.size).toBe(DEEP_CHAIN_LENGTH);
    expect(app.k0).toBe(0);
  });

  it('in a scope() factory and on the scope', () => {
    const scoped = deepChain()
      .build()
      .scope({
        fromParent: (c) => {
          expectTypeOf(c.k0).toEqualTypeOf<0>();
          return c.k0;
        },
      });

    expectTypeOf(scoped.fromParent).toEqualTypeOf<0>();
    expectTypeOf(scoped.k0).toEqualTypeOf<0>();
    expect(scoped.fromParent).toBe(0);
  });
});
