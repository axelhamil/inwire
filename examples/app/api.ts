/**
 * Composition root of the API host. Run: pnpm example:api
 *
 * It is the only file that knows every module: it adds the infrastructure, then each
 * module explicitly, in dependency order. `createApi()` returns the builder, not a
 * built container, so tests can override bindings before `build()` (see testing.ts),
 * and nothing exports a container for other files to import.
 */
import { pathToFileURL } from 'node:url';
import { container } from '../../src/index.js';
import { channelModule } from './channel/channel.module.js';
import { ingestionModule } from './ingestion/ingestion.module.js';
import { createRouter } from './shared/http.js';
import { connectTemporal, Pool } from './shared/resources.js';

export interface ApiEnv {
  databaseUrl: string;
  temporalAddress: string;
  port: number;
}

export function createApi(env: ApiEnv) {
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
    .add('router', (c) => createRouter([...c.channelRoutes, ...c.recordingRoutes]));
}

async function main() {
  const app = createApi({
    databaseUrl: 'postgres://localhost:5434/afterlive',
    temporalAddress: 'localhost:7243',
    port: 3100,
  }).build();

  // Resolves every binding and awaits async onInit(), so a broken wiring fails at boot.
  await app.preload();

  // Stands in for the HTTP server: keeps the process alive until shutdown.
  const server = setInterval(() => {}, 60_000);
  console.log(`[api] listening on :${app.env.port}`);

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal}, shutting down`);
    clearInterval(server);
    await app.dispose(); // temporal then pool, the reverse of resolution order
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  console.log(await app.router.handle('POST', '/channels/c1', { displayName: 'Axel' }));
  console.log(await app.router.handle('GET', '/channels/c1'));
  console.log(await app.router.handle('POST', '/recordings/r1/process')); // 404, not detected yet
  await app.pool.query('insert into ingestion.recordings', [{ id: 'r1', channelId: 'c1' }]);
  console.log(await app.router.handle('POST', '/recordings/r1/process')); // 202

  // The example stops itself, as an orchestrator would.
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
