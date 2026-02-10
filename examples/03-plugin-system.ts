/**
 * Example 03 — Plugin System
 *
 * Showcases: extend chain, health, scoped jobs, JSON graph for LLM, graceful shutdown.
 */
import { container, transient } from '../src/index.js';

// ── Core services ───────────────────────────────────────────────────────────

class Logger {
  log(msg: string) {
    console.log(`[core] ${msg}`);
  }
  onDestroy() {
    console.log('[core] logger shut down');
  }
}

class Metrics {
  private counters = new Map<string, number>();

  inc(name: string) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }
  snapshot() {
    return Object.fromEntries(this.counters);
  }
  onDestroy() {
    console.log('[core] metrics flushed:', this.snapshot());
  }
}

interface Job {
  name: string;
  status: 'pending' | 'running' | 'done';
}

class JobStore {
  private jobs: Job[] = [];

  add(name: string): Job {
    const job: Job = { name, status: 'pending' };
    this.jobs.push(job);
    return job;
  }
  getAll() {
    return [...this.jobs];
  }
  onDestroy() {
    console.log(`[core] job store cleared (${this.jobs.length} jobs)`);
  }
}

// ── Core container (builder) ────────────────────────────────────────────────

const core = container()
  .add('logger', () => new Logger())
  .add('metrics', () => new Metrics())
  .add('jobStore', () => new JobStore())
  .build();

// ── Plugins — extend the core ───────────────────────────────────────────────

const withCsvPlugin = core.extend({
  csvParser: (c) => ({
    parse(raw: string) {
      c.logger.log('parsing CSV...');
      c.metrics.inc('csv.parsed');
      return raw.split('\n').map((line) => line.split(','));
    },
  }),
});

const withJsonPlugin = withCsvPlugin.extend({
  jsonTransformer: (c) => ({
    toJson(rows: string[][]) {
      c.logger.log('transforming to JSON...');
      c.metrics.inc('json.transformed');
      const [header, ...data] = rows;
      return data.map((row) =>
        Object.fromEntries(header.map((h, i) => [h, row[i]])),
      );
    },
  }),
});

const app = withJsonPlugin.extend({
  jobRunner: transient((c) => ({
    run(jobName: string, csvData: string) {
      const job = c.jobStore.add(jobName);
      job.status = 'running';

      const rows = c.csvParser.parse(csvData);
      const json = c.jsonTransformer.toJson(rows);

      job.status = 'done';
      c.logger.log(`job '${jobName}' done — ${json.length} records`);
      return json;
    },
  })),
});

// ── Run jobs in scoped containers ───────────────────────────────────────────

async function main() {
  console.log('=== Running jobs ===');

  const csvSample = 'name,age,city\nAlice,30,Paris\nBob,25,Lyon';

  // Each job gets its own scope
  const job1Scope = app.scope(
    { jobName: () => 'import-users' },
    { name: 'job-1' },
  );
  const result1 = job1Scope.jobRunner.run(job1Scope.jobName, csvSample);
  console.log('job1 result:', result1);

  const job2Scope = app.scope(
    { jobName: () => 'import-products' },
    { name: 'job-2' },
  );
  const result2 = job2Scope.jobRunner.run(job2Scope.jobName, 'sku,price\nA1,10\nB2,20');
  console.log('job2 result:', result2);

  // ── Health & introspection ──────────────────────────────────────────────

  console.log('\n=== Health ===');
  const health = app.health();
  console.log(`providers: ${health.totalProviders}`);
  console.log(`resolved: [${health.resolved.join(', ')}]`);
  console.log(`unresolved: [${health.unresolved.join(', ')}]`);
  console.log(`warnings: ${health.warnings.length}`);

  console.log('\n=== Container ===');
  console.log(String(app));

  console.log('\n=== Inspect (for LLM) ===');
  const graph = app.inspect();
  console.log(JSON.stringify(graph, null, 2));

  console.log('\n=== Metrics ===');
  console.log(app.metrics.snapshot());

  console.log('\n=== All jobs ===');
  console.log(app.jobStore.getAll());

  // ── Graceful shutdown ─────────────────────────────────────────────────

  console.log('\n=== Dispose ===');
  await app.dispose();
}

main().catch(console.error);
