import { describe, it, expect, expectTypeOf } from 'vitest';
import { createContainer, transient } from '../src/index.js';
import type { DepsDefinition } from '../src/index.js';

describe('TypeScript type inference', () => {
  it('infers correct types for simple factories', () => {
    const container = createContainer({
      num: () => 42,
      str: () => 'hello',
      obj: () => ({ x: 1, y: 2 }),
    });

    expectTypeOf(container.num).toEqualTypeOf<number>();
    expectTypeOf(container.str).toEqualTypeOf<string>();
    expectTypeOf(container.obj).toEqualTypeOf<{ x: number; y: number }>();
  });

  it('infers types through dependency chains', () => {
    const container = createContainer({
      base: () => 10,
      doubled: (c) => c.base * 2,
    });

    // doubled's type is inferred from the return of the factory
    expect(typeof container.doubled).toBe('number');
  });

  it('respects explicit return type annotations (interface-first)', () => {
    interface Repository {
      findById(id: string): string;
    }

    class PgRepo implements Repository {
      findById(id: string) { return `pg:${id}`; }
      pgSpecific() { return 'pg'; }
    }

    const container = createContainer({
      repo: (): Repository => new PgRepo(),
    });

    // The type is Repository, not PgRepo
    expectTypeOf(container.repo).toEqualTypeOf<Repository>();

    // This would be a type error:
    // container.repo.pgSpecific(); // Property 'pgSpecific' does not exist on type 'Repository'
  });

  it('transient preserves return type', () => {
    const container = createContainer({
      id: transient(() => crypto.randomUUID()),
    });

    expectTypeOf(container.id).toEqualTypeOf<string>();
  });

  it('satisfies DepsDefinition constraint', () => {
    const deps = {
      logger: () => ({ log: (msg: string) => console.log(msg) }),
      db: () => 'connection-string',
    } satisfies DepsDefinition;

    const container = createContainer(deps);
    expect(container.db).toBe('connection-string');
  });

  it('scope extends the container type', () => {
    const parent = createContainer({
      db: () => 'postgres',
    });

    const child = parent.scope({
      requestId: () => 'req-123',
    });

    expectTypeOf(child.db).toEqualTypeOf<string>();
    expectTypeOf(child.requestId).toEqualTypeOf<string>();
  });

  it('extend extends the container type', () => {
    const base = createContainer({
      a: () => 1,
    });

    const extended = base.extend({
      b: () => 'hello',
    });

    expectTypeOf(extended.a).toEqualTypeOf<number>();
    expectTypeOf(extended.b).toEqualTypeOf<string>();
  });
});
