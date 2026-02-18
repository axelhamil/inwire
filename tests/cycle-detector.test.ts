import { describe, expect, it } from 'vitest';
import { CycleDetector } from '../src/infrastructure/cycle-detector.js';

describe('CycleDetector', () => {
  it('tracks entering and leaving resolution', () => {
    const detector = new CycleDetector();
    expect(detector.isResolving('a')).toBe(false);
    detector.enter('a');
    expect(detector.isResolving('a')).toBe(true);
    detector.leave('a');
    expect(detector.isResolving('a')).toBe(false);
  });

  it('detects a key already being resolved', () => {
    const detector = new CycleDetector();
    detector.enter('a');
    detector.enter('b');
    expect(detector.isResolving('a')).toBe(true);
    expect(detector.isResolving('b')).toBe(true);
  });

  it('handles independent resolution chains', () => {
    const detector = new CycleDetector();
    detector.enter('a');
    detector.leave('a');
    detector.enter('b');
    expect(detector.isResolving('a')).toBe(false);
    expect(detector.isResolving('b')).toBe(true);
    detector.leave('b');
  });
});
