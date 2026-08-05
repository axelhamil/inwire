import { describe, expect, it } from 'vitest';
import { topologicalLevels } from '../src/application/preloader.js';
import { ContainerError, TopologicalSortError } from '../src/index.js';

describe('topologicalLevels', () => {
  it('returns independent keys in a single level', () => {
    const depGraph = new Map<string, string[]>([
      ['a', []],
      ['b', []],
      ['c', []],
    ]);
    const keys = new Set(['a', 'b', 'c']);
    const levels = topologicalLevels(depGraph, keys);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('orders dependencies before dependents', () => {
    const depGraph = new Map<string, string[]>([
      ['db', []],
      ['repo', ['db']],
      ['service', ['repo']],
    ]);
    const keys = new Set(['db', 'repo', 'service']);
    const levels = topologicalLevels(depGraph, keys);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toEqual(['db']);
    expect(levels[1]).toEqual(['repo']);
    expect(levels[2]).toEqual(['service']);
  });

  it('groups independent deps at same level', () => {
    const depGraph = new Map<string, string[]>([
      ['db', []],
      ['cache', []],
      ['service', ['db', 'cache']],
    ]);
    const keys = new Set(['db', 'cache', 'service']);
    const levels = topologicalLevels(depGraph, keys);
    expect(levels).toHaveLength(2);
    expect(levels[0]).toEqual(expect.arrayContaining(['db', 'cache']));
    expect(levels[1]).toEqual(['service']);
  });

  it('ignores deps not present in the keys set', () => {
    const depGraph = new Map<string, string[]>([
      ['a', ['external']],
      ['b', []],
    ]);
    const keys = new Set(['a', 'b']); // 'external' is outside the set
    const levels = topologicalLevels(depGraph, keys);
    // 'external' is not tracked, so both a and b have in-degree 0
    expect(levels).toHaveLength(1);
    expect(levels[0]).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('throws TopologicalSortError on incomplete sort (cycle)', () => {
    const depGraph = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const keys = new Set(['a', 'b']);
    expect(() => topologicalLevels(depGraph, keys)).toThrow(TopologicalSortError);
  });

  it('TopologicalSortError is a ContainerError with hint and details', () => {
    const depGraph = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const keys = new Set(['a', 'b']);

    let caught: unknown;
    try {
      topologicalLevels(depGraph, keys);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ContainerError);
    expect(caught).toBeInstanceOf(TopologicalSortError);
    const err = caught as TopologicalSortError;
    expect(typeof err.hint).toBe('string');
    expect(err.hint.length).toBeGreaterThan(0);
    expect(err.details).toHaveProperty('remaining');
    expect(err.details.remaining).toEqual(expect.arrayContaining(['a', 'b']));
    expect(err.message).toMatch(/Topological sort incomplete/);
  });
});
