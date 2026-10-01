import { describe, expect, it, vi } from 'vitest';
import { ContainerDisposedError, ContainerError, container } from '../src/index.js';

describe('access after dispose()', () => {
  it('throws ContainerDisposedError without calling the factory again', async () => {
    const factory = vi.fn(() => ({ id: 1 }));
    const app = container().add('service', factory).build();

    void app.service;
    await app.dispose();

    expect(() => app.service).toThrow(ContainerDisposedError);
    expect(factory).toHaveBeenCalledOnce();
  });

  it('carries the key, a hint and structured details', async () => {
    const app = container()
      .add('db', () => 'pg')
      .build();
    await app.dispose();

    try {
      void app.db;
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContainerError);
      const disposed = error as ContainerDisposedError;
      expect(disposed.message).toContain("'db'");
      expect(disposed.hint).toBeTruthy();
      expect(disposed.details).toEqual({ key: 'db' });
    }
  });

  it('rejects preload() after dispose()', async () => {
    const app = container()
      .add('db', () => 'pg')
      .build();
    await app.dispose();

    await expect(app.preload('db')).rejects.toThrow(ContainerDisposedError);
  });

  it('throws when a scope reads a key of its disposed parent', async () => {
    const parent = container()
      .add('db', () => 'pg')
      .build();
    const child = parent.scope({ requestId: () => 'r1' });
    await parent.dispose();

    expect(child.requestId).toBe('r1');
    expect(() => child.db).toThrow(ContainerDisposedError);
  });

  it('keeps introspection available after dispose()', async () => {
    const app = container()
      .add('db', () => 'pg')
      .build();
    void app.db;
    await app.dispose();

    expect(app.health().resolved).toEqual([]);
    expect(app.size).toBe(1);
  });

  it('a second dispose() is a no-op', async () => {
    const end = vi.fn();
    const app = container()
      .add('pool', () => ({ end }), { dispose: (p) => p.end() })
      .build();
    void app.pool;

    await app.dispose();
    await app.dispose();

    expect(end).toHaveBeenCalledOnce();
  });
});

describe('targeted dispose(...keys)', () => {
  it('tears down only the given bindings and leaves the others usable', async () => {
    const stop = vi.fn();
    const end = vi.fn();
    const app = container()
      .add('pool', () => ({ end }), { dispose: (p) => p.end() })
      .add('relay', () => stop, { dispose: (s) => s() })
      .build();
    void app.pool;
    void app.relay;

    await app.dispose('relay');

    expect(stop).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();
    expect(app.pool.end).toBe(end);
    expect(() => app.relay).toThrow(ContainerDisposedError);
  });

  it('lets a shutdown stop loops before closing the pool they use', async () => {
    const order: string[] = [];
    const app = container()
      .add('pool', () => ({}), { dispose: () => void order.push('pool') })
      .add('relay', (c) => ({ pool: c.pool }), { dispose: () => void order.push('relay') })
      .build();
    void app.relay;

    await app.dispose('relay');
    await app.dispose();

    expect(order).toEqual(['relay', 'pool']);
  });

  it('disposes an eager instance that was never read', async () => {
    const end = vi.fn();
    const app = container()
      .add('pool', { end }, { dispose: (p) => p.end() })
      .build();

    await app.dispose('pool');

    expect(end).toHaveBeenCalledOnce();
  });
});
