import { describe, expect, it, vi } from 'vitest';
import { container } from '../src/index.js';

/** Third-party style resources: no `onDestroy()`, a close or stop function instead. */
function createPool() {
  return { query: (sql: string) => sql, end: vi.fn(async () => {}) };
}

function startLoop() {
  return vi.fn(async () => {});
}

describe('per-binding dispose', () => {
  it('calls the dispose hook declared on a binding with its instance', async () => {
    const app = container()
      .add('pool', () => createPool(), { dispose: (pool) => pool.end() })
      .build();

    const pool = app.pool;
    await app.dispose();

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('disposes a binding whose instance is a stop function', async () => {
    const app = container()
      .add('relay', () => startLoop(), { dispose: (stop) => stop() })
      .build();

    const stop = app.relay;
    await app.dispose();

    expect(stop).toHaveBeenCalledOnce();
  });

  it('disposes an eager instance that was never read', async () => {
    const pool = createPool();
    const app = container()
      .add('pool', pool, { dispose: (p) => p.end() })
      .build();

    await app.dispose();

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('calls onDestroy() on an eager instance that was never read', async () => {
    const onDestroy = vi.fn();
    const app = container().add('client', { onDestroy }).build();

    await app.dispose();

    expect(onDestroy).toHaveBeenCalledOnce();
  });

  it('prefers the declared hook over onDestroy()', async () => {
    const onDestroy = vi.fn();
    const hook = vi.fn();
    const app = container()
      .add('client', () => ({ onDestroy }), { dispose: hook })
      .build();

    void app.client;
    await app.dispose();

    expect(hook).toHaveBeenCalledOnce();
    expect(onDestroy).not.toHaveBeenCalled();
  });

  it('tears down in reverse resolution order, eager instances last', async () => {
    const order: string[] = [];
    const app = container()
      .add('config', { url: 'pg://' }, { dispose: () => void order.push('config') })
      .add('pool', () => createPool(), { dispose: () => void order.push('pool') })
      .add('repo', (c) => ({ pool: c.pool }), { dispose: () => void order.push('repo') })
      .build();

    void app.repo;
    await app.dispose();

    expect(order).toEqual(['repo', 'pool', 'config']);
  });

  it('keeps the hook when the binding travels through merge() and module()', async () => {
    const end = vi.fn();
    const infra = container().add('pool', () => ({ end }), { dispose: (p) => p.end() });
    const app = container()
      .merge(infra)
      .build()
      .module((b) => b.add('repo', (c) => ({ pool: c.pool })));

    void app.repo;
    await app.dispose();

    expect(end).toHaveBeenCalledOnce();
  });

  it('runs a hook once across extend() siblings sharing the instance', async () => {
    const root = container()
      .add('relay', () => startLoop(), { dispose: (stop) => stop() })
      .build();
    const stop = root.relay;
    const ext = root.extend({ extra: () => 1 });

    await ext.dispose();
    await root.dispose();

    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps tearing down after a failing hook and rethrows the failure', async () => {
    const end = vi.fn();
    const app = container()
      .add('pool', () => ({ end }), { dispose: (p) => p.end() })
      .add('broken', () => ({}), {
        dispose: () => {
          throw new Error('close failed');
        },
      })
      .build();

    void app.pool;
    void app.broken;

    await expect(app.dispose()).rejects.toThrow('close failed');
    expect(end).toHaveBeenCalledOnce();
  });
});
