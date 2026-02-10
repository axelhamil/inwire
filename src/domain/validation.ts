import { ContainerConfigError, ReservedKeyError } from './errors.js';
import type { IValidator } from './types.js';
import { RESERVED_KEYS } from './types.js';

/**
 * Validates container configuration and provides fuzzy key matching.
 *
 * @example
 * ```typescript
 * const validator = new Validator();
 * validator.validateConfig({ apiKey: 'sk-123' });
 * // throws ContainerConfigError
 * ```
 */
export class Validator implements IValidator {
  /**
   * Validates that all values in the config are factory functions
   * and that no reserved keys are used.
   */
  validateConfig(config: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(config)) {
      if ((RESERVED_KEYS as readonly string[]).includes(key)) {
        throw new ReservedKeyError(key, RESERVED_KEYS);
      }
      if (typeof value !== 'function') {
        throw new ContainerConfigError(key, typeof value);
      }
    }
  }

  /**
   * Finds the closest registered key to a missing key using Levenshtein distance.
   * Returns `undefined` if no close match is found (threshold: 3).
   *
   * @example
   * ```typescript
   * validator.suggestKey('userRepo', ['userRepository', 'logger', 'db']);
   * // 'userRepository'
   * ```
   */
  suggestKey(key: string, registered: string[]): string | undefined {
    let bestMatch: string | undefined;
    let bestDistance = Infinity;

    for (const candidate of registered) {
      const distance = levenshtein(key, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = candidate;
      }
    }

    if (!bestMatch) return undefined;
    const maxLen = Math.max(key.length, bestMatch.length);
    const similarity = 1 - bestDistance / maxLen;
    return similarity >= 0.5 ? bestMatch : undefined;
  }
}

/**
 * Detects duplicate keys across multiple modules (spread objects).
 * Returns an array of keys that appear in more than one source.
 */
export function detectDuplicateKeys(...modules: Record<string, unknown>[]): string[] {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (const mod of modules) {
    for (const key of Object.keys(mod)) {
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count === 2) {
        duplicates.push(key);
      }
    }
  }

  return duplicates;
}

/**
 * Levenshtein distance between two strings.
 * Used for fuzzy key suggestion in error messages.
 */
function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[lb];
}
