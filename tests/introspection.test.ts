import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

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
      const c = container()
        .add('a', () => 1)
        .build();
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

  describe('scoped introspection', () => {
    it('inspect() on scoped shows only local providers', () => {
      const parent = container()
        .add('db', () => 'pg')
        .add('logger', () => 'log')
        .build();

      const child = parent.scope({
        requestId: () => 'req-1',
      });

      child.requestId;

      const graph = child.inspect();
      expect(graph.providers.requestId).toBeDefined();
      expect(graph.providers.requestId.resolved).toBe(true);
      // Parent providers are NOT in child's inspect — only local factories
      expect(graph.providers.db).toBeUndefined();
    });

    it('describe() on scoped for a parent dep returns default', () => {
      const parent = container()
        .add('db', () => 'pg')
        .build();

      const child = parent.scope({
        service: () => 'svc',
      });

      // db is not a local factory in child
      const info = child.describe('db');
      expect(info.resolved).toBe(false);
      expect(info.deps).toEqual([]);
    });

    it('health() on scoped counts only local providers', () => {
      const parent = container()
        .add('db', () => 'pg')
        .add('logger', () => 'log')
        .build();

      const child = parent.scope({
        requestId: () => 'req-1',
        handler: () => 'handler',
      });

      child.requestId;

      const health = child.health();
      expect(health.totalProviders).toBe(2); // only requestId + handler
      expect(health.resolved).toEqual(['requestId']);
      expect(health.unresolved).toEqual(['handler']);
    });
  });

  describe('extended introspection', () => {
    it('inspect() on extended shows all merged providers', () => {
      const base = container()
        .add('db', () => 'pg')
        .build();

      base.db;

      const extended = base.extend({
        cache: () => 'redis',
      });

      extended.cache;

      const graph = extended.inspect();
      expect(graph.providers.db).toBeDefined();
      expect(graph.providers.db.resolved).toBe(true);
      expect(graph.providers.cache).toBeDefined();
      expect(graph.providers.cache.resolved).toBe(true);
    });

    it('health() on extended includes all providers', () => {
      const base = container()
        .add('a', () => 1)
        .add('b', () => 2)
        .build();

      base.a;

      const extended = base.extend({
        c: () => 3,
      });

      const health = extended.health();
      expect(health.totalProviders).toBe(3);
      expect(health.resolved).toContain('a');
      expect(health.unresolved).toContain('b');
      expect(health.unresolved).toContain('c');
    });
  });

  describe('structuredClone(inspect())', () => {
    it('does not throw and deeply equals original', () => {
      const c = container()
        .add('db', () => 'pg')
        .add('logger', () => 'log')
        .build();

      c.db;

      const graph = c.inspect();
      let clone: typeof graph | undefined;
      expect(() => {
        clone = structuredClone(graph);
      }).not.toThrow();
      expect(clone).toEqual(graph);
    });

    it('cloned result is a deep copy, not the same reference', () => {
      const c = container()
        .add('a', () => 1)
        .build();

      c.a;

      const graph = c.inspect();
      const clone = structuredClone(graph);
      expect(clone).not.toBe(graph);
      expect(clone.providers).not.toBe(graph.providers);
    });

    it('works after partial resolution', () => {
      const c = container()
        .add('resolved', () => 'yes')
        .add('unresolved', () => 'no')
        .build();

      c.resolved;
      // 'unresolved' is not accessed

      const graph = c.inspect();
      const clone = structuredClone(graph);
      expect(clone.providers.resolved.resolved).toBe(true);
      expect(clone.providers.unresolved.resolved).toBe(false);
      expect(clone).toEqual(graph);
    });

    it('works with scoped container', () => {
      const parent = container()
        .add('db', () => 'pg')
        .build();

      const child = parent.scope({ requestId: () => 'req-1' }, { name: 'request' });
      child.requestId;

      const graph = child.inspect();
      const clone = structuredClone(graph);
      expect(clone).toEqual(graph);
      expect(clone.name).toBe('request');
    });
  });
});
