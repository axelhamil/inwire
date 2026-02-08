import { describe, it, expect } from 'vitest';
import { Validator, detectDuplicateKeys } from '../src/domain/validation.js';

describe('Validator', () => {
  const validator = new Validator();

  describe('validateConfig', () => {
    it('passes for valid config', () => {
      expect(() =>
        validator.validateConfig({
          a: () => 1,
          b: (c: any) => c.a,
        }),
      ).not.toThrow();
    });

    it('throws for string values', () => {
      expect(() =>
        validator.validateConfig({ key: 'value' }),
      ).toThrow();
    });

    it('throws for number values', () => {
      expect(() =>
        validator.validateConfig({ port: 3000 }),
      ).toThrow();
    });

    it('throws for object values', () => {
      expect(() =>
        validator.validateConfig({ config: { host: 'localhost' } }),
      ).toThrow();
    });

    it('throws for null values', () => {
      expect(() =>
        validator.validateConfig({ nothing: null }),
      ).toThrow();
    });

    it('throws for reserved keys', () => {
      expect(() =>
        validator.validateConfig({ inspect: () => 'x' }),
      ).toThrow();
    });
  });

  describe('suggestKey (fuzzy matching)', () => {
    it('suggests close matches', () => {
      expect(
        validator.suggestKey('userRepo', ['userRepository', 'logger', 'db']),
      ).toBe('userRepository');
    });

    it('suggests exact substring matches', () => {
      expect(
        validator.suggestKey('loger', ['logger', 'db', 'cache']),
      ).toBe('logger');
    });

    it('returns undefined for completely different keys', () => {
      expect(
        validator.suggestKey('xyz', ['logger', 'db', 'cache']),
      ).toBeUndefined();
    });

    it('handles empty registered list', () => {
      expect(validator.suggestKey('anything', [])).toBeUndefined();
    });

    it('picks the closest match', () => {
      expect(
        validator.suggestKey('usrService', ['userService', 'authService', 'logService']),
      ).toBe('userService');
    });
  });
  describe('fuzzy matching 50% similarity boundary', () => {
    it('suggests when similarity is exactly at 50%', () => {
      // 'ab' vs 'abcd' => distance 2, maxLen 4, similarity 0.5 => should suggest
      expect(validator.suggestKey('ab', ['abcd'])).toBe('abcd');
    });

    it('does not suggest when similarity is below 50%', () => {
      // 'a' vs 'abcd' => distance 3, maxLen 4, similarity 0.25 => no suggestion
      expect(validator.suggestKey('a', ['abcd'])).toBeUndefined();
    });

    it('suggests for single character difference', () => {
      // 'loger' vs 'logger' => distance 1, maxLen 6, similarity ~0.83
      expect(validator.suggestKey('loger', ['logger'])).toBe('logger');
    });
  });
});

describe('detectDuplicateKeys', () => {
  it('detects duplicate keys across modules', () => {
    const moduleA = { logger: () => 1, db: () => 2 };
    const moduleB = { logger: () => 3, cache: () => 4 };

    const dupes = detectDuplicateKeys(moduleA, moduleB);
    expect(dupes).toEqual(['logger']);
  });

  it('returns empty array when no duplicates', () => {
    const moduleA = { a: () => 1 };
    const moduleB = { b: () => 2 };

    expect(detectDuplicateKeys(moduleA, moduleB)).toEqual([]);
  });

  it('handles three modules', () => {
    const a = { x: () => 1 };
    const b = { y: () => 2 };
    const c = { x: () => 3, y: () => 4 };

    const dupes = detectDuplicateKeys(a, b, c);
    expect(dupes).toContain('x');
    expect(dupes).toContain('y');
  });
});
