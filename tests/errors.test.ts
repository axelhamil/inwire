import { describe, it, expect } from 'vitest';
import {
  container,
  ContainerConfigError,
  ReservedKeyError,
  ProviderNotFoundError,
  UndefinedReturnError,
  FactoryError,
  ContainerError,
} from '../src/index.js';

describe('errors', () => {
  describe('ReservedKeyError', () => {
    it('throws when using a reserved key in builder', () => {
      expect(() =>
        container().add('inspect' as any, () => 'foo').build(),
      ).toThrow(ReservedKeyError);
    });

    it('includes rename suggestion', () => {
      try {
        container().add('dispose' as any, () => 'foo').build();
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ReservedKeyError);
        const err = e as ReservedKeyError;
        expect(err.hint).toContain('Rename');
        expect(err.details.key).toBe('dispose');
      }
    });

    for (const key of ['inspect', 'describe', 'scope', 'dispose', 'health', 'extend', 'preload']) {
      it(`rejects reserved key '${key}'`, () => {
        expect(() =>
          container().add(key as any, () => 'x').build(),
        ).toThrow(ReservedKeyError);
      });
    }
  });

  describe('ProviderNotFoundError', () => {
    it('throws when accessing a non-existent key', () => {
      const c = container()
        .add('logger', () => 'log')
        .build();

      expect(() => (c as any).nonExistent).toThrow(ProviderNotFoundError);
    });

    it('includes registered keys and fuzzy suggestion', () => {
      const c = container()
        .add('userRepository', () => 'repo')
        .add('logger', () => 'log')
        .build();

      try {
        (c as any).userRepo;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderNotFoundError);
        const err = e as ProviderNotFoundError;
        expect(err.message).toContain('userRepository');
        expect(err.details.registered).toContain('userRepository');
      }
    });

    it('shows resolution chain for nested failures', () => {
      const c = container()
        .add('service', (c: any) => c.missingDep)
        .build();

      try {
        c.service;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderNotFoundError);
        const err = e as ProviderNotFoundError;
        expect(err.message).toContain('service');
        expect(err.message).toContain('missingDep');
      }
    });
  });

  describe('UndefinedReturnError', () => {
    it('throws when factory returns undefined', () => {
      const c = container()
        .add('broken', () => undefined as any)
        .build();

      expect(() => c.broken).toThrow(UndefinedReturnError);
    });

    it('includes hint about missing return', () => {
      try {
        const c = container()
          .add('broken', () => undefined as any)
          .build();
        c.broken;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(UndefinedReturnError);
        const err = e as UndefinedReturnError;
        expect(err.hint).toContain('return statement');
      }
    });
  });

  describe('FactoryError', () => {
    it('wraps errors thrown by factories', () => {
      const c = container()
        .add('failing', () => { throw new Error('Connection refused'); })
        .build();

      expect(() => c.failing).toThrow(FactoryError);
    });

    it('preserves original error message', () => {
      try {
        const c = container()
          .add('failing', () => { throw new Error('Connection refused'); })
          .build();
        c.failing;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(FactoryError);
        const err = e as FactoryError;
        expect(err.message).toContain('Connection refused');
        expect(err.originalError).toBeInstanceOf(Error);
        expect(err.hint).toContain('factory function');
      }
    });

    it('shows resolution chain for nested factory errors', () => {
      const c = container()
        .add('db', () => { throw new Error('ECONNREFUSED'); })
        .add('repo', (c: any) => c.db)
        .add('service', (c: any) => c.repo)
        .build();

      try {
        c.service;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(FactoryError);
        const err = e as FactoryError;
        expect(err.message).toContain('ECONNREFUSED');
      }
    });
  });

  describe('CircularDependencyError details', () => {
    it('has key, chain, and cycle in details', () => {
      const c = container()
        .add('a', (c: any) => c.b)
        .add('b', (c: any) => c.a)
        .build();

      try {
        c.a;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerError);
        const err = e as any;
        expect(err.details.key).toBeDefined();
        expect(err.details.chain).toBeDefined();
        expect(err.details.cycle).toBeDefined();
        expect(err.hint).toContain('To fix');
      }
    });
  });

  describe('UndefinedReturnError details', () => {
    it('has key and chain in details', () => {
      const c = container()
        .add('broken', () => undefined as any)
        .build();

      try {
        c.broken;
        expect.fail('should throw');
      } catch (e) {
        const err = e as UndefinedReturnError;
        expect(err.details.key).toBe('broken');
        expect(err.details.chain).toBeDefined();
        expect(Array.isArray(err.details.chain)).toBe(true);
      }
    });
  });

  describe('FactoryError details', () => {
    it('has key, chain, and originalError in details', () => {
      const c = container()
        .add('failing', () => { throw new Error('boom'); })
        .build();

      try {
        c.failing;
        expect.fail('should throw');
      } catch (e) {
        const err = e as FactoryError;
        expect(err.details.key).toBe('failing');
        expect(err.details.chain).toBeDefined();
        expect(err.details.originalError).toBe('boom');
        expect(err.originalError).toBeInstanceOf(Error);
      }
    });
  });

  describe('ReservedKeyError for toString', () => {
    it('rejects toString as a dependency key', () => {
      expect(() =>
        container().add('toString' as any, () => 'x').build(),
      ).toThrow(ReservedKeyError);
    });
  });

  describe('all errors extend ContainerError', () => {
    it('ReservedKeyError is a ContainerError', () => {
      try {
        container().add('inspect' as any, () => 'x').build();
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerError);
      }
    });

    it('ProviderNotFoundError is a ContainerError', () => {
      try {
        const c = container().add('a', () => 1).build();
        (c as any).missing;
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerError);
      }
    });
  });
});
