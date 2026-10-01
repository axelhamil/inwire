# inwire

**Type-safe dependency injection for TypeScript.** No decorators. No tokens. No `reflect-metadata`. Just a fluent builder, a Proxy, and full type inference. ~5 KB gzip, zero runtime dependencies.

[![NPM Version](https://img.shields.io/npm/v/inwire)](https://www.npmjs.com/package/inwire)
[![CI](https://img.shields.io/github/actions/workflow/status/axelhamil/inwire/ci.yml)](https://github.com/axelhamil/inwire/actions)
[![Bundle size](https://deno.bundlejs.com/badge?q=inwire&treeshake=[*])](https://bundlejs.com/?q=inwire&treeshake=[*])
[![NPM Downloads](https://img.shields.io/npm/dm/inwire)](https://npmtrends.com/inwire)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/inwire)](https://github.com/axelhamil/inwire/blob/main/LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/inwire)

```typescript
import { container } from 'inwire';

const app = container()
  .add('pool', () => new Pool(), { dispose: (pool) => pool.end() })
  .add('users', (c) => new UserRepository(c.pool)) // c.pool is typed
  .build();

await app.users.findById('42'); // lazy, singleton, fully typed
await app.dispose();            // pool.end() runs here
```

---

## Why inwire?

| | inwire | typical DI container |
|---|---|---|
| **Type inference** | Full: `c.db` autocompletes from `.add()` history | Manual generics or token strings |
| **Modules** | Prerequisites checked at compile time, errors name the missing key | Runtime lookup failures |
| **Decorators** | None | Required (`@Injectable`, `@Inject`) |
| **Runtime metadata** | None | `reflect-metadata` polyfill needed |
| **Circular deps** | Caught with full chain + fix hint | Stack overflow or cryptic crash |
| **Lifecycle** | `preload()` with topological parallelism, LIFO `dispose()` with per-binding hooks and timeouts | Manual `Promise.all` plumbing |
| **Introspection** | `inspect()` returns a JSON graph for LLMs and dashboards | None |
| **Bundle size** | ~5 KB gzip, `sideEffects: false` | 10 to 50 KB |
| **Runtime** | Pure ES2022: Node ≥ 20.4 and Bun (both in CI), Deno, Workers, browsers | Often Node only |

The **dependency graph is a side product**: a tracking Proxy records which keys each factory accesses, so `inspect()` returns the real graph without you ever annotating it.

---

## Install

```bash
pnpm add inwire   # or npm i inwire / bun add inwire
```

Requires TypeScript ≥ 5.0 and an ESM runtime or bundler (Node ≥ 20.4).

> Upgrading from 3.x? See [Migrating from 3.x](#migrating-from-3x).

---

## Structuring an app (recommended)

Three rules:

1. **One `*.module.ts` per business module.** It declares the bindings it *consumes* with `defineModule<TDeps>()` and adds its repositories, use cases and controllers. Modules never import each other: a dependency on another module is a prerequisite, wired by the app.
2. **One composition root per app** (API, worker, CLI). It adds the infrastructure, with a `dispose` hook for every resource, then composes the modules explicitly with `.addModule()`. No discovery by scan, no container singleton imported across files. It returns the **builder**, so tests can override bindings before `build()`.
3. **One entry point per app** builds, preloads, and wires `SIGTERM` to `dispose()`.

```typescript
// ingestion/ingestion.module.ts
import { defineModule } from 'inwire';
import type { Pool } from 'pg';

export const ingestionModule = defineModule<{ pool: Pool; clock: () => Date }>()((b) =>
  b
    .add('recordings', (c) => new PgRecordingRepository(c.pool))
    .add('detectRecording', (c) => new DetectRecordingUseCase(c.recordings, c.clock))
    .add('recordingRoutes', (c) => recordingRoutes({ detect: c.detectRecording })),
);
```

```typescript
// api.ts: composition root
import { container } from 'inwire';
import { Pool } from 'pg';
import { channelModule } from './channel/channel.module';
import { ingestionModule } from './ingestion/ingestion.module';

export function createApi(env: { DATABASE_URL: string }) {
  return container({ disposeTimeout: 5_000 })
    .add('pool', () => new Pool({ connectionString: env.DATABASE_URL }), {
      dispose: (pool) => pool.end(),
    })
    .add('clock', () => () => new Date())
    .addModule(channelModule)
    .addModule(ingestionModule);
}

export type Api = ReturnType<ReturnType<typeof createApi>['build']>; // derived, never hand-written
```

```typescript
// main.ts: entry point
import { createApi } from './api';

const app = createApi({ DATABASE_URL: process.env.DATABASE_URL ?? '' }).build();
await app.preload(); // awaits every async onInit(), fails fast at boot

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await app.dispose(); // LIFO teardown: routes, use cases, repositories, then pool.end()
    process.exit(0);
  });
}
```

**The compiler checks the wiring.** Adding a module before its prerequisites is an error that names them:

```typescript
import { container, defineModule } from 'inwire';

interface Pool { query(sql: string): Promise<unknown> }

const usersModule = defineModule<{ pool: Pool }>()((b) =>
  b.add('users', (c) => ({ find: (id: string) => c.pool.query(`select ${id}`) })),
);

// @ts-expect-error: { 'missing prerequisites': "pool" }
container().addModule(usersModule);
```

Two modules providing the same key fail the same way (`{ 'duplicate keys': "users" }`). The host keeps its own type for each prerequisite: if the app adds `pool` as a `PgPool`, `app.pool` stays a `PgPool`, not the module's narrower view.

**Workers and Temporal.** A worker has its own composition root, built the same way. Workflow code runs in Temporal's deterministic sandbox: it never imports a `*.module.ts`, the container or `inwire`. Only activities, created in the worker's composition root from container bindings, touch dependencies.

```typescript
// worker.ts: composition root of the worker
export function createWorker(env: { DATABASE_URL: string }) {
  return createInfrastructure(env) // pool, Temporal client...
    .addModule(ingestionModule)
    .add('activities', (c) => createIngestionActivities({ detect: c.detectRecording }))
    .add('relay', (c) => startRelayLoop(c.pool), { dispose: (stop) => stop() });
}
```

A complete, runnable version lives in [`examples/app/`](examples/app).

---

## Core concepts

### The container is a Proxy

`container()` returns a fluent builder. Each `.add(key, factory)` accumulates the type so the next factory's `c` argument is typed with everything declared so far. `.build()` wraps the factories in an ES Proxy: property access triggers lazy resolution and caches the result.

```typescript
const app = container()
  .add('db', () => new Database())
  .build();

app.db; // first access: factory runs, instance cached
app.db; // next accesses: cached instance
```

### Auto-tracked dependency graph

The `c` argument passed to each factory is itself a tracking Proxy. Every property access is recorded, which is how `inspect()` returns the real graph without annotations.

```typescript
const app = container()
  .add('db', () => new Database())
  .add('repo', (c) => new UserRepo(c.db))   // c.db touched: graph repo → [db]
  .build();

app.inspect();
// { providers: { db: { deps: [], ... }, repo: { deps: ['db'], ... } } }
```

### Singleton by default, transient on demand

```typescript
const app = container()
  .add('db', () => new Database())                       // singleton (cached)
  .addTransient('requestId', () => crypto.randomUUID())  // transient (fresh on each access)
  .build();

app.db === app.db;               // true
app.requestId === app.requestId; // false
```

For `scope()` and `extend()`, use the `transient()` wrapper:

```typescript
import { transient } from 'inwire';

const scoped = app.extend({
  timestamp: transient(() => Date.now()),
});
```

### Eager instances

A non-function value passed to `.add()` is registered eagerly:

```typescript
container()
  .add('config', { port: 3000 })            // eager: `{ port: 3000 }` is the value
  .add('db', (c) => new Database(c.config)) // lazy: a function is a factory
  .build();
```

To register a function *as a value*, wrap it: `.add('handler', () => myFunction)`.

### Lifecycle

Classes you own implement `onInit()` / `onDestroy()`. inwire detects them at runtime, no base class required:

```typescript
import type { OnDestroy, OnInit } from 'inwire';

class Cache implements OnInit, OnDestroy {
  async onInit()    { await this.warm(); }
  async onDestroy() { await this.flush(); }

  private async warm() {/* load hot keys */}
  private async flush() {/* write back */}
}
```

Objects you do not own (a pg pool, a Temporal client, the stop function of a loop) declare their teardown on the binding. The hook receives the instance, is typed against it, and takes precedence over `onDestroy()`:

```typescript
container()
  .add('pool', () => new Pool(), { dispose: (pool) => pool.end() })
  .add('temporal', () => connectTemporal(), { dispose: (client) => client.connection.close() })
  .add('relay', (c) => startRelayLoop(c.pool), { dispose: (stop) => stop() });
```

> **Sync property access cannot await.** Reading `app.db` calls `onInit()` but does **not** await it. Async errors are captured as `health().warnings`. To await async startup, use [`preload()`](#async-startup-preload).

---

## Cookbook

### Async startup: `preload()`

`preload()` is the **only** way to await async `onInit()`. It runs independent branches in parallel using a topological sort (Kahn's BFS), levels sequentially:

```
Level 0:  [config]            ← no deps
Level 1:  [db] [cache]        ← parallel, both depend on config
Level 2:  [api]               ← depends on db + cache
```

```typescript
await app.preload('db', 'cache'); // specific keys
await app.preload();              // everything
```

Errors from `onInit()` propagate, as a single `AggregateError` when several fail. Without `preload()`, async `onInit()` errors only show up in `health().warnings`: fine for hot reloads, dangerous for a production boot.

### Graceful shutdown: `dispose()`

`dispose()` tears down every resolved instance in **reverse resolution order**, then the eager instances (even never read). For each: the binding's `dispose` hook when declared, otherwise `onDestroy()`. It keeps going on errors and rethrows them at the end (`AggregateError` when several). Each instance is torn down at most once, even across containers derived with `extend()`.

```typescript
const app = container({ disposeTimeout: 5_000 }) // per hook, in ms
  .add('pool', () => new Pool(), { dispose: (pool) => pool.end() })
  .add('relay', (c) => startRelayLoop(c.pool), { dispose: (stop) => stop() })
  .build();

await app.dispose('relay'); // targeted: stop the loop first, the pool stays usable
await app.dispose();        // then everything else
```

- **Ordered by resolution.** A binding is torn down before the bindings its factory read. A loop that uses the pool must read `c.pool` (or what wraps it) in its factory, not only later in a callback, so that it stops before the pool closes.
- **Targeted.** `dispose(...keys)` tears down only those bindings.
- **Bounded.** With `disposeTimeout`, a hook still pending after the delay is reported as a `DisposeTimeoutError` and the next hooks run, so one stuck connection cannot block the shutdown.
- **Final.** A disposed binding is never recreated: reading it, iterating, or `preload()` throws `ContainerDisposedError` (a scope reading a key of its disposed parent too). While the hooks run, work they drain (in-flight requests, a last loop tick) can still read cached bindings; no factory runs. Introspection (`health()`, `inspect()`, `size`) keeps working. Build a new container when you need fresh instances.

**Explicit resource management:** every container implements `[Symbol.asyncDispose]`, so `await using` disposes it when the block exits:

```typescript
async function handleRequest(req: Request) {
  await using request = app.scope({
    requestId: () => crypto.randomUUID(),
    handler: (c) => new Handler(c.logger, c.requestId),
  });
  return request.handler.run(req);
} // request.dispose() runs here, even on throw
```

Requires TypeScript ≥ 5.2 and a runtime with `Symbol.asyncDispose` (Node ≥ 20.4, Bun, Deno).

### Testing: `override()` on the builder

Make the composition root return the builder. Tests call it, override what they need, then build. Nothing is resolved yet, so **every dependent, direct or not, receives the override**:

```typescript
import { createApi } from '../src/api';

const app = createApi({ DATABASE_URL: 'unused' })
  .override('pool', new InMemoryPool())                 // eager instance
  .override('clock', () => () => new Date('2026-01-01')) // or a factory
  .build();

await app.detectRecording.execute({ path: 'vod.mp4' }); // runs against InMemoryPool
await app.dispose();
```

The binding keeps its type: the replacement must be assignable to it, and an unknown key is a compile error (and a `ProviderNotFoundError` at runtime). The original `dispose` hook goes away with the original factory; pass `{ dispose }` as the third argument to give the replacement its own.

> **Do not use `extend()` for test doubles.** `extend()` shares the singleton cache: a binding resolved before the call is not replaced, and neither are the dependents that already captured it.

### Per-request scopes

`scope()` creates a child container with extra bindings. The child inherits parent singletons via a parent-resolver chain; scoped bindings are isolated per scope.

```typescript
const request = app.scope(
  {
    requestId: () => crypto.randomUUID(),
    handler: (c) => new Handler(c.logger, c.requestId), // c is typeof app
  },
  { name: 'request-123' }, // optional, shows up in inspect() and toString()
);

request.requestId; // unique per scope
request.logger;    // shared with the parent
```

### Plugins: `extend()`

`extend()` returns a new container with additional bindings. Unlike `scope()`, the singleton cache is **shared**: already resolved instances are reused.

```typescript
const withCsv = core.extend({
  csvParser: (c) => new CsvParser(c.logger),
});

const app = withCsv.extend({
  jobRunner: transient((c) => new JobRunner(c.csvParser)),
});
```

| | `scope()` | `extend()` |
|---|---|---|
| Topology | Parent-child chain | Flat merged container |
| Cache | Independent per-scope cache | Shares the parent's resolved cache |
| Use for | Per-request isolation | Additive composition, plugins |

### Resetting cached singletons

```typescript
app.db;             // creates the instance
app.reset('db');    // drops it from the cache (no teardown)
app.db;             // creates a NEW instance (factory and onInit run again)

app.reset();        // no args: drops every cached singleton of this container
```

`reset()` is scope-local and does not tear anything down: use `dispose(...keys)` to close a resource. The no-arg variant also clears the init state, the recorded graph and the captured warnings.

### Introspection for AI and observability

```typescript
app.inspect();         // ContainerGraph: full dependency graph (JSON)
app.describe('users'); // ProviderInfo for one binding
app.health();          // { totalProviders, resolved, unresolved, warnings }
String(app);           // human-readable one-liner
```

```typescript
const graph = JSON.stringify(app.inspect(), null, 2);
// Pipe it to an LLM, render it in a dashboard, diff it in CI.
```

A container is also assignable to `Record<string, unknown>`, so it can be handed to an API expecting a plain record without a cast.

---

## Modules reference

### `defineModule<TDeps>()`: local prerequisites (recommended)

The module declares what it **consumes**; `c` is typed as `TDeps` plus what the module adds. `.addModule()` checks `TDeps` against the builder:

```typescript
const dbModule = defineModule<{ logger: Logger }>()((b) =>
  b
    .add('db',    (c) => new Database(c.logger))
    .add('cache', (c) => new Redis(c.logger)),
);

container()
  .add('logger', () => new Logger())
  .addModule(dbModule) // ok: logger is on the builder
  .build();
```

- A missing or incompatible prerequisite fails with `{ 'missing prerequisites': "logger" }`.
- A key provided twice fails with `{ 'duplicate keys': "db" }` (and `DuplicateKeyError` at runtime).
- Only the keys the module adds join the host type.
- A module with no prerequisite uses `defineModule<Record<never, never>>()`.
- An inline module, `.addModule((b) => b.add(...))`, is typed against the host.

> **Why the double call `defineModule<TDeps>()(fn)`?** TypeScript's generic inference is all or nothing: a single-call signature would force you to write `TBuilt` by hand too. The curry splits the two: the first call fixes `TDeps`, the second infers `TBuilt` from the `.add()` chain. Same workaround as zod, TanStack Query and RTK. Tracking [microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242).

### `defineModule()` + `AppDeps`: global augmentation

When modules **forward-reference** each other, regardless of order, each file declares what it **provides** by augmenting the global `AppDeps` interface, and `c` is typed against the merged interface:

```typescript
// persistence.module.ts
declare module 'inwire' {
  interface AppDeps { IUserRepository: IUserRepository }
}

export const persistenceModule = defineModule()((b) =>
  b.add('IUserRepository', (): IUserRepository => new DrizzleUserRepository()),
);
```

```typescript
// auth.module.ts
declare module 'inwire' {
  interface AppDeps { SignInUseCase: SignInUseCase }
}

export const authModule = defineModule()((b) =>
  b.add('SignInUseCase', (c) => new SignInUseCase(c.IUserRepository)),
  //                                              ^ provided by persistenceModule
);
```

| Pattern | Declares | Prerequisites checked | Forward references | Global state |
|---|---|---|---|---|
| **Local** (`defineModule<TDeps>()`) | what it **consumes** | at compile time | no | none |
| **Global** (`defineModule()` + `AppDeps`) | what it **provides** | at resolution (`ProviderNotFoundError`) | yes, order-independent | augments `AppDeps` |

Prefer local modules: they keep the compiler in charge of the wiring. Both modes coexist in one app.

### `.merge()`: fuse standalone builders

When a group of bindings has no prerequisites, define it as a plain builder and merge it:

```typescript
const dbModule = container()
  .add('db', () => new Database())
  .add('cache', (c) => new Redis(c.db));

const app = container()
  .add('logger', () => new Logger())
  .merge(dbModule)
  .add('api', (c) => new Api(c.db, c.logger))
  .build();
```

Duplicate keys override (last write wins). Reserved keys throw.

### Post-build: `container.module()`

Same builder DX, applied to a built container. It delegates to `extend()`, so a key it re-adds is overridden and typed with its new value:

```typescript
const core = container().add('logger', () => new Logger()).build();

const withDb = core.module((b) =>
  b.add('db', (c) => new Database(c.logger)),
);
```

### Anti-pattern

```typescript
// ✗ Don't: a free function generic over the builder, or a container singleton
//   exported from a module and imported everywhere (a service locator).
function dbModule<T extends { logger: Logger }>(b: ContainerBuilder<AppDeps, T>) {
  return b.add('db', (c) => new Database(c.logger));
}
```

Use `defineModule<TDeps>()` and compose in the app's composition root.

---

## Contract mode (single-file containers)

For a small single-file container, pass an interface to `container<T>()` to constrain keys and return types:

```typescript
interface Deps {
  ILogger: Logger;
  IDatabase: Database;
}

const app = container<Deps>()
  .add('ILogger',   () => new ConsoleLogger())         // key: keyof Deps
  .add('IDatabase', (c) => new PgDatabase(c.ILogger))  // return must match Database
  .build();

app.ILogger; // typed as Logger (the interface), not ConsoleLogger
```

The contract constrains what you can add; it does not widen inferred types: `container<{ db: string }>().add('db', () => 'postgres')` types `c.db` as the literal `'postgres'`. For multi-module apps, use modules.

---

## Scope: own vs inherited keys

`scope()` creates a parent-child resolver chain. Two views coexist, like JS prototype inheritance:

- **Own** (the child's bindings only): `size`, `Object.keys()`, `Symbol.iterator`, `inspect()`, `health()`, `toJSON()`, and `preload()` with no arguments.
- **Inherited** (walks the parent chain): property access `child.db` and the `in` operator.

`extend()` flattens everything into a single resolver, so its own view includes all bindings.

```typescript
const child = app.scope({ extra: () => 42 });

child.size;                             // 1: only 'extra'
child.db;                               // resolved through the parent chain
'db' in child;                          // true (inherited)
Object.keys(child.inspect().providers); // ['extra']
```

---

## Known typing limitations

The runtime is correct in each case; only the types are affected.

**1. Self-reference in `scope()`.** A factory cannot reference a key added in the same `scope()` call:

```typescript
// ✓ Split into two scope() calls
const s1 = app.scope({ requestId: () => crypto.randomUUID() });
const s2 = s1.scope({ handler: (c) => new Handler(c.requestId) });
```

Making `E` self-referential in the `scope()` generic collapses every `ReturnType<E[K]>` to `unknown`.

**2. `.merge()` has no prerequisites.** A standalone builder starts from `{}`, so its factories cannot read host keys. Use `defineModule<TDeps>()` instead.

**3. Global-mode modules are not checked.** A `defineModule()` typed against `AppDeps` sees the whole app, so `.addModule()` cannot tell what is missing; a missing key raises `ProviderNotFoundError` on resolution.

---

## Errors and diagnostics

Every error extends `ContainerError` and carries:
- `hint: string`: an actionable fix
- `details: Record<string, unknown>`: structured context

Designed to be read by humans and LLMs.

### Fuzzy missing-key suggestions

```typescript
app.userServce; // typo
// ProviderNotFoundError: Cannot resolve 'userServce': dependency 'userServce' not found.
//   Registered keys: [userService, logger, db]
//   Did you mean 'userService'?
```

Powered by Levenshtein distance. Default threshold: 50 % similarity, configurable with `container({ similarityThreshold: 0.8 })`. Set it to `1` to disable suggestions.

### Circular dependency: full chain

```typescript
// CircularDependencyError: Circular dependency detected while resolving 'authService'.
//   Cycle: authService -> userService -> authService
```

### Reserved keys

`scope`, `extend`, `module`, `preload`, `reset`, `inspect`, `describe`, `health`, `dispose`, `toString`, `toJSON`, `size` cannot be used as dependency keys.

### Duplicate keys

`.add()` and `.addTransient()` throw `DuplicateKeyError` when a key is already registered, no silent overwrite. To replace a binding on purpose, use `.override()` on the builder.

### Warnings

`health().warnings` reports a singleton depending on a transient (`scope_mismatch`: the transient value is frozen inside the singleton) and an async `onInit()` that rejected during lazy access (`async_init_error`: use `preload()` to surface it as an error).

### All error types

| Error | Thrown when |
|---|---|
| `ContainerError` | Base class. Every subclass carries `hint` + `details`. |
| `ContainerConfigError` | Non-function value passed to `scope()` / `extend()` |
| `ReservedKeyError` | Reserved method name used as a key |
| `DuplicateKeyError` | A key registered twice (`.add()`, `.addTransient()`, two modules) |
| `ProviderNotFoundError` | Key not registered (with fuzzy suggestion), also `.override()` of an unknown key |
| `CircularDependencyError` | Cycle detected during resolution |
| `UndefinedReturnError` | Factory returned `undefined` |
| `FactoryError` | Factory threw (wraps the original error) |
| `ContainerDisposedError` | A binding read, iterated or preloaded after `dispose()` tore it down |
| `DisposeTimeoutError` | A teardown hook did not settle within `disposeTimeout` (reported by `dispose()`) |
| `TopologicalSortError` | `preload()` could not order the graph (defensive guard, `CircularDependencyError` fires first) |
| `ScopeMismatchWarning` | Singleton depends on transient (in `health().warnings`) |
| `AsyncInitErrorWarning` | Async `onInit()` rejected during lazy access (in `health().warnings`) |

---

## Migrating from 3.x

4.0 makes module wiring a compile-time concern and makes a disposed container final.

1. **`addModule()` checks prerequisites.** A `defineModule<{ db: Db }>()` added to a builder without `db` no longer compiles (`'missing prerequisites': "db"`). Add the prerequisite, or the module that provides it, first.
2. **The host no longer gains a module's prerequisites.** `TDeps` used to leak into the host type, so `app.db` compiled even when nothing provided `db`. Add `db` to the host explicitly.
3. **Duplicate keys between modules are compile errors** (`'duplicate keys': "users"`); they already threw `DuplicateKeyError` at runtime.
4. **A disposed binding stays disposed.** Reading it, iterating or `preload()` after `dispose()` throws `ContainerDisposedError` instead of silently recreating instances. Build a new container (or scope) for fresh instances; use `reset()` to drop cached singletons without tearing them down.
5. **Test doubles move to the builder.** Replace `realApp.extend({ db: fake })` with `createApp().override('db', fake).build()`: `extend()` never replaced bindings that were already resolved.
6. **Node ≥ 20.4** is declared in `engines`.

New in 4.0: `.add(key, value, { dispose })`, eager instances disposed even when never read, `dispose(...keys)`, `container({ disposeTimeout })`, `.override()`, and containers assignable to `Record<string, unknown>`.

---

## Examples

| Example | Run | Showcases |
|---|---|---|
| [app/api.ts](examples/app/api.ts) ★ | `pnpm example:api` | **Recommended structure.** Composition root of an API: infrastructure with `dispose` hooks, `*.module.ts` per business module composed with `.addModule()`, `preload()`, shutdown on `SIGTERM` |
| [app/worker.ts](examples/app/worker.ts) | `pnpm example:worker` | Composition root of a worker: Temporal activities from bindings, a relay loop stopped with `dispose('relay')` before the pool closes |
| [app/testing.ts](examples/app/testing.ts) | `pnpm example:testing` | Tests: `createApi().override(...).build()`, `ContainerDisposedError` after `dispose()` |
| [01-request-scopes.ts](examples/01-request-scopes.ts) | `pnpm example:scopes` | Per-request `scope()` with `await using`, transients |
| [02-introspection.ts](examples/02-introspection.ts) | `pnpm example:introspection` | `inspect()`, `describe()`, `health()` for tooling and LLMs |
| [03-global-modules.ts](examples/03-global-modules.ts) | `pnpm example:global-modules` | `AppDeps` augmentation for modules that forward-reference each other |
| [04-deno.ts](examples/04-deno.ts) | `deno run examples/04-deno.ts` | Deno with `npm:inwire@^4` (Node and Bun run every example as is) |

All examples run with `tsx` and are type-checked in CI.

---

## API reference

### Functions and classes

| Export | Kind | Description |
|---|---|---|
| `container<T?>(options?)` | function | Creates a `ContainerBuilder`. Pass `T` for [contract mode](#contract-mode-single-file-containers). `options`: `ContainerOptions`. |
| `ContainerBuilder` | class | Fluent builder (`container()` is the entry point). Exported for typing and advanced composition. |
| `defineModule<TDeps?>()(fn)` | function | Defines a typed reusable module. See [Modules reference](#modules-reference). |
| `transient(factory)` | function | Marks a factory as transient (for `scope()` / `extend()`). |

### Builder methods

| Method | Description |
|---|---|
| `.add(key, factoryOrInstance, options?)` | Registers a binding. Function = lazy factory; anything else = eager instance. `options.dispose(instance)` declares its teardown. |
| `.addTransient(key, factory)` | Registers a transient binding (fresh on each access). |
| `.addModule(module)` | Applies a `Module`. Prerequisites and duplicate keys are checked at compile time. |
| `.override(key, factoryOrInstance, options?)` | Replaces a registered binding before build; every dependent receives it. |
| `.merge(otherBuilder)` | Fuses a standalone builder's factories into this one. |
| `.build()` | Builds the container. |

### Container methods

| Method | Description |
|---|---|
| `.scope(extra, options?)` | Child container with additional deps. Inherits parent singletons via the parent chain. |
| `.extend(extra)` | New container with additional deps. **Shares** the singleton cache. |
| `.module(fn)` | Post-build builder for typed `c` accumulation. Delegates to `extend()`. |
| `.preload(...keys)` | Resolves and **awaits** `onInit()`. No args = everything. |
| `.reset(...keys)` | Drops cached singletons (no teardown). Scope-local. |
| `.inspect()` | Full dependency graph (`ContainerGraph`). |
| `.describe(key)` | One binding (`ProviderInfo`). |
| `.health()` | Health snapshot and warnings (`ContainerHealth`). |
| `.dispose(...keys)` | LIFO teardown (`dispose` hook, else `onDestroy()`), eager instances included. With keys, only those bindings. |
| `[Symbol.asyncDispose]()` | Same as `.dispose()`: enables `await using`. |
| `.size` | Number of registered providers. |
| `.toJSON()` | Plain object of the resolved (cached) deps. Does **not** trigger resolution. |
| `[Symbol.iterator]()` | Yields `[key, value]` for every registered provider. Triggers resolution. |

### Types

| Type | Description |
|---|---|
| `AppDeps` | Augmentable global interface for global-mode modules. |
| `BindingOptions<V>` | `{ dispose?: (instance: V) => void \| Promise<void> }`, third argument of `.add()` and `.override()`. |
| `Container<T>` | Resolved deps + container methods. Assignable to `Record<string, unknown>`. |
| `ContainerBuilder<TContract, TBuilt>` | Fluent builder class. |
| `IContainer<T>` | Container methods interface. |
| `IContainerBuilder<TContract, TBuilt>` | Builder interface, received by `module()` and `defineModule()` callbacks. |
| `ContainerOptions` | `{ similarityThreshold?: number; disposeTimeout?: number }`. Propagated through `scope()`, `extend()` and `module()`. |
| `Module<TDeps, TBuilt>` | Module returned by `defineModule()`. |
| `InferModuleDeps<M>` / `InferModuleBuilt<M>` | A module's prerequisites / full output. |
| `Factory<T>` | Raw factory signature `(c: unknown) => T`. |
| `OnInit` / `OnDestroy` | Lifecycle interfaces (duck-typed). |
| `ContainerGraph` | Return of `inspect()`: `{ name?, providers }`. |
| `ContainerHealth` | Return of `health()`: `{ totalProviders, resolved, unresolved, warnings }`. |
| `ContainerWarning` | `{ type: 'scope_mismatch' \| 'async_init_error', message, details }`. |
| `ProviderInfo` | Return of `describe()`: `{ key, resolved, deps, scope }`. |
| `ScopeOptions` | `{ name?: string }`. |

---

## Architecture

Clean Architecture with an enforced one-way dependency rule.

```
src/
  index.ts                       # public barrel, the only file consumers see
  domain/                        # pure contracts, no framework deps
    types.ts                     # barrel re-exporting types/public.ts + types/internal.ts
    types/public.ts              # Container, IContainer, IContainerBuilder, AppDeps, module checks
    types/internal.ts            # IResolver, ICycleDetector, IDependencyTracker, IValidator
    errors.ts                    # ContainerError + 10 concrete errors + 2 warnings, each with hint + details
    lifecycle.ts                 # OnInit / OnDestroy (duck-typed)
    validation.ts                # Validator (configurable similarity threshold), Levenshtein
  infrastructure/                # mechanisms, depend on domain/ only
    resolver.ts                  # lazy resolution, singleton cache, parent chain, disposed guard
    cycle-detector.ts            # circular dependency detection
    dependency-tracker.ts        # tracking Proxy + auto-built dependency graph
    transient.ts                 # transient() marker (Symbol.for)
    binding.ts                   # per-binding dispose hook and eager marker (Symbol.for)
  application/                   # orchestration, depends on domain/ + infrastructure/
    container-builder.ts         # ContainerBuilder + container()           ▸ Composition Root
    container-proxy.ts           # Proxy construction + dispatch           ▸ Composition Root
    scoper.ts                    # child resolvers for .scope()            ▸ Composition Root
    extender.ts                  # merged resolvers for .extend()          ▸ Composition Root
    define-module.ts             # defineModule(), both modes
    preloader.ts                 # topological sort (Kahn) + parallel onInit
    disposer.ts                  # LIFO teardown, hooks, timeouts, targeted dispose
    introspection.ts             # inspect / describe / health / toString
```

The `Resolver` receives its collaborators by constructor injection. Application code depends on `IResolver`, never on the concrete class. The four **Composition Roots** are the only files allowed to instantiate concrete infrastructure.

---

## LLM / AI integration

The repository provides [llms.txt](https://llmstxt.org/) files for AI-assisted development:

- **`llms.txt`**: concise index following the llms.txt standard
- **`llms-full.txt`**: complete API reference sized for LLM context windows

Both are type-checked in CI. The `inspect()` output is designed to be piped directly into an LLM for architecture analysis.

---

## License

MIT
