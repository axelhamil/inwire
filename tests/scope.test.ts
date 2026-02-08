import { describe, it, expect } from 'vitest';
import { createContainer } from '../src/index.js';

describe('scope', () => {
  it('creates a child container inheriting parent deps', () => {
    const parent = createContainer({
      db: () => ({ name: 'main-db' }),
      logger: () => ({ log: (msg: string) => msg }),
    });

    const child = parent.scope({
      requestId: () => 'req-123',
    });

    expect(child.requestId).toBe('req-123');
    expect(child.db).toEqual({ name: 'main-db' });
    expect(child.logger.log('hi')).toBe('hi');
  });

  it('scoped singletons are independent from parent', () => {
    let parentCount = 0;
    let childCount = 0;

    const parent = createContainer({
      shared: () => ++parentCount,
    });

    // Resolve in parent first
    expect(parent.shared).toBe(1);

    const child = parent.scope({
      scoped: () => ++childCount,
    });

    // Child gets parent's cached singleton
    expect(child.shared).toBe(1);
    expect(child.scoped).toBe(1);
    expect(child.scoped).toBe(1); // cached in child scope
  });

  it('child can override parent deps', () => {
    const parent = createContainer({
      greeting: () => 'hello',
    });

    const child = parent.scope({
      greeting: () => 'bonjour',
    });

    expect(parent.greeting).toBe('hello');
    expect(child.greeting).toBe('bonjour');
  });

  it('child can depend on both parent and own deps', () => {
    const parent = createContainer({
      db: () => 'postgres',
    });

    const child = parent.scope({
      requestId: () => 'req-456',
      handler: (c) => `${c.db}:${c.requestId}`,
    });

    expect(child.handler).toBe('postgres:req-456');
  });

  it('deeply nested scopes inherit from grandparent', () => {
    const root = createContainer({
      db: () => 'root-db',
    });

    const child = root.scope({
      logger: () => 'child-logger',
    });

    const grandchild = child.scope({
      requestId: () => 'req-789',
    });

    expect(grandchild.requestId).toBe('req-789');
    expect(grandchild.logger).toBe('child-logger');
    expect(grandchild.db).toBe('root-db');
  });

  it('nested scope overrides propagate correctly', () => {
    const root = createContainer({
      env: () => 'production',
    });

    const child = root.scope({
      env: () => 'staging',
    });

    const grandchild = child.scope({
      env: () => 'test',
    });

    expect(root.env).toBe('production');
    expect(child.env).toBe('staging');
    expect(grandchild.env).toBe('test');
  });

  it('dispose on child does not affect parent', async () => {
    let parentDestroyed = false;
    let childDestroyed = false;

    const parent = createContainer({
      parentService: () => ({
        onDestroy: () => { parentDestroyed = true; },
      }),
    });

    // Resolve parent service
    parent.parentService;

    const child = parent.scope({
      childService: () => ({
        onDestroy: () => { childDestroyed = true; },
      }),
    });

    // Resolve child service
    child.childService;

    await child.dispose();

    expect(childDestroyed).toBe(true);
    expect(parentDestroyed).toBe(false);
  });
});
