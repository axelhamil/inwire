/**
 * Example 04 — Modules
 *
 * Showcases:
 * - defineModule(): typed, reusable modules with locally-declared prerequisites (no shared AppDeps)
 * - addModule(): apply a defineModule on the builder, prerequisites enforced at compile time
 * - .merge(): fuse a standalone builder into another (for modules without prerequisites)
 * - container.module() (post-build): same DX, applied to a built container
 */
import { container, defineModule } from '../src/index.js';

// ── Types shared across modules ─────────────────────────────────────────────

interface Logger {
  log: (msg: string) => void;
}

interface DB {
  query: (sql: string) => string;
}

// ── defineModule() — modules with prerequisites ─────────────────────────────
// Prerequisites are declared LOCALLY. No import of a global AppDeps.
// The output type is INFERRED from the .add() chain.

const dbModule = defineModule<{ config: { dbUrl: string }; logger: Logger }>()((b) =>
  b
    .add(
      'db',
      (c): DB => ({
        query(sql) {
          c.logger.log(`[db ${c.config.dbUrl}] ${sql}`);
          return `result: ${sql}`;
        },
      }),
    )
    .add('cache', (c) => {
      const store = new Map<string, string>();
      return {
        get: (key: string) => store.get(key),
        set: (key: string, val: string) => {
          store.set(key, val);
          c.logger.log(`[cache] set ${key}`);
        },
      };
    }),
);

const authModule = defineModule<{ logger: Logger }>()((b) =>
  b
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
    })),
);

const userModule = defineModule<{ db: DB; logger: Logger }>()((b) =>
  b
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
    })),
);

// ── Build with addModule() — order is enforced by prerequisites ─────────────

const app = container()
  .add('config', { appName: 'ModularApp', dbUrl: 'postgres://localhost', port: 3000 })
  .add(
    'logger',
    (): Logger => ({
      log: (msg: string) => console.log(`  ${msg}`),
    }),
  )
  .addModule(dbModule)
  .addModule(authModule)
  .addModule(userModule)
  .build();

console.log('=== Use services ===');
app.authMiddleware.authenticate('valid-token');
const result = app.userService.getUser('42');
console.log(`  result: ${result}`);

app.cache.set('user:42', 'cached');
console.log(`  cached: ${app.cache.get('user:42')}`);

// ── .merge() — fuse a standalone builder ────────────────────────────────────
// When a module has no external prerequisites, define it as a standalone
// builder and merge it into the host. Cross-builder deps resolve at build time.

const metricsModule = container()
  .add('counter', () => {
    let value = 0;
    return {
      get value() {
        return value;
      },
      inc: () => {
        value++;
      },
    };
  })
  .add('metrics', (c) => ({
    record(label: string) {
      c.counter.inc();
      console.log(`  [metrics] ${label} count=${c.counter.value}`);
    },
  }));

console.log('\n=== Merge standalone module ===');
const withMetrics = container()
  .add('logger', (): Logger => ({ log: (msg) => console.log(`  ${msg}`) }))
  .merge(metricsModule)
  .build();

withMetrics.metrics.record('event-a');
withMetrics.metrics.record('event-b');

// ── Post-build: container.module() ──────────────────────────────────────────
// Same DX on an already-built container.

console.log('\n=== Post-build module() ===');

const core = container()
  .add('config', { dbUrl: 'postgres://localhost' })
  .add('logger', (): Logger => ({ log: (msg) => console.log(`  ${msg}`) }))
  .build();

const withDb = core.module((b) =>
  b.add(
    'db',
    (c): DB => ({
      query: (sql: string) => {
        c.logger.log(`[db] ${sql}`);
        return `result: ${sql}`;
      },
    }),
  ),
);

const full = withDb.module((b) =>
  b.add('userService', (c) => ({
    getUser: (id: string) => {
      c.logger.log(`[user] getUser(${id})`);
      return c.db.query(`SELECT * FROM users WHERE id='${id}'`);
    },
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
