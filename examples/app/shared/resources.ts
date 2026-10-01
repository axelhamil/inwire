/**
 * Stand-ins for third-party resources (pg, Temporal, a polling loop). Like the real
 * ones, they have no `onDestroy()`: the composition roots close them with a
 * per-binding `dispose` hook.
 */

type Row = Record<string, unknown>;

/** In-memory stand-in for `pg.Pool`: understands the few statements the examples send. */
export class Pool {
  readonly tables = new Map<string, Row[]>();

  constructor(readonly config: { connectionString: string }) {}

  async query<T = Row>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    const [, verb, table = ''] = /^(insert into|select \* from|delete from) (\S+)/.exec(text) ?? [];
    const rows = this.tables.get(table) ?? [];

    if (verb === 'insert into') {
      this.tables.set(table, [...rows, values[0] as Row]);
      return { rows: [] };
    }

    const matches = text.includes('where id = $1') ? rows.filter((r) => r.id === values[0]) : rows;
    if (verb === 'delete from')
      this.tables.set(
        table,
        rows.filter((r) => !matches.includes(r)),
      );
    return { rows: matches as T[] };
  }

  async end(): Promise<void> {
    console.log('[pg] pool closed');
  }
}

export interface WorkflowStartOptions {
  workflowId: string;
  taskQueue: string;
  args: unknown[];
}

export interface TemporalClient {
  connection: { close(): Promise<void> };
  workflow: { start(workflowType: string, options: WorkflowStartOptions): Promise<void> };
}

/** Stand-in for a Temporal client on a lazy connection (`Connection.lazy()`). */
export function connectTemporal(options: { address: string }): TemporalClient {
  const started = new Set<string>();

  return {
    connection: {
      close: async () => console.log(`[temporal] connection to ${options.address} closed`),
    },
    workflow: {
      // Starting twice with the same workflowId is a no-op, which makes redelivery harmless.
      start: async (workflowType, { workflowId }) => {
        if (started.has(workflowId)) return;
        started.add(workflowId);
        console.log(`[temporal] started ${workflowType} (${workflowId})`);
      },
    },
  };
}

/** Runs `tick` every `intervalMs`, one at a time. Returns the function that stops it. */
export function startRelayLoop(tick: () => Promise<void>, intervalMs: number) {
  let running = Promise.resolve();
  const timer = setInterval(() => {
    running = running.then(tick).catch((error) => console.error('[relay] tick failed', error));
  }, intervalMs);

  return async (): Promise<void> => {
    clearInterval(timer);
    await running;
    console.log('[relay] stopped');
  };
}
