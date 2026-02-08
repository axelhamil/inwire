import { describe, it, expect } from 'vitest';
import {
  createContainer,
  ContainerConfigError,
  ReservedKeyError,
  ProviderNotFoundError,
  UndefinedReturnError,
  FactoryError,
  ContainerError,
} from '../src/index.js';

describe('errors', () => {
  describe('ContainerConfigError', () => {
    it('throws when a non-function value is provided', () => {
      expect(() =>
        createContainer({ apiKey: 'sk-123' } as any),
      ).toThrow(ContainerConfigError);
    });

    it('includes hint with wrap suggestion', () => {
      try {
        createContainer({ apiKey: 'sk-123' } as any);
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerConfigError);
        const err = e as ContainerConfigError;
        expect(err.hint).toContain('Wrap it');
        expect(err.details.key).toBe('apiKey');
        expect(err.details.actualType).toBe('string');
      }
    });

    it('detects number values', () => {
      try {
        createContainer({ port: 3000 } as any);
        expect.fail('should throw');
      } catch (e) {
        const err = e as ContainerConfigError;
        expect(err.details.actualType).toBe('number');
      }
    });
  });

  describe('ReservedKeyError', () => {
    it('throws when using a reserved key', () => {
      expect(() =>
        createContainer({ inspect: () => 'foo' }),
      ).toThrow(ReservedKeyError);
    });

    it('includes rename suggestion', () => {
      try {
        createContainer({ dispose: () => 'foo' });
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
          createContainer({ [key]: () => 'x' }),
        ).toThrow(ReservedKeyError);
      });
    }
  });

  describe('ProviderNotFoundError', () => {
    it('throws when accessing a non-existent key', () => {
      const container = createContainer({
        logger: () => 'log',
      });

      expect(() => (container as any).nonExistent).toThrow(ProviderNotFoundError);
    });

    it('includes registered keys and fuzzy suggestion', () => {
      const container = createContainer({
        userRepository: () => 'repo',
        logger: () => 'log',
      });

      try {
        (container as any).userRepo;
        expect.fail('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderNotFoundError);
        const err = e as ProviderNotFoundError;
        expect(err.message).toContain('userRepository');
        expect(err.details.registered).toContain('userRepository');
      }
    });

    it('shows resolution chain for nested failures', () => {
      const container = createContainer({
        service: (c) => c.missingDep,
      });

      try {
        container.service;
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
      const container = createContainer({
        broken: () => undefined as any,
      });

      expect(() => container.broken).toThrow(UndefinedReturnError);
    });

    it('includes hint about missing return', () => {
      try {
        const container = createContainer({
          broken: () => undefined as any,
        });
        container.broken;
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
      const container = createContainer({
        failing: () => { throw new Error('Connection refused'); },
      });

      expect(() => container.failing).toThrow(FactoryError);
    });

    it('preserves original error message', () => {
      try {
        const container = createContainer({
          failing: () => { throw new Error('Connection refused'); },
        });
        container.failing;
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
      const container = createContainer({
        db: () => { throw new Error('ECONNREFUSED'); },
        repo: (c) => c.db,
        service: (c) => c.repo,
      });

      try {
        container.service;
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
      const container = createContainer({
        a: (c) => c.b,
        b: (c) => c.a,
      });

      try {
        container.a;
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
      const container = createContainer({
        broken: () => undefined as any,
      });

      try {
        container.broken;
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
      const container = createContainer({
        failing: () => { throw new Error('boom'); },
      });

      try {
        container.failing;
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
        createContainer({ toString: () => 'x' }),
      ).toThrow(ReservedKeyError);
    });
  });

  describe('all errors extend ContainerError', () => {
    it('ContainerConfigError is a ContainerError', () => {
      try {
        createContainer({ x: 123 } as any);
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerError);
      }
    });

    it('ProviderNotFoundError is a ContainerError', () => {
      try {
        const c = createContainer({ a: () => 1 });
        (c as any).missing;
      } catch (e) {
        expect(e).toBeInstanceOf(ContainerError);
      }
    });
  });
});
