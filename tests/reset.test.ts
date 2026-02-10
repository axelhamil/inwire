import { describe, it, expect } from 'vitest';
import { container } from '../src/index.js';

describe('reset', () => {
  it('reset forces re-creation on next access', () => {
    let callCount = 0;

    const c = container()
      .add('db', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    expect(c.db.id).toBe(1);
    expect(c.db.id).toBe(1); // cached

    c.reset('db');

    expect(c.db.id).toBe(2); // new instance
    expect(callCount).toBe(2);
  });

  it('reset does not affect other singletons', () => {
    let dbCount = 0;
    let cacheCount = 0;

    const c = container()
      .add('db', () => ({ id: ++dbCount }))
      .add('cache', () => ({ id: ++cacheCount }))
      .build();

    c.db;
    c.cache;

    c.reset('db');

    expect(c.db.id).toBe(2); // re-created
    expect(c.cache.id).toBe(1); // untouched
  });

  it('reset on unresolved key is a silent no-op', () => {
    const c = container()
      .add('db', () => 'database')
      .build();

    // Should not throw
    c.reset('db');
  });

  it('reset + onInit: next access calls onInit again', () => {
    let initCount = 0;

    const c = container()
      .add('service', () => ({
        value: 'svc',
        onInit() { initCount++; },
      }))
      .build();

    c.service;
    expect(initCount).toBe(1);

    c.reset('service');

    c.service;
    expect(initCount).toBe(2);
  });

  it('reset in scope does not affect parent cache', () => {
    let parentCount = 0;

    const parent = container()
      .add('db', () => ({ id: ++parentCount }))
      .build();

    // Resolve in parent
    expect(parent.db.id).toBe(1);

    const child = parent.scope({
      db: () => ({ id: 999 }),
    });

    expect(child.db.id).toBe(999);

    child.reset('db');

    // Child re-creates its own
    expect(child.db.id).toBe(999);
    // Parent untouched
    expect(parent.db.id).toBe(1);
    expect(parentCount).toBe(1);
  });
});
