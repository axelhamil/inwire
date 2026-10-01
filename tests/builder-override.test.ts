import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { container, defineModule, ProviderNotFoundError } from '../src/index.js';

interface Db {
  query(sql: string): string;
}

const persistence = defineModule<{ db: Db }>()((b) =>
  b.add('repo', (c) => ({ find: (id: string) => c.db.query(id) })),
);

const users = defineModule<{ repo: { find(id: string): string } }>()((b) =>
  b.add('getUser', (c) => ({ execute: (id: string) => c.repo.find(id) })),
);

const createApp = () =>
  container()
    .add('db', (): Db => ({ query: (sql) => `pg:${sql}` }))
    .addModule(persistence)
    .addModule(users);

describe('builder override()', () => {
  it('injects the override into every dependent, direct or not', () => {
    const app = createApp()
      .override('db', { query: (sql) => `fake:${sql}` })
      .build();

    expect(app.repo.find('1')).toBe('fake:1');
    expect(app.getUser.execute('2')).toBe('fake:2');
  });

  it('accepts a factory that reads the other bindings', () => {
    const app = container()
      .add('config', { prefix: 'real' })
      .add('greeting', (c) => `${c.config.prefix}!`)
      .override('config', () => ({ prefix: 'test' }))
      .build();

    expect(app.greeting).toBe('test!');
  });

  it('keeps the binding type and rejects an incompatible override', () => {
    const builder = createApp();

    // @ts-expect-error a number is not a Db
    expect(() => builder.override('db', 42)).not.toThrow();

    const app = createApp()
      .override('db', { query: () => 'x' })
      .build();
    expectTypeOf(app.db).toEqualTypeOf<Db>();
  });

  it('rejects a key that is not registered, at compile time and at runtime', () => {
    const builder = createApp();

    // @ts-expect-error 'dbb' is not a registered key
    expect(() => builder.override('dbb', () => ({ query: () => '' }))).toThrow(
      ProviderNotFoundError,
    );
  });

  it('rejects a plain function for a binding whose value is a function', () => {
    const builder = container().add('stop', () => async () => {});

    // @ts-expect-error a function is a factory: wrap the value, () => async () => {}
    builder.override('stop', async () => {});

    const app = container()
      .add('stop', () => async () => {})
      .override('stop', () => async () => {})
      .build();
    expect(typeof app.stop).toBe('function');
  });

  it('replaces the dispose hook of the overridden binding', async () => {
    const realEnd = vi.fn();
    const fakeEnd = vi.fn();
    const app = container()
      .add('pool', () => ({ end: realEnd }), { dispose: (p) => p.end() })
      .override('pool', () => ({ end: fakeEnd }), { dispose: (p) => p.end() })
      .build();

    void app.pool;
    await app.dispose();

    expect(fakeEnd).toHaveBeenCalledOnce();
    expect(realEnd).not.toHaveBeenCalled();
  });
});
