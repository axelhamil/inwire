/**
 * Introspection for tooling. Run: pnpm example:introspection
 *
 * The dependency graph is recorded while factories run, so `inspect()` returns the
 * real graph as JSON (for an LLM, a dashboard, a CI diff) without annotations.
 */
import { container } from '../src/index.js';

const app = container()
  .add('config', { databaseUrl: 'postgres://localhost/app' })
  .add('db', (c) => ({ url: c.config.databaseUrl }))
  .add('users', (c) => ({ find: (id: string) => `${c.db.url}/users/${id}` }))
  .addTransient('requestId', () => crypto.randomUUID())
  .add('audit', (c) => ({ requestId: c.requestId }))
  .build();

app.users.find('42');
app.audit; // a singleton capturing a transient: reported as a warning

console.log(JSON.stringify(app.inspect(), null, 2));
console.log(app.describe('users'));
console.log(app.health().warnings.map((warning) => warning.message));
console.log(String(app));
