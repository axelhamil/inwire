import { describe, expect, it } from 'vitest';
import { topologicalLevels } from '../src/application/preloader.js';

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

  it('throws on incomplete sort (likely cycle)', () => {
    const depGraph = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const keys = new Set(['a', 'b']);
    expect(() => topologicalLevels(depGraph, keys)).toThrow(/Incomplete topological sort/);
  });
});
