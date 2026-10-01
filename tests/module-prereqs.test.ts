import { describe, expect, expectTypeOf, it } from 'vitest';
import { container, DuplicateKeyError, defineModule } from '../src/index.js';

interface Db {
  query(sql: string): string;
}

class PgDb implements Db {
  query(sql: string) {
    return `pg:${sql}`;
  }
  poolSize() {
    return 10;
  }
}

const usersModule = defineModule<{ db: Db }>()((b) =>
  b.add('users', (c) => ({ find: (id: string) => c.db.query(`select ${id}`) })),
);

describe('addModule() prerequisites', () => {
  it('rejects a module whose prerequisite is missing on the host, naming the key', () => {
    const host = container().add('logger', () => ({ log: () => {} }));

    // @ts-expect-error 'db' is a missing prerequisite of usersModule
    host.addModule(usersModule);

    type Param = Parameters<typeof host.addModule<{ db: Db }, { db: Db; users: unknown }>>[0];
    expectTypeOf<Param>().toExtend<{ 'missing prerequisites': 'db' }>();
  });

  it('rejects a prerequisite present with an incompatible type', () => {
    const host = container().add('db', () => 'not a db');

    // @ts-expect-error 'db' is a string, the module needs a Db
    host.addModule(usersModule);
  });

  it('accepts a module once its prerequisites are on the host', () => {
    const app = container()
      .add('db', () => new PgDb())
      .addModule(usersModule)
      .build();

    expect(app.users.find('1')).toBe('pg:select 1');
  });

  it('keeps the host type of a prerequisite instead of reinjecting the module view', () => {
    const app = container()
      .add('db', () => new PgDb())
      .addModule(usersModule)
      .build();

    expectTypeOf(app.db).toEqualTypeOf<PgDb>();
    expect(app.db.poolSize()).toBe(10);
  });

  it('rejects two modules providing the same key, at compile time and at runtime', () => {
    const first = defineModule<{ db: Db }>()((b) => b.add('users', () => 1));
    const host = container()
      .add('db', () => new PgDb())
      .addModule(first);

    // @ts-expect-error 'users' is already provided by the first module
    expect(() => host.addModule(usersModule)).toThrow(DuplicateKeyError);
  });

  it('a module without prerequisites composes on an empty host', () => {
    const configModule = defineModule<Record<never, never>>()((b) =>
      b.add('config', { port: 3000 }),
    );
    const app = container().addModule(configModule).build();

    expectTypeOf(app.config).toEqualTypeOf<{ port: number }>();
    expect(app.config.port).toBe(3000);
  });

  it('an inline module is typed against the host bindings', () => {
    const app = container()
      .add('a', () => 1)
      .addModule((b) => b.add('b', (c) => `${c.a}two`))
      .build();

    expectTypeOf(app.b).toEqualTypeOf<string>();
    expect(app.b).toBe('1two');
  });
});
