import { describe, expect, it } from 'vitest';
import { container, DuplicateKeyError, ReservedKeyError } from '../src/index.js';

describe('ContainerBuilder duplicate key detection', () => {
  it('throws DuplicateKeyError when add() registers a key twice', () => {
    expect(() =>
      container()
        .add('db', () => 'first')
        .add('db', () => 'second'),
    ).toThrow(DuplicateKeyError);
  });

  it('throws DuplicateKeyError when addTransient() reuses an existing key', () => {
    expect(() =>
      container()
        .add('db', () => 'singleton')
        .addTransient('db', () => 'transient'),
    ).toThrow(DuplicateKeyError);
  });

  it('throws DuplicateKeyError when add() follows addTransient() with the same key', () => {
    expect(() =>
      container()
        .addTransient('reqId', () => 'id')
        .add('reqId', () => 'static'),
    ).toThrow(DuplicateKeyError);
  });

  it('DuplicateKeyError carries the correct key in details', () => {
    let caught: DuplicateKeyError | undefined;
    try {
      container()
        .add('logger', () => 'a')
        .add('logger', () => 'b');
    } catch (e) {
      caught = e as DuplicateKeyError;
    }
    expect(caught).toBeInstanceOf(DuplicateKeyError);
    expect(caught?.details.key).toBe('logger');
    expect(caught?.hint).toContain('.extend(');
  });

  it('still throws ReservedKeyError for reserved keys', () => {
    expect(() => container().add('inspect' as any, () => 'x')).toThrow(ReservedKeyError);
  });

  it('does not throw when distinct keys are registered', () => {
    expect(() =>
      container()
        .add('a', () => 1)
        .add('b', () => 2)
        .add('c', () => 3)
        .build(),
    ).not.toThrow();
  });

  it('merge() does NOT throw on duplicate keys — last write wins (intentional override)', () => {
    const extra = container().add('db', () => 'extra-db');
    const app = container()
      .add('db', () => 'base-db')
      .merge(extra)
      .build();
    expect(app.db).toBe('extra-db');
  });
});
