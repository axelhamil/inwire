/**
 * Composition root of the worker (Temporal activities, outbox relay). Run: pnpm example:worker
 *
 * Temporal workflow code runs in a deterministic sandbox: it never imports a
 * `*.module.ts`, this file, a container or inwire. It calls activities by name, and
 * only the activities built here from container bindings touch the database.
 */
import { pathToFileURL } from 'node:url';
import { container } from '../../src/index.js';
import { channelModule } from './channel/channel.module.js';
import { ingestionModule } from './ingestion/ingestion.module.js';
import { connectTemporal, Pool, startRelayLoop } from './shared/resources.js';

export interface WorkerEnv {
  databaseUrl: string;
  temporalAddress: string;
  relayIntervalMs: number;
}

export function createWorker(env: WorkerEnv) {
  return container({ disposeTimeout: 5_000 })
    .add('env', env)
    .add('pool', (c) => new Pool({ connectionString: c.env.databaseUrl }), {
      dispose: (pool) => pool.end(),
    })
    .add('temporal', (c) => connectTemporal({ address: c.env.temporalAddress }), {
      dispose: (temporal) => temporal.connection.close(),
    })
    .addModule(channelModule)
    .addModule(ingestionModule)
    .add(
      'relay',
      (c) => {
        // Read before the loop starts: it records the dependency, so a plain dispose()
        // stops the relay before closing the pool it uses.
        const outbox = c.ingestionOutbox;
        return startRelayLoop(() => outbox.flush(), c.env.relayIntervalMs);
      },
      { dispose: (stop) => stop() },
    );
}

export type Worker = ReturnType<ReturnType<typeof createWorker>['build']>;

/** Stops the loop before closing what it uses, then tears down everything else. */
export async function shutdownWorker(app: Worker) {
  await app.dispose('relay');
  await app.dispose();
}

async function main() {
  const app = createWorker({
    databaseUrl: 'postgres://localhost:5434/afterlive',
    temporalAddress: 'localhost:7243',
    relayIntervalMs: 20,
  }).build();

  await app.preload(); // starts the relay loop

  // Handed to `Worker.create({ activities, workflowsPath, taskQueue })` in a real worker.
  const activities = app.ingestionActivities;

  await app.updateChannelProfile.execute({ id: 'c1', displayName: 'Axel' });
  await activities.detectRecording({ id: 'r1', channelId: 'c1' });
  await new Promise((resolve) => setTimeout(resolve, 60)); // let the relay publish it

  process.once('SIGTERM', () => {
    void shutdownWorker(app).then(() => process.exit(0));
  });
  process.kill(process.pid, 'SIGTERM');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
