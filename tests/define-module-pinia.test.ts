import { describe, expect, expectTypeOf, it } from 'vitest';
import { container, defineModule } from '../src/index.js';

class _PiniaTestUserRepo {
  findById(id: string) {
    return { id };
  }
}
class _PiniaTestAuth {
  token() {
    return 'tk';
  }
}
class _PiniaTestSignIn {
  constructor(
    public r: _PiniaTestUserRepo,
    public a: _PiniaTestAuth,
  ) {}
}

declare module '../src/domain/types.js' {
  interface AppDeps {
    __piniaTest_IUserRepo: _PiniaTestUserRepo;
    __piniaTest_IAuth: _PiniaTestAuth;
    __piniaTest_SignIn: _PiniaTestSignIn;
  }
}

describe('defineModule() — Pinia-style augmentation', () => {
  it('cross-module forward reference type-checks via global AppDeps', () => {
    const authModule = defineModule()((b) =>
      b
        .add('__piniaTest_IUserRepo', () => new _PiniaTestUserRepo())
        .add(
          '__piniaTest_SignIn',
          (c) => new _PiniaTestSignIn(c.__piniaTest_IUserRepo, c.__piniaTest_IAuth),
        ),
    );

    const authProviderModule = defineModule()((b) =>
      b.add('__piniaTest_IAuth', () => new _PiniaTestAuth()),
    );

    const di = container().addModule(authProviderModule).addModule(authModule).build();

    expect(di.__piniaTest_SignIn.a.token()).toBe('tk');
    expect(di.__piniaTest_SignIn.r.findById('42')).toEqual({ id: '42' });
  });

  it('c is typed as AppDeps when no <TDeps> is provided', () => {
    defineModule()((b) =>
      b
        .add('__piniaTest_IUserRepo', () => new _PiniaTestUserRepo())
        .add('temp', (c) => {
          expectTypeOf(c.__piniaTest_IAuth).toEqualTypeOf<_PiniaTestAuth>();
          expectTypeOf(c.__piniaTest_SignIn).toEqualTypeOf<_PiniaTestSignIn>();
          return 1;
        }),
    );
  });

  it('explicit <TDeps> still uses local typing, not AppDeps', () => {
    interface LocalDeps {
      localOnly: { value: number };
    }
    defineModule<LocalDeps>()((b) =>
      b.add('localUse', (c) => {
        expectTypeOf(c.localOnly).toEqualTypeOf<{ value: number }>();
        // @ts-expect-error AppDeps keys NOT visible in local mode
        c.__piniaTest_IAuth;
        return c.localOnly.value;
      }),
    );
  });
});
