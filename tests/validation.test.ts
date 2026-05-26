import { describe, expect, it } from 'vitest';
import { Validator } from '../src/domain/validation.js';

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
      expect(() => validator.validateConfig({ key: 'value' })).toThrow();
    });

    it('throws for number values', () => {
      expect(() => validator.validateConfig({ port: 3000 })).toThrow();
    });

    it('throws for object values', () => {
      expect(() => validator.validateConfig({ config: { host: 'localhost' } })).toThrow();
    });

    it('throws for null values', () => {
      expect(() => validator.validateConfig({ nothing: null })).toThrow();
    });

    it('throws for reserved keys', () => {
      expect(() => validator.validateConfig({ inspect: () => 'x' })).toThrow();
    });
  });

  describe('suggestKey (fuzzy matching)', () => {
    it('suggests close matches', () => {
      expect(validator.suggestKey('userRepo', ['userRepository', 'logger', 'db'])).toBe(
        'userRepository',
      );
    });

    it('suggests exact substring matches', () => {
      expect(validator.suggestKey('loger', ['logger', 'db', 'cache'])).toBe('logger');
    });

    it('returns undefined for completely different keys', () => {
      expect(validator.suggestKey('xyz', ['logger', 'db', 'cache'])).toBeUndefined();
    });

    it('handles empty registered list', () => {
      expect(validator.suggestKey('anything', [])).toBeUndefined();
    });

    it('picks the closest match', () => {
      expect(validator.suggestKey('usrService', ['userService', 'authService', 'logService'])).toBe(
        'userService',
      );
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

  describe('configurable similarityThreshold', () => {
    it('default threshold (0.5) behaves as before', () => {
      const v = new Validator();
      // 'loger' vs 'logger' ~0.83 => suggests
      expect(v.suggestKey('loger', ['logger'])).toBe('logger');
      // 'a' vs 'abcd' 0.25 => no suggestion
      expect(v.suggestKey('a', ['abcd'])).toBeUndefined();
    });

    it('stricter threshold (0.8) rejects weaker matches', () => {
      const v = new Validator(0.8);
      // 'loger' vs 'logger' ~0.83 => still suggests
      expect(v.suggestKey('loger', ['logger'])).toBe('logger');
      // 'userRepo' vs 'userRepository' — distance 5, maxLen 14, similarity ~0.64 => rejected at 0.8
      expect(v.suggestKey('userRepo', ['userRepository'])).toBeUndefined();
    });

    it('relaxed threshold (0.3) accepts weak matches', () => {
      const v = new Validator(0.3);
      // 'a' vs 'abcd' similarity 0.25 => still below 0.3, no suggestion
      expect(v.suggestKey('a', ['abcd'])).toBeUndefined();
      // 'ab' vs 'abcde' => distance 3, maxLen 5, similarity 0.4 => suggests at 0.3
      expect(v.suggestKey('ab', ['abcde'])).toBe('abcde');
    });
  });
});
