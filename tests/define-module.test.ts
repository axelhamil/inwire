import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  container,
  defineModule,
  type InferModuleBuilt,
  type InferModuleDeps,
  type Module,
} from '../src/index.js';

describe('defineModule()', () => {
  describe('runtime', () => {
    it('produces a module function compatible with addModule()', () => {
      const loggerModule = defineModule()((b) =>
        b.add('logger', () => ({ log: (msg: string) => `LOG: ${msg}` })),
      );

      const c = container().addModule(loggerModule).build();

      expect(c.logger.log('hello')).toBe('LOG: hello');
    });

    it('declares prerequisites and consumes them in factories', () => {
      interface Logger {
        log: (msg: string) => string;
      }

      const dbModule = defineModule<{ logger: Logger }>()((b) =>
        b.add('db', (c) => ({
          query: (sql: string) => `[${c.logger.log(sql)}] result`,
        })),
      );

      const c = container()
        .add('logger', () => ({ log: (msg: string) => msg.toUpperCase() }))
        .addModule(dbModule)
        .build();

      expect(c.db.query('select')).toBe('[SELECT] result');
    });

    it('chains multiple modules in any order respecting prereqs', () => {
      interface Logger {
        log: (msg: string) => void;
      }
      interface DB {
        query: (sql: string) => string;
      }

      const loggerModule = defineModule()((b) =>
        b.add('logger', (): Logger => ({ log: () => {} })),
      );
      const dbModule = defineModule<{ logger: Logger }>()((b) =>
        b.add('db', (): DB => ({ query: (sql) => `r:${sql}` })),
      );
      const userModule = defineModule<{ db: DB; logger: Logger }>()((b) =>
        b.add('users', (c) => ({
          find: (id: string) => c.db.query(`SELECT * FROM users WHERE id='${id}'`),
        })),
      );

      const app = container()
        .addModule(loggerModule)
        .addModule(dbModule)
        .addModule(userModule)
        .build();

      expect(app.users.find('42')).toBe(`r:SELECT * FROM users WHERE id='42'`);
    });

    it('module without prerequisites uses default empty object generic', () => {
      const m = defineModule()((b) => b.add('answer', () => 42));
      const c = container().addModule(m).build();
      expect(c.answer).toBe(42);
    });

    it('accumulates types within a single module across multiple .add() calls', () => {
      const m = defineModule()((b) =>
        b
          .add('a', () => 1)
          .add('b', (c) => c.a + 1)
          .add('c', (c) => c.a + c.b),
      );

      const built = container().addModule(m).build();

      expect(built.a).toBe(1);
      expect(built.b).toBe(2);
      expect(built.c).toBe(3);
    });
  });

  describe('typing', () => {
    it('infers TBuilt from chained .add() calls', () => {
      const m = defineModule()((b) => b.add('x', () => 'hello').add('y', () => 42));

      type Built = InferModuleBuilt<typeof m>;
      expectTypeOf<Built>().toEqualTypeOf<{ x: string; y: number }>();
    });

    it('extracts prerequisite deps via InferModuleDeps', () => {
      const m = defineModule<{ logger: { log: (m: string) => void } }>()((b) =>
        b.add('svc', (c) => ({ run: () => c.logger.log('run') })),
      );

      type Deps = InferModuleDeps<typeof m>;
      expectTypeOf<Deps>().toEqualTypeOf<{ logger: { log: (m: string) => void } }>();
    });

    it('container exposes full union of bindings after addModule()', () => {
      interface Logger {
        log: (m: string) => void;
      }

      const dbModule = defineModule<{ logger: Logger }>()((b) => b.add('db', () => 'postgres'));

      const c = container()
        .add('logger', (): Logger => ({ log: () => {} }))
        .addModule(dbModule)
        .build();

      expectTypeOf(c.logger).toEqualTypeOf<Logger>();
      expectTypeOf(c.db).toEqualTypeOf<string>();
    });

    it('Module<TDeps, TBuilt> is assignable to addModule() argument', () => {
      const m: Module<{ a: number }, { a: number; b: string }> = defineModule<{ a: number }>()(
        (b) => b.add('b', (c) => `n=${c.a}`),
      );

      const c = container()
        .add('a', () => 1)
        .addModule(m)
        .build();
      expect(c.b).toBe('n=1');
    });
  });
});
