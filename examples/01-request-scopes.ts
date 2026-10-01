/**
 * Per-request scopes. Run: pnpm example:scopes
 *
 * A scope is a child container: it adds request-level bindings and reuses the parent
 * singletons. `await using` disposes it when the handler returns, even on throw,
 * without touching the parent.
 */
import { container } from '../src/index.js';

class RequestLog {
  readonly lines: string[] = [];

  constructor(private readonly requestId: string) {}

  write(line: string) {
    this.lines.push(`[${this.requestId}] ${line}`);
  }

  onDestroy() {
    console.log(this.lines.join('\n'));
  }
}

const app = container()
  .add('config', { greeting: 'hello' })
  .addTransient('now', () => new Date())
  .build();

async function handleRequest(name: string) {
  await using request = app.scope(
    { requestId: () => crypto.randomUUID().slice(0, 8) },
    { name: `request:${name}` },
  );
  await using handler = request.scope({ log: (c) => new RequestLog(c.requestId) });

  handler.log.write(`${app.config.greeting} ${name}`);
  handler.log.write(`at ${handler.now.toISOString()}`); // transient: a fresh Date per read
  return handler.requestId;
}

const [first, second] = await Promise.all([handleRequest('Ada'), handleRequest('Linus')]);
console.log(
  `isolated: ${first !== second}, parent singletons: [${app.health().resolved.join(', ')}]`,
);
