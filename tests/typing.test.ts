import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CircularDependencyError,
  ContainerConfigError,
  container,
  FactoryError,
  ProviderNotFoundError,
  ReservedKeyError,
  UndefinedReturnError,
} from '../src/index.js';

describe('TypeScript type inference', () => {
  it('infers correct types for simple factories', () => {
    const c = container()
      .add('num', () => 42)
      .add('str', () => 'hello')
      .add('obj', () => ({ x: 1, y: 2 }))
      .build();

    expectTypeOf(c.num).toEqualTypeOf<number>();
    expectTypeOf(c.str).toEqualTypeOf<string>();
    expectTypeOf(c.obj).toEqualTypeOf<{ x: number; y: number }>();
  });

  it('infers types through dependency chains', () => {
    const c = container()
      .add('base', () => 10)
      .add('doubled', (c) => c.base * 2)
      .build();

    // doubled's type is inferred from the return of the factory
    expect(typeof c.doubled).toBe('number');
  });

  it('respects explicit return type annotations (interface-first)', () => {
    interface Repository {
      findById(id: string): string;
    }

    class PgRepo implements Repository {
      findById(id: string) {
        return `pg:${id}`;
      }
      pgSpecific() {
        return 'pg';
      }
    }

    const c = container()
      .add('repo', (): Repository => new PgRepo())
      .build();

    // The type is Repository, not PgRepo
    expectTypeOf(c.repo).toEqualTypeOf<Repository>();
  });

  it('transient preserves return type', () => {
    const c = container()
      .addTransient('id', () => crypto.randomUUID())
      .build();

    expectTypeOf(c.id).toEqualTypeOf<string>();
  });

  it('scope extends the container type', () => {
    const parent = container()
      .add('db', () => 'postgres')
      .build();

    const child = parent.scope({
      requestId: () => 'req-123',
    });

    expectTypeOf(child.db).toEqualTypeOf<string>();
    expectTypeOf(child.requestId).toEqualTypeOf<string>();
  });

  it('extend extends the container type', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    const extended = base.extend({
      b: () => 'hello',
    });

    expectTypeOf(extended.a).toEqualTypeOf<number>();
    expectTypeOf(extended.b).toEqualTypeOf<string>();
  });

  it('scope override replaces type instead of intersecting', () => {
    const parent = container()
      .add('value', () => 'hello')
      .build();

    const child = parent.scope({
      value: () => 42,
    });

    expectTypeOf(child.value).toEqualTypeOf<number>();
  });

  it('extend override replaces type instead of intersecting', () => {
    const base = container()
      .add('value', () => 'hello')
      .build();

    const extended = base.extend({
      value: () => 42,
    });

    expectTypeOf(extended.value).toEqualTypeOf<number>();
  });

  it('error details have correct types', () => {
    const configError = new ContainerConfigError('key', 'string');
    expectTypeOf(configError.details.key).toBeString();
    expectTypeOf(configError.details.actualType).toBeString();

    const notFoundError = new ProviderNotFoundError('key', ['a'], ['b'], 'c');
    expectTypeOf(notFoundError.details.key).toBeString();
    expectTypeOf(notFoundError.details.chain).toEqualTypeOf<string[]>();
    expectTypeOf(notFoundError.details.registered).toEqualTypeOf<string[]>();
    expectTypeOf(notFoundError.details.suggestion).toEqualTypeOf<string | undefined>();

    const circularError = new CircularDependencyError('key', ['a']);
    expectTypeOf(circularError.details.key).toBeString();
    expectTypeOf(circularError.details.chain).toEqualTypeOf<string[]>();
    expectTypeOf(circularError.details.cycle).toBeString();

    const factoryError = new FactoryError('key', ['a'], new Error('test'));
    expectTypeOf(factoryError.details.key).toBeString();
    expectTypeOf(factoryError.details.chain).toEqualTypeOf<string[]>();
    expectTypeOf(factoryError.details.originalError).toBeString();

    const undefinedError = new UndefinedReturnError('key', ['a']);
    expectTypeOf(undefinedError.details.key).toBeString();
    expectTypeOf(undefinedError.details.chain).toEqualTypeOf<string[]>();

    const reservedError = new ReservedKeyError('scope', ['scope']);
    expectTypeOf(reservedError.details.key).toBeString();
    expectTypeOf(reservedError.details.reserved).toEqualTypeOf<string[]>();
  });

  it('preload and reset accept keyof T', () => {
    const c = container()
      .add('db', () => 'postgres')
      .add('cache', () => new Map())
      .build();

    // These should compile — keyof T restricts to 'db' | 'cache'
    expectTypeOf(c.preload).parameter(0).toEqualTypeOf<'db' | 'cache'>();
    expectTypeOf(c.reset).parameter(0).toEqualTypeOf<'db' | 'cache'>();
  });

  it('empty builder produces typed container with methods', () => {
    const c = container().build();

    // Container methods still exist on empty container
    expectTypeOf(c.inspect).toBeFunction();
    expectTypeOf(c.dispose).toBeFunction();
    expectTypeOf(c.health).toBeFunction();
  });
});

describe('Builder type safety', () => {
  it('c in factory knows previously added deps', () => {
    const c = container()
      .add('a', () => 42)
      .add('b', (c) => {
        expectTypeOf(c.a).toEqualTypeOf<number>();
        return c.a + 1;
      })
      .build();

    expect(c.b).toBe(43);
  });

  it('contract mode constrains keys and return types', () => {
    interface AppDeps {
      logger: { log: (msg: string) => void };
      db: string;
    }

    const c = container<AppDeps>()
      .add('logger', () => ({ log: (_msg: string) => {} }))
      .add('db', () => 'postgres')
      .build();

    expectTypeOf(c.logger).toEqualTypeOf<{ log: (msg: string) => void }>();
    expectTypeOf(c.db).toEqualTypeOf<string>();
  });

  it('instance (non-function) values are registered eagerly', () => {
    const c = container()
      .add('config', { port: 3000, host: 'localhost' })
      .add('url', (c) => `${c.config.host}:${c.config.port}`)
      .build();

    expect(c.config).toEqual({ port: 3000, host: 'localhost' });
    expect(c.url).toBe('localhost:3000');
  });

  it('addTransient works on builder', () => {
    let counter = 0;
    const c = container()
      .addTransient('id', () => ++counter)
      .build();

    expect(c.id).toBe(1);
    expect(c.id).toBe(2);
  });

  it('reserved key in add() throws runtime ReservedKeyError', () => {
    expect(() => container().add('scope' as any, () => 'x')).toThrow(ReservedKeyError);
  });

  it('c in scope/extend is typed as the parent', () => {
    const app = container()
      .add('logger', () => ({ log: (msg: string) => msg }))
      .add('db', () => 'postgres')
      .build();

    const scoped = app.scope({
      handler: (c) => {
        expectTypeOf(c.logger).toEqualTypeOf<{ log: (msg: string) => string }>();
        expectTypeOf(c.db).toEqualTypeOf<string>();
        return 'handled';
      },
    });

    expect(scoped.handler).toBe('handled');

    const extended = app.extend({
      cache: (c) => {
        expectTypeOf(c.logger).toEqualTypeOf<{ log: (msg: string) => string }>();
        return 'cached';
      },
    });

    expect(extended.cache).toBe('cached');
  });
});
