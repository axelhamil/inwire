import { describe, it, expect } from 'vitest';
import { container, transient } from '../src/index.js';

describe('transient', () => {
  it('creates a new instance on every access', () => {
    let counter = 0;
    const c = container()
      .addTransient('id', () => ++counter)
      .build();

    expect(c.id).toBe(1);
    expect(c.id).toBe(2);
    expect(c.id).toBe(3);
  });

  it('transient deps can access singleton deps', () => {
    const c = container()
      .add('prefix', () => 'REQ')
      .addTransient('requestId', (c) => `${c.prefix}-${Math.random()}`)
      .build();

    const id1 = c.requestId;
    const id2 = c.requestId;

    expect(id1).toMatch(/^REQ-/);
    expect(id2).toMatch(/^REQ-/);
    expect(id1).not.toBe(id2);
  });

  it('transient factory receives the container on each call', () => {
    let callCount = 0;
    const c = container()
      .addTransient('counter', () => ++callCount)
      .addTransient('stamped', (c) => `stamp-${c.counter}`)
      .build();

    // Each access to stamped creates a new instance of both stamped and counter
    expect(c.stamped).toBe('stamp-1');
    expect(c.stamped).toBe('stamp-2');
  });

  it('transient marker symbol is present on wrapped factory', () => {
    const factory = () => 42;
    const wrapped = transient(factory);

    const TRANSIENT_MARKER = Symbol.for('inwire:transient');
    expect((wrapped as any)[TRANSIENT_MARKER]).toBe(true);
  });

  it('non-transient factory does not have marker', () => {
    const factory = () => 42;
    const TRANSIENT_MARKER = Symbol.for('inwire:transient');
    expect((factory as any)[TRANSIENT_MARKER]).toBeUndefined();
  });

  it('inspect shows transient scope', () => {
    const c = container()
      .add('singleton', () => 'cached')
      .addTransient('ephemeral', () => 'new-each-time')
      .build();

    const graph = c.inspect();
    expect(graph.providers.singleton.scope).toBe('singleton');
    expect(graph.providers.ephemeral.scope).toBe('transient');
  });
});
