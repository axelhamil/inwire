import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../examples/app/api.js';
import { ingestionModule } from '../examples/app/ingestion/ingestion.module.js';
import { Pool, startRelayLoop, type TemporalClient } from '../examples/app/shared/resources.js';
import { createWorker, shutdownWorker } from '../examples/app/worker.js';
import { ContainerDisposedError, container } from '../src/index.js';

/**
 * The recommended app layout (examples/app): one `*.module.ts` per business module,
 * one composition root per host, third-party resources closed by per-binding hooks.
 */

const apiEnv = { databaseUrl: 'memory://api', temporalAddress: 'test', port: 0 };
const workerEnv = { databaseUrl: 'memory://worker', temporalAddress: 'test', relayIntervalMs: 5 };

function fakeTemporal(onClose: () => void = () => {}) {
  const started: string[] = [];
  const client: TemporalClient = {
    connection: { close: async () => onClose() },
    workflow: { start: async (_type, { workflowId }) => void started.push(workflowId) },
  };
  return { client, started };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('examples/app', () => {
  it('composes the API host from both modules', async () => {
    const temporal = fakeTemporal();
    const app = createApi(apiEnv).override('temporal', temporal.client).build();

    await app.router.handle('POST', '/channels/c1', { displayName: 'Axel' });
    await app.ingestionActivities.detectRecording({ id: 'r1', channelId: 'c1' });
    const response = await app.router.handle('POST', '/recordings/r1/process');

    expect(response.status).toBe(202);
    expect(temporal.started).toEqual(['process-recording-r1']);
    await app.dispose();
  });

  it('composes the worker host, whose relay publishes detected recordings', async () => {
    const temporal = fakeTemporal();
    const app = createWorker(workerEnv).override('temporal', temporal.client).build();
    await app.preload();

    await app.updateChannelProfile.execute({ id: 'c1', displayName: 'Axel' });
    await app.ingestionActivities.detectRecording({ id: 'r1', channelId: 'c1' });

    await vi.waitFor(() => expect(temporal.started).toEqual(['process-recording-r1']));
    await shutdownWorker(app);
  });

  it('refuses at compile time a module whose prerequisites are missing', () => {
    const host = container().add('pool', () => new Pool({ connectionString: 'memory://' }));

    // @ts-expect-error 'temporal' and 'channels' are missing prerequisites of ingestionModule
    expect(() => host.addModule(ingestionModule)).not.toThrow();
  });

  it('injects a builder override into every dependent', async () => {
    const seeded = new Pool({ connectionString: 'memory://seeded' });
    await seeded.query('insert into channel.profiles', [{ id: 'c1', displayName: 'Seeded' }]);
    await seeded.query('insert into ingestion.recordings', [{ id: 'r1', channelId: 'c1' }]);
    const temporal = fakeTemporal();

    const app = createApi(apiEnv)
      .override('pool', seeded)
      .override('temporal', temporal.client)
      .build();

    expect((await app.router.handle('GET', '/channels/c1')).body).toEqual({
      id: 'c1',
      displayName: 'Seeded',
    });
    expect((await app.router.handle('POST', '/recordings/r1/process')).status).toBe(202);
    await app.dispose();
  });

  it('stops the relay before closing the clients it uses', async () => {
    const order: string[] = [];
    class TrackedPool extends Pool {
      override async end() {
        order.push('pool');
      }
    }
    const temporal = fakeTemporal(() => order.push('temporal'));

    const app = createWorker(workerEnv)
      .override('pool', () => new TrackedPool({ connectionString: 'memory://' }), {
        dispose: (pool) => pool.end(),
      })
      .override('temporal', () => temporal.client, { dispose: (t) => t.connection.close() })
      .override(
        'relay',
        (c) => {
          const outbox = c.ingestionOutbox;
          const stop = startRelayLoop(() => outbox.flush(), 5);
          return async () => {
            await stop();
            order.push('relay');
          };
        },
        { dispose: (stop) => stop() },
      )
      .build();
    void app.relay;

    await shutdownWorker(app);

    expect(order).toEqual(['relay', 'temporal', 'pool']);
  });

  it('closes an eager client never read, then refuses any access', async () => {
    const close = vi.fn();
    const temporal = fakeTemporal(close);
    const app = createApi(apiEnv)
      .override('temporal', temporal.client, { dispose: (t) => t.connection.close() })
      .build();
    void app.channelRoutes; // reads the pool only

    await app.dispose();

    expect(close).toHaveBeenCalledOnce();
    expect(() => app.router).toThrow(ContainerDisposedError);
    expect(() => app.pool).toThrow(ContainerDisposedError);
  });
});
