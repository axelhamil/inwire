import { describe, it, expect } from 'vitest';
import { container, transient } from '../src/index.js';

describe('module (post-build)', () => {
  it('applies a module to add dependencies post-build', () => {
    const base = container()
      .add('config', { host: 'localhost', port: 5432 })
      .build();

    const withDb = base.module((b) => b
      .add('db', (c) => `pg://${c.config.host}:${c.config.port}`),
    );

    expect(withDb.db).toBe('pg://localhost:5432');
    expect(withDb.config).toEqual({ host: 'localhost', port: 5432 });
  });

  it('accumulates types incrementally in the builder callback', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    const extended = base.module((b) => b
      .add('b', (c) => c.a + 1)
      .add('c', (c) => c.b + 1),
    );

    expect(extended.a).toBe(1);
    expect(extended.b).toBe(2);
    expect(extended.c).toBe(3);
  });

  it('chains multiple module() calls', () => {
    const base = container()
      .add('a', () => 'a')
      .build();

    const ext1 = base.module((b) => b.add('b', (c) => `${c.a}+b`));
    const ext2 = ext1.module((b) => b.add('c', (c) => `${c.b}+c`));

    expect(ext2.c).toBe('a+b+c');
  });

  it('shares existing singleton cache', () => {
    let callCount = 0;

    const base = container()
      .add('logger', () => {
        callCount++;
        return { id: callCount };
      })
      .build();

    // Resolve in base — cached
    const baseLogger = base.logger;
    expect(callCount).toBe(1);

    const extended = base.module((b) => b.add('db', () => 'database'));

    // Extended gets the same cached instance
    expect(extended.logger).toEqual(baseLogger);
    expect(callCount).toBe(1);
  });

  it('does not mutate the original container', () => {
    const base = container()
      .add('a', () => 'a')
      .build();

    const extended = base.module((b) => b.add('b', () => 'b'));

    expect(Object.keys(base)).toContain('a');
    expect(Object.keys(base)).not.toContain('b');
    expect(Object.keys(extended)).toContain('a');
    expect(Object.keys(extended)).toContain('b');
  });

  it('works after scope()', () => {
    const base = container()
      .add('config', { env: 'test' })
      .build();

    const scoped = base.scope({ requestId: () => 'req-123' });
    const withExtra = scoped.module((b) => b
      .add('service', (c) => `svc-${c.requestId}`),
    );

    // module() delegates to extend(), which flattens scope-level factories only
    expect(withExtra.service).toBe('svc-req-123');
    expect(withExtra.requestId).toBe('req-123');
  });

  it('works after extend()', () => {
    const base = container()
      .add('a', () => 1)
      .build();

    const extended = base.extend({ b: () => 2 });
    const withModule = extended.module((b) => b.add('c', (c) => c.b + 1));

    expect(withModule.c).toBe(3);
  });

  it('supports transient deps via addTransient', () => {
    let counter = 0;
    const base = container()
      .add('config', { env: 'test' })
      .build();

    const extended = base.module((b) => b
      .addTransient('id', () => ++counter),
    );

    expect(extended.id).toBe(1);
    expect(extended.id).toBe(2);
    expect(extended.id).toBe(3);
  });

  it('module on module-extended container chains correctly', () => {
    const base = container()
      .add('x', () => 10)
      .build();

    const step1 = base.module((b) => b.add('y', (c) => c.x * 2));
    const step2 = step1.module((b) => b.add('z', (c) => c.y * 3));

    expect(step2.z).toBe(60);
  });
});
