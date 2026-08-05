import { describe, expect, it } from 'vitest';
import { DependencyTracker } from '../src/infrastructure/dependency-tracker.js';

describe('DependencyTracker', () => {
  it('records deps via tracking proxy', () => {
    const tracker = new DependencyTracker();
    const deps: string[] = [];
    const resolved = new Map<string, unknown>([
      ['db', 'db-instance'],
      ['logger', 'logger-instance'],
    ]);

    const proxy = tracker.createTrackingProxy(deps, [], (key) => resolved.get(key));

    (proxy as Record<string, unknown>).db;
    (proxy as Record<string, unknown>).logger;

    expect(deps).toEqual(['db', 'logger']);
  });

  it('stores and retrieves dependency graph', () => {
    const tracker = new DependencyTracker();

    tracker.recordDeps('service', ['db', 'logger']);
    tracker.recordDeps('handler', ['service']);

    const graph = tracker.getDepGraph();
    expect(graph.get('service')).toEqual(['db', 'logger']);
    expect(graph.get('handler')).toEqual(['service']);
  });

  it('clears specific keys from dep graph', () => {
    const tracker = new DependencyTracker();
    tracker.recordDeps('a', ['b']);
    tracker.recordDeps('c', ['d']);

    tracker.clearDepGraph('a');

    const graph = tracker.getDepGraph();
    expect(graph.has('a')).toBe(false);
    expect(graph.get('c')).toEqual(['d']);
  });

  it('clears all dep graph', () => {
    const tracker = new DependencyTracker();
    tracker.recordDeps('a', ['b']);
    tracker.recordDeps('c', ['d']);

    tracker.clearAllDepGraph();

    expect(tracker.getDepGraph().size).toBe(0);
  });

  it('deduplicates repeated access to the same key, preserving first-seen order', () => {
    const tracker = new DependencyTracker();
    const deps: string[] = [];
    const resolved = new Map<string, unknown>([
      ['db', 'db-instance'],
      ['logger', 'logger-instance'],
    ]);

    const proxy = tracker.createTrackingProxy(deps, [], (key) => resolved.get(key));

    // Access db three times and logger once — db should appear only once, first
    (proxy as Record<string, unknown>).db;
    (proxy as Record<string, unknown>).db;
    (proxy as Record<string, unknown>).logger;
    (proxy as Record<string, unknown>).db;

    expect(deps).toEqual(['db', 'logger']);
  });

  it('still resolves the value on every access even when deduplicating', () => {
    const tracker = new DependencyTracker();
    const deps: string[] = [];
    let callCount = 0;
    const proxy = tracker.createTrackingProxy(deps, [], (key) => {
      callCount++;
      return key;
    });

    (proxy as Record<string, unknown>).svc;
    (proxy as Record<string, unknown>).svc;
    (proxy as Record<string, unknown>).svc;

    expect(deps).toEqual(['svc']);
    expect(callCount).toBe(3);
  });

  it('ignores symbol property access on tracking proxy', () => {
    const tracker = new DependencyTracker();
    const deps: string[] = [];
    const proxy = tracker.createTrackingProxy(deps, [], () => undefined);

    (proxy as any)[Symbol.toPrimitive];

    expect(deps).toEqual([]);
  });
});
