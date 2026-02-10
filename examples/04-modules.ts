/**
 * Example 04 — Modules
 *
 * Showcases:
 * - addModule() for typed module composition on the builder (pre-build)
 * - module() for typed module composition on the container (post-build)
 * - Reusable modules as functions, c fully typed in every factory
 */
import { container, transient, detectDuplicateKeys, ContainerBuilder } from '../src/index.js';

// ── Module definitions ──────────────────────────────────────────────────────
// A module is a function (builder) => builder that chains .add() calls.
// c in every factory is fully typed — same as inline .add().

function dbModule<T extends { config: { dbUrl: string }; logger: { log: (msg: string) => void } }>(
  b: ContainerBuilder<Record<string, any>, T>,
) {
  return b
    .add('db', (c) => ({
      query(sql: string) {
        c.logger.log(`[db] ${sql}`);
        return `result: ${sql}`;
      },
    }))
    .add('cache', (c) => {
      const store = new Map<string, string>();
      return {
        get: (key: string) => store.get(key),
        set: (key: string, val: string) => {
          store.set(key, val);
          c.logger.log(`[cache] set ${key}`);
        },
      };
    });
}

function authModule<T extends { logger: { log: (msg: string) => void } }>(
  b: ContainerBuilder<Record<string, any>, T>,
) {
  return b
    .add('tokenService', () => ({
      verify: (token: string) => token === 'valid-token',
      sign: (userId: string) => `token-${userId}`,
    }))
    .add('authMiddleware', (c) => ({
      authenticate(token: string) {
        const ok = c.tokenService.verify(token);
        c.logger.log(`[auth] ${ok ? 'granted' : 'denied'}`);
        return ok;
      },
    }));
}

function userModule<T extends {
  db: { query: (sql: string) => string };
  logger: { log: (msg: string) => void };
}>(
  b: ContainerBuilder<Record<string, any>, T>,
) {
  return b
    .add('userRepo', (c) => ({
      findById(id: string) {
        return c.db.query(`SELECT * FROM users WHERE id = '${id}'`);
      },
    }))
    .add('userService', (c) => ({
      getUser(id: string) {
        c.logger.log(`[user] getUser(${id})`);
        return c.userRepo.findById(id);
      },
    }));
}

// ── Build with modules ──────────────────────────────────────────────────────

const app = container()
  .add('config', { appName: 'ModularApp', dbUrl: 'postgres://localhost', port: 3000 })
  .add('logger', () => ({
    log: (msg: string) => console.log(`  ${msg}`),
  }))
  .addModule(dbModule)
  .addModule(authModule)
  .addModule(userModule)
  .build();

// ── Use composed container ──────────────────────────────────────────────────

console.log('=== Use services ===');
app.authMiddleware.authenticate('valid-token');
const result = app.userService.getUser('42');
console.log(`  result: ${result}`);

app.cache.set('user:42', 'cached');
console.log(`  cached: ${app.cache.get('user:42')}`);

// ── Inline module (no separate function needed) ─────────────────────────────

console.log('\n=== Inline module ===');
const withMetrics = container()
  .add('logger', () => ({ log: (msg: string) => console.log(`  ${msg}`) }))
  .addModule((b) => b
    .add('counter', () => ({ value: 0, inc() { this.value++; } }))
    .add('metrics', (c) => ({
      record() {
        c.counter.inc();
        c.logger.log(`[metrics] count=${c.counter.value}`);
      },
    })),
  )
  .build();

withMetrics.metrics.record();
withMetrics.metrics.record();

// ── Post-build module() — compose after .build() ───────────────────────────
// Same DX as addModule(), but on an existing container.
// Internally: module() uses the builder for typed c, then delegates to extend().

console.log('\n=== Post-build module() ===');

const core = container()
  .add('config', { dbUrl: 'postgres://localhost' })
  .add('logger', () => ({ log: (msg: string) => console.log(`  ${msg}`) }))
  .build();

// db module — post-build, c is typed as core's deps
const withDb = core.module((b) => b
  .add('db', (c) => ({
    query: (sql: string) => { c.logger.log(`[db] ${sql}`); return `result: ${sql}`; },
  })),
);

// user module — chained, c accumulates previous module's deps
const full = withDb.module((b) => b
  .add('userService', (c) => ({
    getUser: (id: string) => { c.logger.log(`[user] getUser(${id})`); return c.db.query(`SELECT * FROM users WHERE id='${id}'`); },
  })),
);

console.log(`  ${full.userService.getUser('42')}`);

// ── Introspection ───────────────────────────────────────────────────────────

console.log('\n=== Container ===');
console.log(String(app));

console.log('\n=== Graph ===');
console.log(JSON.stringify(app.inspect(), null, 2));

console.log('\n=== Health ===');
const health = app.health();
console.log(`  providers: ${health.totalProviders}`);
console.log(`  resolved: [${health.resolved.join(', ')}]`);
console.log(`  unresolved: [${health.unresolved.join(', ')}]`);
