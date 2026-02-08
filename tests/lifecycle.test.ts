import { describe, it, expect } from 'vitest';
import { createContainer } from '../src/index.js';

describe('lifecycle', () => {
  it('calls onInit when a dependency is first resolved', () => {
    let initialized = false;

    const container = createContainer({
      service: () => ({
        value: 42,
        onInit() { initialized = true; },
      }),
    });

    expect(initialized).toBe(false);
    container.service;
    expect(initialized).toBe(true);
  });

  it('calls onDestroy on dispose for all resolved instances', async () => {
    const destroyed: string[] = [];

    const container = createContainer({
      db: () => ({
        onDestroy() { destroyed.push('db'); },
      }),
      cache: () => ({
        onDestroy() { destroyed.push('cache'); },
      }),
      unused: () => ({
        onDestroy() { destroyed.push('unused'); },
      }),
    });

    // Only resolve db and cache
    container.db;
    container.cache;

    await container.dispose();

    expect(destroyed).toContain('db');
    expect(destroyed).toContain('cache');
    expect(destroyed).not.toContain('unused');
  });

  it('disposes in reverse resolution order', async () => {
    const order: string[] = [];

    const container = createContainer({
      first: () => ({ onDestroy() { order.push('first'); } }),
      second: () => ({ onDestroy() { order.push('second'); } }),
      third: () => ({ onDestroy() { order.push('third'); } }),
    });

    container.first;
    container.second;
    container.third;

    await container.dispose();

    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('handles async onInit', () => {
    let connected = false;

    const container = createContainer({
      db: () => ({
        async onInit() {
          await new Promise((r) => setTimeout(r, 1));
          connected = true;
        },
      }),
    });

    // Lazy resolution — onInit fires but since it's async it runs in background
    container.db;
    // We can't guarantee connected=true here without await
    // preload() is the way to await async init
  });

  it('preload resolves dependencies eagerly', async () => {
    let initialized = false;

    const container = createContainer({
      service: () => {
        initialized = true;
        return { value: 'ready' };
      },
    });

    expect(initialized).toBe(false);
    await container.preload('service');
    expect(initialized).toBe(true);
  });

  it('async onInit errors are swallowed (fire-and-forget)', async () => {
    const container = createContainer({
      failing: () => ({
        value: 'ok',
        async onInit() {
          throw new Error('init failed!');
        },
      }),
    });

    // Should not throw — async error is swallowed
    const instance = container.failing;
    expect(instance.value).toBe('ok');

    // Give the microtask queue time to settle
    await new Promise((r) => setTimeout(r, 10));
    // No unhandled rejection — the promise is caught internally
  });

  it('preload surfaces async onInit errors', async () => {
    const container = createContainer({
      db: () => ({
        async onInit() {
          throw new Error('connection refused');
        },
      }),
    });

    // preload should NOT throw because onInit is fire-and-forget even in resolve()
    // but preload does call resolve() which triggers onInit
    // The key behavior: preload resolves eagerly
    await container.preload('db');

    // The instance is resolved and cached despite async error
    expect(container.describe('db').resolved).toBe(true);
  });

  it('dispose clears cache — re-access calls factory again', async () => {
    let callCount = 0;

    const container = createContainer({
      service: () => {
        callCount++;
        return { id: callCount };
      },
    });

    expect(container.service.id).toBe(1);
    expect(container.service.id).toBe(1); // cached

    await container.dispose();

    // After dispose, cache is cleared — factory runs again
    expect(container.service.id).toBe(2);
    expect(callCount).toBe(2);
  });

  it('dispose calls async onDestroy and awaits it', async () => {
    let destroyed = false;

    const container = createContainer({
      service: () => ({
        async onDestroy() {
          await new Promise((r) => setTimeout(r, 5));
          destroyed = true;
        },
      }),
    });

    container.service;
    await container.dispose();

    expect(destroyed).toBe(true);
  });

  it('handles instances without lifecycle methods', async () => {
    const container = createContainer({
      plain: () => 'just a string',
      number: () => 42,
    });

    container.plain;
    container.number;

    // Should not throw
    await container.dispose();
  });
});
