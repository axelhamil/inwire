import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

describe('scope mismatch detection', () => {
  it('warns when singleton depends on transient', () => {
    const c = container()
      .addTransient('requestId', () => Math.random())
      .add('service', (c: any) => ({ id: c.requestId }))
      .build();

    // Resolve the singleton that depends on transient
    c.service;

    const health = c.health();
    expect(health.warnings.length).toBeGreaterThan(0);
    expect(health.warnings[0].type).toBe('scope_mismatch');
    expect(health.warnings[0].details).toEqual({
      singleton: 'service',
      transient: 'requestId',
    });
  });

  it('warning has descriptive message property', () => {
    const c = container()
      .addTransient('requestId', () => Math.random())
      .add('service', (c: any) => ({ id: c.requestId }))
      .build();

    c.service;

    const warning = c.health().warnings[0];
    expect(warning.message).toContain('service');
    expect(warning.message).toContain('requestId');
    expect(warning.message).toContain('Singleton');
    expect(warning.message).toContain('transient');
  });

  it('multiple transient deps produce multiple warnings', () => {
    const c = container()
      .addTransient('reqId', () => Math.random())
      .addTransient('timestamp', () => Date.now())
      .add('service', (c: any) => ({ id: c.reqId, ts: c.timestamp }))
      .build();

    c.service;

    const warnings = c.health().warnings;
    expect(warnings.length).toBe(2);
    expect(warnings.map((w) => w.details.transient)).toContain('reqId');
    expect(warnings.map((w) => w.details.transient)).toContain('timestamp');
  });

  it('no warning when singleton depends on singleton', () => {
    const c = container()
      .add('config', () => ({ port: 3000 }))
      .add('service', (c) => ({ port: c.config.port }))
      .build();

    c.service;

    const health = c.health();
    expect(health.warnings).toEqual([]);
  });

  it('no warning when transient depends on transient', () => {
    const c = container()
      .addTransient('a', () => Math.random())
      .addTransient('b', (c: any) => c.a * 2)
      .build();

    c.b;
    c.b;

    const health = c.health();
    expect(health.warnings).toEqual([]);
  });

  it('no warning when transient depends on singleton', () => {
    const c = container()
      .add('config', () => ({ base: 'http://api.com' }))
      .addTransient('url', (c) => `${c.config.base}/${Math.random()}`)
      .build();

    c.url;

    const health = c.health();
    expect(health.warnings).toEqual([]);
  });
});
