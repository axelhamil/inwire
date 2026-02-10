import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('preload', () => {
  it('awaits async onInit', async () => {
    let connected = false;

    const c = container()
      .add('db', () => ({
        async onInit() {
          await sleep(10);
          connected = true;
        },
      }))
      .build();

    await c.preload('db');
    expect(connected).toBe(true);
  });

  it('initializes independent branches in parallel', async () => {
    const start = Date.now();

    const c = container()
      .add('db', () => ({
        async onInit() {
          await sleep(50);
        },
      }))
      .add('cache', () => ({
        async onInit() {
          await sleep(50);
        },
      }))
      .build();

    await c.preload();
    const elapsed = Date.now() - start;

    // If sequential, would be ~100ms. Parallel should be ~50ms.
    expect(elapsed).toBeLessThan(90);
  });

  it('respects topological order (deps before dependents)', async () => {
    const order: string[] = [];

    const c = container()
      .add('db', () => ({
        async onInit() {
          await sleep(5);
          order.push('db');
        },
      }))
      .add('userService', (c) => ({
        db: c.db,
        async onInit() {
          order.push('userService');
        },
      }))
      .build();

    await c.preload();
    expect(order).toEqual(['db', 'userService']);
  });

  it('parallelizes within levels, sequences between levels', async () => {
    const order: string[] = [];

    const c = container()
      .add('config', () => ({
        async onInit() {
          await sleep(5);
          order.push('config');
        },
      }))
      .add('db', (c) => ({
        config: c.config,
        async onInit() {
          await sleep(5);
          order.push('db');
        },
      }))
      .add('cache', (c) => ({
        config: c.config,
        async onInit() {
          await sleep(5);
          order.push('cache');
        },
      }))
      .add('api', (c) => ({
        db: c.db,
        cache: c.cache,
        async onInit() {
          order.push('api');
        },
      }))
      .build();

    await c.preload();

    // Level 0: config | Level 1: db, cache (parallel) | Level 2: api
    expect(order.indexOf('config')).toBe(0);
    expect(order.indexOf('api')).toBe(3);
    // db and cache are both at index 1 or 2
    expect(order.indexOf('db')).toBeGreaterThan(0);
    expect(order.indexOf('cache')).toBeGreaterThan(0);
    expect(order.indexOf('db')).toBeLessThan(3);
    expect(order.indexOf('cache')).toBeLessThan(3);
  });

  it('does not double-init: preload then lazy access', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        async onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    c.service; // lazy access after preload
    expect(initCount).toBe(1);
  });

  it('does not double-init: lazy access then preload', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    c.service; // lazy access first
    await c.preload('service'); // preload after
    expect(initCount).toBe(1);
  });

  it('reset clears init state — re-preload calls onInit again', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    expect(initCount).toBe(1);

    c.reset('service');
    await c.preload('service');
    expect(initCount).toBe(2);
  });

  it('dispose clears init state — re-preload calls onInit again', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload('service');
    expect(initCount).toBe(1);

    await c.dispose();
    await c.preload('service');
    expect(initCount).toBe(2);
  });

  it('propagates onInit errors', async () => {
    const c = container()
      .add('db', () => ({
        async onInit() {
          throw new Error('connection failed');
        },
      }))
      .build();

    await expect(c.preload('db')).rejects.toThrow('connection failed');
  });

  it('initializes transitive deps', async () => {
    const inited: string[] = [];

    const c = container()
      .add('config', () => ({
        onInit() {
          inited.push('config');
        },
      }))
      .add('db', (c) => ({
        config: c.config,
        onInit() {
          inited.push('db');
        },
      }))
      .build();

    // Only request 'db', but 'config' is a transitive dep
    await c.preload('db');
    expect(inited).toContain('config');
    expect(inited).toContain('db');
  });

  it('second preload is a no-op', async () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        onInit() {
          initCount++;
        },
      }))
      .build();

    await c.preload();
    await c.preload();
    expect(initCount).toBe(1);
  });

  it('handles deps without onInit in topo sort', async () => {
    const inited: string[] = [];

    const c = container()
      .add('config', () => ({ url: 'localhost' }))
      .add('db', (c) => ({
        config: c.config,
        onInit() {
          inited.push('db');
        },
      }))
      .build();

    await c.preload();
    expect(inited).toEqual(['db']);
  });
});
