import { describe, it, expect } from 'vitest';
import { createContainer, transient } from '../src/index.js';

describe('scope mismatch detection', () => {
  it('warns when singleton depends on transient', () => {
    const container = createContainer({
      requestId: transient(() => Math.random()),
      service: (c) => ({ id: c.requestId }),
    });

    // Resolve the singleton that depends on transient
    container.service;

    const health = container.health();
    expect(health.warnings.length).toBeGreaterThan(0);
    expect(health.warnings[0].type).toBe('scope_mismatch');
    expect(health.warnings[0].details).toEqual({
      singleton: 'service',
      transient: 'requestId',
    });
  });

  it('warning has descriptive message property', () => {
    const container = createContainer({
      requestId: transient(() => Math.random()),
      service: (c) => ({ id: c.requestId }),
    });

    container.service;

    const warning = container.health().warnings[0];
    expect(warning.message).toContain('service');
    expect(warning.message).toContain('requestId');
    expect(warning.message).toContain('Singleton');
    expect(warning.message).toContain('transient');
  });

  it('multiple transient deps produce multiple warnings', () => {
    const container = createContainer({
      reqId: transient(() => Math.random()),
      timestamp: transient(() => Date.now()),
      service: (c) => ({ id: c.reqId, ts: c.timestamp }),
    });

    container.service;

    const warnings = container.health().warnings;
    expect(warnings.length).toBe(2);
    expect(warnings.map((w) => w.details.transient)).toContain('reqId');
    expect(warnings.map((w) => w.details.transient)).toContain('timestamp');
  });

  it('no warning when singleton depends on singleton', () => {
    const container = createContainer({
      config: () => ({ port: 3000 }),
      service: (c) => ({ port: c.config.port }),
    });

    container.service;

    const health = container.health();
    expect(health.warnings).toEqual([]);
  });

  it('no warning when transient depends on transient', () => {
    const container = createContainer({
      a: transient(() => Math.random()),
      b: transient((c) => c.a * 2),
    });

    container.b;
    container.b;

    const health = container.health();
    expect(health.warnings).toEqual([]);
  });

  it('no warning when transient depends on singleton', () => {
    const container = createContainer({
      config: () => ({ base: 'http://api.com' }),
      url: transient((c) => `${c.config.base}/${Math.random()}`),
    });

    container.url;

    const health = container.health();
    expect(health.warnings).toEqual([]);
  });
});
