// Bun usage: bun run examples/08-bun.ts
/**
 * Example 08 — Bun runtime
 *
 * Bun reads node_modules normally, so the import specifier is identical to Node.
 * Showcases: container(), .add(), .build(), .scope(), OnInit/OnDestroy lifecycle.
 */
import { container } from '../src/index.js';

// ── Services ────────────────────────────────────────────────────────────────

interface ILogger {
  log(msg: string): void;
}

class ConsoleLogger implements ILogger {
  onInit() {
    console.log('[Logger] initialized');
  }
  onDestroy() {
    console.log('[Logger] shut down');
  }
  log(msg: string) {
    console.log(`[LOG] ${msg}`);
  }
}

interface IRequestContext {
  requestId: string;
  startedAt: number;
}

// ── Container ────────────────────────────────────────────────────────────────

const app = container()
  .add('config', { appName: 'BunApp', port: 3000 })
  .add('logger', (): ILogger => new ConsoleLogger())
  .build();

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  app.logger.log(`starting ${app.config.appName} on :${app.config.port}`);

  // .scope() — child container with per-request bindings
  const req = app.scope(
    {
      requestId: () => crypto.randomUUID(),
      startedAt: (): number => Date.now(),
    },
    { name: 'http-request' },
  );

  const ctx: IRequestContext = { requestId: req.requestId, startedAt: req.startedAt };
  app.logger.log(`request ${ctx.requestId} started at ${ctx.startedAt}`);

  // Parent singleton survives the scope
  console.log(`same logger: ${req.logger === app.logger}`);

  // Introspection
  const health = app.health();
  console.log(`providers: ${health.totalProviders}, resolved: [${health.resolved.join(', ')}]`);

  await app.dispose();
}

main().catch(console.error);
