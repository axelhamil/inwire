/**
 * inwire — Resolution performance benchmarks
 *
 * Measures: build time, first resolution (cold), subsequent resolution (cached singleton),
 * transient resolution (no cache), scope creation, and preload() time.
 *
 * Sizes: 10, 100, 1000 providers.
 *
 * Run: pnpm run bench
 */

import { performance } from 'node:perf_hooks';
import { container, transient } from '../src/index.js';

const SIZES = [10, 100, 1000] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function fmt(ns: number): string {
  if (ns < 1_000) return `${ns.toFixed(1)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

/** Run fn() for `iters` iterations, return durations in nanoseconds. */
function measure(fn: () => void, iters: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < iters; i++) {
    const start = performance.now();
    fn();
    results.push((performance.now() - start) * 1_000_000);
  }
  return results;
}

// ── Container factories ───────────────────────────────────────────────────────

function buildFlat(n: number) {
  let b = container() as any;
  for (let i = 0; i < n; i++) {
    b = b.add(`svc${i}`, () => ({ value: i }));
  }
  return b;
}

function buildTransient(n: number) {
  let b = container() as any;
  for (let i = 0; i < n; i++) {
    b = b.add(
      `svc${i}`,
      transient(() => ({ value: i })),
    );
  }
  return b;
}

// ── Benchmark suite ───────────────────────────────────────────────────────────

interface BenchRow {
  size: number;
  'build (median)': string;
  'cold resolve (median)': string;
  'cached resolve (median)': string;
  'transient resolve (median)': string;
  'scope create (median)': string;
  'preload (median)': string;
}

async function runForSize(n: number): Promise<BenchRow> {
  const BUILD_ITERS = 100;
  const RESOLVE_ITERS = 10_000;
  const TRANSIENT_ITERS = 1_000;
  const SCOPE_ITERS = 100;
  const PRELOAD_ITERS = n === 1000 ? 10 : 100;

  // ── Build time ──────────────────────────────────────────────────────────────
  buildFlat(n).build(); // warm up
  const buildTimes = measure(() => buildFlat(n).build(), BUILD_ITERS);

  // ── Cold resolution — rebuilds container each time (includes build cost) ───
  {
    const c = buildFlat(n).build() as any;
    void c.svc0; // warm up
  }
  const coldTimes = measure(() => {
    const c = buildFlat(n).build() as any;
    void c.svc0;
  }, BUILD_ITERS);

  // ── Cached singleton resolution ─────────────────────────────────────────────
  const cachedC = buildFlat(n).build() as any;
  void cachedC.svc0; // prime + warm up
  void cachedC.svc0;
  const cachedTimes = measure(() => {
    void cachedC.svc0;
  }, RESOLVE_ITERS);

  // ── Transient resolution ────────────────────────────────────────────────────
  const transientC = buildTransient(n).build() as any;
  void transientC.svc0; // warm up
  const transientTimes = measure(() => {
    void transientC.svc0;
  }, TRANSIENT_ITERS);

  // ── Scope creation ──────────────────────────────────────────────────────────
  const scopeBase = buildFlat(n).build();
  void scopeBase.svc0; // ensure parent resolver is initialized
  const scopeOverride = { scopedVal: () => ({ v: 1 }) } as any;
  scopeBase.scope(scopeOverride); // warm up
  const scopeTimes = measure(() => {
    scopeBase.scope(scopeOverride);
  }, SCOPE_ITERS);

  // ── Preload ─────────────────────────────────────────────────────────────────
  {
    const c = buildFlat(n).build();
    await c.preload(); // warm up
  }
  const preloadTimes: number[] = [];
  for (let i = 0; i < PRELOAD_ITERS; i++) {
    const c = buildFlat(n).build();
    const start = performance.now();
    await c.preload();
    preloadTimes.push((performance.now() - start) * 1_000_000);
  }

  return {
    size: n,
    'build (median)': fmt(median(buildTimes)),
    'cold resolve (median)': fmt(median(coldTimes)),
    'cached resolve (median)': fmt(median(cachedTimes)),
    'transient resolve (median)': fmt(median(transientTimes)),
    'scope create (median)': fmt(median(scopeTimes)),
    'preload (median)': fmt(median(preloadTimes)),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n inwire — Resolution Performance Benchmarks');
  console.log(' ==========================================\n');

  const results: BenchRow[] = [];

  for (const n of SIZES) {
    process.stdout.write(` Running size=${n}...`);
    const row = await runForSize(n);
    results.push(row);
    process.stdout.write(' done\n');
  }

  console.log('');
  console.table(results);

  console.log('\n Notes:');
  console.log('  - All durations are median over multiple iterations (warmed up).');
  console.log('  - "cold resolve" rebuilds the container each time — includes build overhead.');
  console.log('  - "cached resolve" accesses an already-resolved singleton (pure Proxy overhead).');
  console.log('  - "transient resolve" always creates a new instance (no cache).');
  console.log('  - "preload" resolves all N providers eagerly in topological order.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
