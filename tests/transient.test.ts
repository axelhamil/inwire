import { describe, it, expect } from 'vitest';
import { createContainer, transient } from '../src/index.js';

describe('transient', () => {
  it('creates a new instance on every access', () => {
    let counter = 0;
    const container = createContainer({
      id: transient(() => ++counter),
    });

    expect(container.id).toBe(1);
    expect(container.id).toBe(2);
    expect(container.id).toBe(3);
  });

  it('transient deps can access singleton deps', () => {
    const container = createContainer({
      prefix: () => 'REQ',
      requestId: transient((c) => `${c.prefix}-${Math.random()}`),
    });

    const id1 = container.requestId as string;
    const id2 = container.requestId as string;

    expect(id1).toMatch(/^REQ-/);
    expect(id2).toMatch(/^REQ-/);
    expect(id1).not.toBe(id2);
  });

  it('transient factory receives the container on each call', () => {
    let callCount = 0;
    const container = createContainer({
      counter: transient(() => ++callCount),
      stamped: transient((c) => `stamp-${c.counter}`),
    });

    // Each access to stamped creates a new instance of both stamped and counter
    expect(container.stamped).toBe('stamp-1');
    expect(container.stamped).toBe('stamp-2');
  });

  it('transient marker symbol is present on wrapped factory', () => {
    const factory = () => 42;
    const wrapped = transient(factory);

    const TRANSIENT_MARKER = Symbol.for('deps-injector:transient');
    expect((wrapped as any)[TRANSIENT_MARKER]).toBe(true);
  });

  it('non-transient factory does not have marker', () => {
    const factory = () => 42;
    const TRANSIENT_MARKER = Symbol.for('deps-injector:transient');
    expect((factory as any)[TRANSIENT_MARKER]).toBeUndefined();
  });

  it('inspect shows transient scope', () => {
    const container = createContainer({
      singleton: () => 'cached',
      ephemeral: transient(() => 'new-each-time'),
    });

    const graph = container.inspect();
    expect(graph.providers.singleton.scope).toBe('singleton');
    expect(graph.providers.ephemeral.scope).toBe('transient');
  });
});
