import { describe, it, expect } from 'vitest';
import { container, transient } from '../src/index.js';

describe('introspection', () => {
  describe('inspect()', () => {
    it('returns the full provider graph', () => {
      const c = container()
        .add('db', () => 'database')
        .add('logger', () => 'logger')
        .add('service', (c) => `${c.db}-${c.logger}`)
        .build();

      // Resolve service to build dep graph
      c.service;

      const graph = c.inspect();
      expect(graph.providers.db).toEqual({
        key: 'db',
        resolved: true,
        deps: [],
        scope: 'singleton',
      });
      expect(graph.providers.service).toEqual({
        key: 'service',
        resolved: true,
        deps: ['db', 'logger'],
        scope: 'singleton',
      });
    });

    it('shows unresolved providers', () => {
      const c = container()
        .add('a', () => 1)
        .add('b', () => 2)
        .build();

      c.a; // only resolve a

      const graph = c.inspect();
      expect(graph.providers.a.resolved).toBe(true);
      expect(graph.providers.b.resolved).toBe(false);
    });

    it('shows transient scope', () => {
      const c = container()
        .add('singleton', () => 1)
        .addTransient('ephemeral', () => 2)
        .build();

      const graph = c.inspect();
      expect(graph.providers.singleton.scope).toBe('singleton');
      expect(graph.providers.ephemeral.scope).toBe('transient');
    });
  });

  describe('describe()', () => {
    it('returns provider details', () => {
      const c = container()
        .add('db', () => 'pg')
        .add('repo', (c) => c.db)
        .build();

      c.repo;

      const info = c.describe('repo');
      expect(info.key).toBe('repo');
      expect(info.resolved).toBe(true);
      expect(info.deps).toEqual(['db']);
      expect(info.scope).toBe('singleton');
    });

    it('returns default info for unknown key', () => {
      const c = container().add('a', () => 1).build();
      const info = c.describe('unknown' as any);
      expect(info.resolved).toBe(false);
      expect(info.deps).toEqual([]);
    });
  });

  describe('health()', () => {
    it('returns container health', () => {
      const c = container()
        .add('a', () => 1)
        .add('b', () => 2)
        .add('c', () => 3)
        .build();

      c.a;
      c.b;

      const health = c.health();
      expect(health.totalProviders).toBe(3);
      expect(health.resolved).toContain('a');
      expect(health.resolved).toContain('b');
      expect(health.unresolved).toEqual(['c']);
    });
  });

  describe('toString()', () => {
    it('returns a readable representation', () => {
      const c = container()
        .add('db', () => 'pg')
        .add('logger', () => 'log')
        .build();

      c.db;

      const str = c.toString();
      expect(str).toContain('Container');
      expect(str).toContain('db');
      expect(str).toContain('(resolved)');
      expect(str).toContain('logger');
      expect(str).toContain('(pending)');
    });
  });
});
