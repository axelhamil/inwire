import { describe, expect, expectTypeOf, it } from 'vitest';
import { container } from '../src/index.js';

describe('ContainerBuilder.merge()', () => {
  describe('runtime', () => {
    it('copies all factories from a standalone builder', () => {
      const dbModule = container()
        .add('db', () => 'postgres')
        .add('cache', () => new Map<string, string>());

      const app = container()
        .add('logger', () => 'console')
        .merge(dbModule)
        .build();

      expect(app.logger).toBe('console');
      expect(app.db).toBe('postgres');
      expect(app.cache).toBeInstanceOf(Map);
    });

    it('merged factories can consume deps registered in the host builder', () => {
      const consumerModule = container().add('greeter', (c: { name: string }) => `hello ${c.name}`);

      const app = container()
        .add('name', () => 'world')
        .merge(consumerModule)
        .build();

      expect(app.greeter).toBe('hello world');
    });

    it('host factories can consume deps merged from another builder', () => {
      const dbModule = container().add('db', () => ({ host: 'localhost' }));

      const app = container()
        .merge(dbModule)
        .add('url', (c) => `pg://${c.db.host}`)
        .build();

      expect(app.url).toBe('pg://localhost');
    });

    it('overrides duplicate keys with the merged factory (last write wins)', () => {
      const overrideModule = container().add('value', () => 'merged');

      const app = container()
        .add('value', () => 'original')
        .merge(overrideModule)
        .build();

      expect(app.value).toBe('merged');
    });

    it('merge is composable in chains', () => {
      const a = container().add('a', () => 1);
      const b = container().add('b', () => 2);
      const c = container().add('c', () => 3);

      const app = container().merge(a).merge(b).merge(c).build();

      expect(app.a).toBe(1);
      expect(app.b).toBe(2);
      expect(app.c).toBe(3);
    });

    it('preserves transient marker when merging an addTransient factory', () => {
      let counter = 0;
      const counterModule = container().addTransient('id', () => ++counter);

      const app = container().merge(counterModule).build();

      expect(app.id).toBe(1);
      expect(app.id).toBe(2);
      expect(app.id).toBe(3);
    });
  });

  describe('typing', () => {
    it('accumulates the merged type into the host builder', () => {
      const dbModule = container().add('db', () => 'postgres');
      const app = container()
        .add('logger', () => ({ log: (m: string) => m }))
        .merge(dbModule)
        .build();

      expectTypeOf(app.logger).toEqualTypeOf<{ log: (m: string) => string }>();
      expectTypeOf(app.db).toEqualTypeOf<string>();
    });

    it('subsequent .add() factories see merged keys in c', () => {
      const dbModule = container().add('db', () => ({ q: () => 'r' }));

      const app = container()
        .merge(dbModule)
        .add('repo', (c) => {
          expectTypeOf(c.db).toEqualTypeOf<{ q: () => string }>();
          return c.db.q();
        })
        .build();

      expect(app.repo).toBe('r');
    });
  });
});
