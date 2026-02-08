import { describe, it, expect } from 'vitest';
import { createContainer, transient } from '../src/index.js';

describe('introspection', () => {
  describe('inspect()', () => {
    it('returns the full provider graph', () => {
      const container = createContainer({
        db: () => 'database',
        logger: () => 'logger',
        service: (c) => `${c.db}-${c.logger}`,
      });

      // Resolve service to build dep graph
      container.service;

      const graph = container.inspect();
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
      const container = createContainer({
        a: () => 1,
        b: () => 2,
      });

      container.a; // only resolve a

      const graph = container.inspect();
      expect(graph.providers.a.resolved).toBe(true);
      expect(graph.providers.b.resolved).toBe(false);
    });

    it('shows transient scope', () => {
      const container = createContainer({
        singleton: () => 1,
        ephemeral: transient(() => 2),
      });

      const graph = container.inspect();
      expect(graph.providers.singleton.scope).toBe('singleton');
      expect(graph.providers.ephemeral.scope).toBe('transient');
    });
  });

  describe('describe()', () => {
    it('returns provider details', () => {
      const container = createContainer({
        db: () => 'pg',
        repo: (c) => c.db,
      });

      container.repo;

      const info = container.describe('repo');
      expect(info.key).toBe('repo');
      expect(info.resolved).toBe(true);
      expect(info.deps).toEqual(['db']);
      expect(info.scope).toBe('singleton');
    });

    it('returns default info for unknown key', () => {
      const container = createContainer({ a: () => 1 });
      const info = container.describe('unknown' as any);
      expect(info.resolved).toBe(false);
      expect(info.deps).toEqual([]);
    });
  });

  describe('health()', () => {
    it('returns container health', () => {
      const container = createContainer({
        a: () => 1,
        b: () => 2,
        c: () => 3,
      });

      container.a;
      container.b;

      const health = container.health();
      expect(health.totalProviders).toBe(3);
      expect(health.resolved).toContain('a');
      expect(health.resolved).toContain('b');
      expect(health.unresolved).toEqual(['c']);
    });
  });

  describe('toString()', () => {
    it('returns a readable representation', () => {
      const container = createContainer({
        db: () => 'pg',
        logger: () => 'log',
      });

      container.db;

      const str = container.toString();
      expect(str).toContain('Container');
      expect(str).toContain('db');
      expect(str).toContain('(resolved)');
      expect(str).toContain('logger');
      expect(str).toContain('(pending)');
    });
  });
});
