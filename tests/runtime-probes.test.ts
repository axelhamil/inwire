import { describe, expect, it, vi } from 'vitest';
import { container, ProviderNotFoundError } from '../src/index.js';

const buildApp = () =>
  container()
    .add('db', () => 'postgres')
    .build();

describe('a container is not a thenable', () => {
  it('awaiting a container gives the container', async () => {
    const app = buildApp();

    expect(await app).toBe(app);
  });

  it('an async function can return a container', async () => {
    const createApp = async () => buildApp();

    const app = await createApp();

    expect(app.db).toBe('postgres');
  });

  it('awaiting a scope or an extended container gives it back', async () => {
    const app = buildApp();
    const scoped = app.scope({ requestId: () => 'req-1' });
    const extended = app.extend({ cache: () => new Map() });

    expect(await scoped).toBe(scoped);
    expect(await extended).toBe(extended);
    expect((await scoped).db).toBe('postgres');
  });

  it('a factory can await the container it receives', async () => {
    const app = container()
      .add('db', () => 'postgres')
      .add('ready', async (c) => {
        await c;
        return c.db;
      })
      .build();

    expect(await app.ready).toBe('postgres');
    expect(app.inspect().providers.ready?.deps).toEqual(['db']);
  });

  it('a disposed container can still be awaited', async () => {
    const app = buildApp();
    await app.dispose();

    expect(await app).toBe(app);
  });

  it('a binding the user names then stays readable', () => {
    const app = container()
      .add('then', () => 'after')
      .build();

    expect(app.then).toBe('after');
    expect(app.scope({ id: () => 1 }).then).toBe('after');
  });

  it('a key nobody probes still fails with its suggestion', () => {
    const app = buildApp();

    // @ts-expect-error 'dbb' is not registered
    expect(() => app.dbb).toThrow(ProviderNotFoundError);
  });
});

describe('a container goes through the test runner untouched', () => {
  it('compares with toEqual and as a mock argument', () => {
    const app = buildApp();
    const handler = vi.fn();

    handler(app);

    expect(app).toEqual(app);
    expect(handler).toHaveBeenCalledWith(app);
    expect(Reflect.get(app, 'asymmetricMatch')).toBeUndefined();
  });

  it('prints in a snapshot', () => {
    const scoped = buildApp().scope({ requestId: () => 'req-1' });

    expect(scoped).toMatchInlineSnapshot(`{}`);
  });
});
