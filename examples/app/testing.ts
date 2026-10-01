/**
 * Testing the app the way a test suite would. Run: pnpm example:testing
 *
 * `createApi()` returns the builder, so a test overrides bindings before `build()`.
 * Nothing is resolved yet, so every dependent (repositories, use cases, routes)
 * receives the doubles. The override must keep the binding's type.
 */
import assert from 'node:assert/strict';
import { ContainerDisposedError } from '../../src/index.js';
import { createApi } from './api.js';
import { Pool, type TemporalClient, type WorkflowStartOptions } from './shared/resources.js';

const testEnv = { databaseUrl: 'postgres://test', temporalAddress: 'test', port: 0 };

const started: WorkflowStartOptions[] = [];
const fakeTemporal: TemporalClient = {
  connection: { close: async () => {} },
  workflow: { start: async (_type, options) => void started.push(options) },
};

const seededPool = new Pool({ connectionString: 'memory://test' });
await seededPool.query('insert into channel.profiles', [{ id: 'c1', displayName: 'Axel' }]);
await seededPool.query('insert into ingestion.recordings', [{ id: 'r1', channelId: 'c1' }]);

const app = createApi(testEnv)
  .override('pool', seededPool)
  .override('temporal', fakeTemporal)
  .build();

const response = await app.router.handle('POST', '/recordings/r1/process');

assert.equal(response.status, 202);
assert.deepEqual(
  started.map((options) => options.workflowId),
  ['process-recording-r1'],
  'the route reached the fake Temporal client through the use case and the starter',
);

// The overrides replaced the dispose hooks too: the doubles have nothing to close.
await app.dispose();
assert.throws(() => app.router, ContainerDisposedError);

console.log('testing.ts: all assertions passed');
