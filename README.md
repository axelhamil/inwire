# inwire

**Type-safe dependency injection for TypeScript.** No decorators. No tokens. No `reflect-metadata`. Just a fluent builder, a Proxy, and full type inference. ~4 KB gzip, zero runtime dependencies.

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
  .add('logger', () => new Logger())
  .add('db', (c) => new Database(c.logger))      // c.logger is typed
  .add('users', (c) => new UserService(c.db))    // c.db is typed
  .build();

app.users.findById('42'); // lazy, singleton, fully typed
```

---

## Why inwire?

| | inwire | typical DI container |
|---|---|---|
| **Type inference** | Full — `c.db` autocompletes from `.add()` history | Manual generics or token strings |
| **Decorators** | None | Required (`@Injectable`, `@Inject`) |
| **Runtime metadata** | None | `reflect-metadata` polyfill needed |
| **Circular deps** | Caught with full chain + fix hint | Stack overflow or cryptic crash |
| **Async lifecycle** | First-class `preload()` with topological parallelism | Manual `Promise.all` plumbing |
| **Introspection** | `inspect()` returns JSON graph for LLMs / dashboards | None |
| **Bundle size** | ~4 KB gzip | 10–50 KB |
| **Runtime** | Pure ES2022 — Node, Bun, Deno, Workers, browsers | Often Node-only |

The **dependency graph is a side product**: a tracking Proxy records which keys each factory accesses, so `inspect()` returns the real graph without you ever annotating it.

---

## Install

```bash
pnpm add inwire   # or npm i inwire / bun add inwire
```

Requires TypeScript ≥ 5.0 and an ESM-aware bundler / runtime.

---

## Modular Setup (recommended)

For real-world apps, organize bindings per module file with **Pinia-style global type augmentation**. Each file declares what it *provides* by augmenting `AppDeps`; `defineModule()` types the factory's `c` against the merged interface — cross-module references resolve regardless of import order.

```typescript
// modules/persistence.module.ts
import { defineModule } from 'inwire';
import type { IUserRepository } from '../contracts/IUserRepository';
import { DrizzleUserRepository } from '../infrastructure/DrizzleUserRepository';

declare module 'inwire' {
  interface AppDeps {
    IUserRepository: IUserRepository;
  }
}

export const persistenceModule = defineModule()((b) =>
  b.add('IUserRepository', (): IUserRepository => new DrizzleUserRepository()),
);
```

```typescript
// modules/auth.module.ts
import { defineModule } from 'inwire';
import type { IAuthProvider } from '../contracts/IAuthProvider';
import { BetterAuthProvider } from '../infrastructure/BetterAuthProvider';
import { SignInUseCase } from '../application/SignInUseCase';

declare module 'inwire' {
  interface AppDeps {
    IAuthProvider: IAuthProvider;
    SignInUseCase: SignInUseCase;
  }
}

export const authModule = defineModule()((b) =>
  b
    .add('IAuthProvider', (): IAuthProvider => new BetterAuthProvider())
    .add('SignInUseCase', (c) => new SignInUseCase(c.IUserRepository, c.IAuthProvider)),
  //                                              ^^^^^^^^^^^^^^^^^^^^
  //                       provided by persistenceModule — typed via merged AppDeps
);
```

```typescript
// container.ts — single source of truth
import { container } from 'inwire';
import { persistenceModule } from './modules/persistence.module';
import { authModule } from './modules/auth.module';

export const di = container()
  .addModule(persistenceModule)
  .addModule(authModule)
  .build();

export type Di = typeof di; // derived — never hand-written
```

**Why this scales:**

- **Locality.** Each module is self-contained: it states what it *provides*, in its own file. No global shape interface to maintain.
- **Order-independent.** `authModule` references `c.IUserRepository` even if `persistenceModule` is added later, in any file.
- **Familiar pattern.** Mirrors Pinia's `PiniaCustomProperties` and Vue's `ComponentCustomProperties`. Augmentations are erased after type-check — zero runtime cost.
- **Derived types.** `type Di = typeof di` — add a binding, `Di` grows; remove one, it shrinks. The compiler does the bookkeeping.

> Other patterns are supported when this one doesn't fit — see [Modules reference](#modules-reference).

---

## Core Concepts

### The container is a Proxy

`container()` returns a fluent builder. Each `.add(key, factory)` accumulates the type so the next factory's `c` argument is typed with everything declared so far. `.build()` wraps the factories in an ES Proxy: property access triggers lazy resolution and caches the result.

```typescript
const app = container()
  .add('db', () => new Database())
  .build();

app.db; // first access → factory runs, instance cached
app.db; // subsequent access → cached instance returned
```

### Auto-tracked dependency graph

The `c` argument passed to each factory is itself a tracking Proxy. Every property access is recorded — that's how `inspect()` returns the real graph without you annotating it.

```typescript
const app = container()
  .add('db', () => new Database())
  .add('repo', (c) => new UserRepo(c.db))   // c.db touched → graph: repo → [db]
  .build();

app.inspect();
// { providers: { db: { deps: [], ... }, repo: { deps: ['db'], ... } } }
```

### Singleton by default, transient on demand

```typescript
const app = container()
  .add('db', () => new Database())                 // singleton (cached)
  .addTransient('requestId', () => crypto.randomUUID())  // transient (fresh each access)
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

A non-function value passed to `.add()` is registered eagerly (wrapped in `() => value`):

```typescript
container()
  .add('config', { port: 3000 })            // eager — `{ port: 3000 }` is the value
  .add('db', (c) => new Database(c.config)) // lazy — function = factory
  .build();
```

To register a function *as a value*, wrap it: `.add('handler', () => myFunction)`.

### Lifecycle (duck-typed)

Implement `onInit()` / `onDestroy()` on any class. inwire detects them at runtime — no base class required.

```typescript
import type { OnInit, OnDestroy } from 'inwire';

class Database implements OnInit, OnDestroy {
  async onInit()    { await this.connect(); }
  async onDestroy() { await this.disconnect(); }
}
```

> **CRITICAL gotcha — sync property access cannot await.** When you access `app.db`, `onInit()` is called but **not awaited**. Async errors are silently captured as `health().warnings`. To safely await async startup, use [`preload()`](#async-startup-preload).

---

## Cookbook

### Async startup — `preload()`

`preload()` is the **only** way to safely await async `onInit()`. It runs independent branches in parallel using a topological sort (Kahn's BFS), levels sequentially:

```
Level 0:  [config]            ← no deps
Level 1:  [db] [cache]        ← parallel, both depend on config
Level 2:  [api]               ← depends on db + cache
```

```typescript
await app.preload('db', 'cache'); // specific keys
await app.preload();              // everything
```

Errors from `onInit()` propagate as a single `AggregateError` if multiple fail. Wrap in `try/catch` for startup validation.

**Canonical boot sequence.** For any non-trivial app with async init (DB connections, queue workers, cache warmers), the recommended pattern is:

```typescript
// 1. Build the container — no I/O happens here, just factory registration.
const app = container()
  .add('config', () => loadConfig())
  .add('db', (c) => new Database(c.config))         // implements OnInit (connect())
  .add('cache', (c) => new Redis(c.config))         // implements OnInit (connect())
  .add('queue', (c) => new QueueConsumer(c.db))     // implements OnInit (start consuming)
  .build();

// 2. Preload — runs onInit() in parallel where possible, surfaces errors.
try {
  await app.preload();
} catch (err) {
  console.error('Boot failed', err); // AggregateError if multiple onInit() rejected
  process.exit(1);
}

// 3. Wire shutdown — LIFO onDestroy() in reverse resolution order.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    await app.dispose();
    process.exit(0);
  });
}

// 4. App is ready.
app.queue.start();
```

Without `preload()`, async `onInit()` errors are silently captured as `health().warnings` — fine for hot reloads, dangerous for production boot.

### Per-request scopes

`scope()` creates a child container with extra bindings. The child inherits parent singletons via a parent-resolver chain; scoped bindings are isolated per scope.

```typescript
const request = app.scope(
  {
    requestId: () => crypto.randomUUID(),
    handler: (c) => new Handler(c.logger, c.requestId), // c is typeof app
  },
  { name: 'request-123' }, // optional, surfaces in inspect()/toString()
);

request.requestId; // unique per scope
request.logger;    // shared from parent
```

### Test overrides

Two patterns — pick what fits your test:

**From scratch** — build a parallel container with mocks:

```typescript
function createTestContainer() {
  return container()
    .add('logger', () => ({ log: () => {} }))    // silent
    .add('db',     () => new InMemoryDatabase()) // mock
    .add('users',  (c) => new UserService(c.db, c.logger))
    .build();
}
```

**From a real container** — override specific keys via `.extend()`:

```typescript
// production container is the source of truth
const testApp = realApp.extend({
  db: () => new InMemoryDatabase(),     // override
  emailService: () => ({ send: vi.fn() }), // mock
});

// All other bindings (loggers, repos, services...) come from realApp untouched.
testApp.users.signup({ email: 'a@b.c' });
```

`.extend()` shares the parent's singleton cache, so already-resolved real instances are reused. Overridden keys get fresh factories. This is the most ergonomic way to mock a slice of a real container without rebuilding the whole graph.

### Plugin system — `extend()`

`extend()` returns a new container with additional bindings. Unlike `scope()`, the existing singleton cache is **shared** — already-resolved instances are reused.

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
| Cache | Independent per-scope cache | Shares parent's resolved cache |
| Use for | Per-request isolation | Additive composition / plugins |

### Graceful shutdown — `dispose()`

Calls `onDestroy()` on all resolved instances in **LIFO order**. Resilient: continues on errors, collects them into `AggregateError`.

```typescript
process.on('SIGTERM', async () => {
  await app.dispose();
  process.exit(0);
});
```

**ES2023 explicit resource management** — every container implements `[Symbol.asyncDispose]`, so `await using` auto-disposes when the binding leaves scope:

```typescript
async function handleRequest(req: Request) {
  await using request = app.scope({
    requestId: () => crypto.randomUUID(),
    handler: (c) => new Handler(c.logger, c.requestId),
  });
  return request.handler.run(req);
} // request.dispose() fires automatically here, even on throw
```

Requires TypeScript ≥ 5.2 and a runtime with `Symbol.asyncDispose` (Node ≥ 20.4, Bun, Deno).

### Resetting cached singletons

```typescript
app.db;             // creates instance
app.reset('db');    // invalidates cache for a specific key
app.db;             // creates a NEW instance (factory re-runs, onInit re-fires)

app.reset();        // no args → invalidates ALL cached singletons in this scope
```

`reset()` is scope-local — it doesn't affect parent caches. The no-arg variant also clears `initState`, the recorded dependency graph, and any captured warnings — useful for fully rebuilding state in long-running tests.

### Introspection for AI / observability

```typescript
app.inspect();         // ContainerGraph — full dependency graph (JSON)
app.describe('users'); // ProviderInfo for one binding
app.health();          // { totalProviders, resolved, unresolved, warnings }
String(app);           // human-readable one-liner
```

```typescript
const graph = JSON.stringify(app.inspect(), null, 2);
// Pipe to an LLM, render in a dashboard, diff in CI.
```

---

## Modules reference

inwire offers four ways to compose modules. Pinia-style is the recommended default; the rest fit specific situations.

### Pinia-style augmentation — recommended

See [Modular Setup](#modular-setup-recommended) above for the full recipe. TL;DR:

```typescript
declare module 'inwire' {
  interface AppDeps { IUserRepository: IUserRepository }
}

export const persistenceModule = defineModule()((b) =>
  b.add('IUserRepository', (): IUserRepository => new DrizzleUserRepository()),
);
```

- Each module declares what it **provides**.
- `c` is typed as the merged `AppDeps`.
- Cross-module forward references work, order-independent.

### `defineModule<TDeps>()` — locally-declared prerequisites

When a module's prereqs are a tight, fixed surface and you'd rather not augment a global, declare what the module **consumes** inline. `c` is typed locally as `TDeps`:

```typescript
const dbModule = defineModule<{ logger: Logger }>()((b) =>
  b
    .add('db',    (c) => new Database(c.logger))
    .add('cache', (c) => new Redis(c.logger)),
);
```

Trade-offs vs Pinia-style:

| Pattern | Declares | Cross-module forward ref | Global state |
|---|---|---|---|
| **Pinia-style** (`defineModule()` + `declare module`) | what the module **provides** | yes — order-independent | augments inwire's `AppDeps` |
| **Local** (`defineModule<TDeps>()`) | what the module **consumes** | no — prereqs added first | none |

Both modes coexist: passing `<TDeps>` always overrides the global mode for that module.

> **Why the double-call signature `defineModule<TDeps>()(fn)`?** TypeScript's generic inference is all-or-nothing — specifying `<TDeps>` in a flat single-call signature would force you to write `<TBuilt>` by hand too, defeating the inference of the `.add()` chain. The curry splits the two: first call fixes `TDeps` (or defaults to `AppDeps`), second call infers `TBuilt` from the factory return. Same workaround used by zod, TanStack Query, RTK. Tracking [microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242).

> `addModule()` does **not** enforce prereq satisfaction at the type level — missing keys raise `ProviderNotFoundError` at resolution time. This relaxation is what makes Pinia-style forward references possible.

### `.merge()` — fuse standalone builders

When a module has no prerequisites, define it as a plain builder and merge it:

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

Cross-builder dependencies are resolved at build time. Duplicate keys override (last write wins). Reserved keys throw.

### Post-build — `container.module()`

Compose post-build using the same builder DX. Each `.add()` in the callback types `c` incrementally:

```typescript
const core = container().add('logger', () => new Logger()).build();

const withDb = core.module((b) =>
  b.add('db', (c) => new Database(c.logger)),
);

const full = withDb.module((b) =>
  b.add('users', (c) => new UserService(c.db, c.logger)),
);
```

`module()` works on `scope()` and `extend()` results too. Internally it delegates to `extend()` after building the typed factory record.

### Anti-pattern (avoid)

Older code may show this manual generic — verbose, couples the module to a global `AppDeps`, forces redeclaring prerequisites:

```typescript
// ✗ Don't do this — use defineModule() instead.
function dbModule<T extends { logger: Logger }>(
  b: ContainerBuilder<AppDeps, T>,
) {
  return b.add('db', (c) => new Database(c.logger));
}
```

---

## Contract Mode (single-file containers)

For monolithic, single-file containers (no modules), pass an interface to `container<T>()` to constrain keys and return types at compile time:

```typescript
interface AppDeps {
  ILogger: Logger;
  IDatabase: Database;
  IUserService: UserService;
}

const app = container<AppDeps>()
  .add('ILogger',      () => new ConsoleLogger())          // key: keyof AppDeps
  .add('IDatabase',    (c) => new PgDatabase(c.ILogger))   // return must match Database
  .add('IUserService', (c) => new UserService(c.IDatabase, c.ILogger))
  .build();

app.ILogger; // typed as Logger (interface), not ConsoleLogger
```

The string key acts as a token (à la NestJS) but is type-safe at compile time. For multi-module apps, **use Pinia-style instead** — it scales across files; Contract Mode does not.

---

## Errors & Diagnostics

Every error extends `ContainerError` and carries:
- `hint: string` — actionable fix suggestion
- `details: Record<string, unknown>` — structured context for programmatic consumption

Designed to be parsed by both humans and LLMs.

### Fuzzy missing-key suggestions

```typescript
app.userServce; // typo
// ProviderNotFoundError: Cannot resolve 'userServce'.
//   Registered: [userService, logger, db]
//   Did you mean 'userService'?
//   hint: Add 'userServce' to your container, or fix the typo.
```

Powered by Levenshtein distance (≥ 50% similarity threshold).

### Circular dependency — full chain

```typescript
// CircularDependencyError: Circular dependency detected while resolving 'authService'.
//   Cycle: authService → userService → authService
```

No stack overflow, no cryptic crash — just the resolution chain.

### Reserved keys

`scope`, `extend`, `module`, `preload`, `reset`, `inspect`, `describe`, `health`, `dispose`, `toString` cannot be used as dependency keys.

```typescript
container().add('inspect', () => 'foo');
// ReservedKeyError: 'inspect' is a reserved container method.
//   hint: Rename, e.g. 'inspectService' or 'myInspect'.
```

### Scope mismatch detection (warning)

A singleton depending on a transient freezes the transient value. Surface via `health()`:

```typescript
app.health().warnings;
// [{
//   type: 'scope_mismatch',
//   message: "Singleton 'userService' depends on transient 'requestId'.",
//   details: { singleton: 'userService', transient: 'requestId' },
// }]
```

### Async-init errors (warning)

When `onInit()` rejects during *lazy* access (no `preload()`), the rejection is captured as a warning rather than crashing your app.

```typescript
app.health().warnings;
// [{ type: 'async_init_error', message: "onInit() for 'db' rejected: connection refused", ... }]
```

Use `preload()` to surface these as proper errors.

### Duplicate keys

`.add()` and `.addTransient()` throw `DuplicateKeyError` if the key is already registered — no silent overwrites:

```typescript
container()
  .add('logger', () => new ConsoleLogger())
  .add('logger', () => new FileLogger()); // throws DuplicateKeyError
```

For **intentional** overrides (test doubles, plugins, environment-specific bindings), use `.extend()` or `.scope()` on a built container — both are documented override mechanisms.

### All error types

| Error | Thrown when |
|---|---|
| `ContainerError` | Base class for all errors. Every subclass carries `hint` + `details`. |
| `ContainerConfigError` | Non-function value passed to `scope()` / `extend()` deps |
| `ReservedKeyError` | Reserved method name used as a key |
| `DuplicateKeyError` | `.add()` or `.addTransient()` called twice with the same key |
| `ProviderNotFoundError` | Key not registered (with fuzzy suggestion) |
| `CircularDependencyError` | Cycle detected during resolution |
| `UndefinedReturnError` | Factory returned `undefined` |
| `FactoryError` | Factory threw (wraps original error) |
| `ScopeMismatchWarning` | Singleton depends on transient (surfaced via `health().warnings`). Carries `hint` with refactor suggestions. |
| `AsyncInitErrorWarning` | Async `onInit()` rejected during lazy access (surfaced via `health().warnings`). Carries `hint` pointing to `preload()`. |

---

## Examples

| Example | Run | Showcases |
|---|---|---|
| [06-pinia-augmentation.ts](examples/06-pinia-augmentation.ts) ★ | `npm run example:pinia` | **Recommended modular pattern.** `declare module 'inwire'` per file, order-independent cross-module typing |
| [05-zod-style-typing.ts](examples/05-zod-style-typing.ts) | `npm run example:typing` | `type Di = typeof di` derivation, Clean Arch contracts |
| [04-modules.ts](examples/04-modules.ts) | `npm run example:modules` | `defineModule<TDeps>()`, `.merge()`, `module()` post-build |
| [03-plugin-system.ts](examples/03-plugin-system.ts) | `npm run example:plugin` | Extend chain, scoped jobs, JSON graph for LLM |
| [02-modular-testing.ts](examples/02-modular-testing.ts) | `npm run example:test` | Free mode, instance values, test overrides |
| [01-web-service.ts](examples/01-web-service.ts) | `npm run example:web` | Contract mode, lifecycle, dependency inversion |

---

## API Reference

### Functions & classes

| Export | Kind | Description |
|---|---|---|
| `container<T?>()` | function | Creates a `ContainerBuilder`. Pass `T` for [Contract Mode](#contract-mode-single-file-containers). |
| `ContainerBuilder` | class | Fluent builder class (rarely instantiated directly — `container()` is the entry point). Exported for type-only use and advanced composition. |
| `defineModule<TDeps?>()(fn)` | function | Defines a typed reusable module. See [Modules reference](#modules-reference). |
| `transient(factory)` | function | Marks a factory as transient (for `scope()` / `extend()`). |

### Builder methods

| Method | Description |
|---|---|
| `.add(key, factoryOrInstance)` | Register a binding. Function = lazy factory; non-function = eager instance. |
| `.addTransient(key, factory)` | Register a transient binding (fresh each access). |
| `.addModule(module)` | Apply a `Module` (typically from `defineModule()`). |
| `.merge(otherBuilder)` | Fuse a standalone builder's factories into this one. |
| `.build()` | Build and return the container. |

### Container methods

| Method | Description |
|---|---|
| `.scope(extra, options?)` | Child container with additional deps. Inherits parent singletons via parent chain. |
| `.extend(extra)` | New container with additional deps. **Shares** singleton cache. |
| `.module(fn)` | Post-build `ContainerBuilder` for typed `c` accumulation. Delegates to `extend()`. |
| `.preload(...keys)` | Eagerly resolve and **await** `onInit()`. No args = preload all. |
| `.reset(...keys)` | Invalidate cached singletons. Scope-local. |
| `.inspect()` | Full dependency graph (`ContainerGraph`). |
| `.describe(key)` | Single binding info (`ProviderInfo`). |
| `.health()` | Health snapshot + warnings (`ContainerHealth`). |
| `.dispose()` | LIFO `onDestroy()` on all resolved instances. |
| `[Symbol.asyncDispose]()` | Alias of `.dispose()` — enables `await using container = ...` (ES2023). |
| `.size` | `readonly number` — count of registered providers. |
| `.toJSON()` | Plain object of currently resolved (cached) deps. Does **not** trigger lazy resolution. Makes `JSON.stringify(container)` work. |
| `[Symbol.iterator]()` | Yields `[key, value]` pairs for every registered provider. Triggers lazy resolution. Enables `for...of`, spread, `Array.from`. |

### Types

| Type | Description |
|---|---|
| `AppDeps` | Augmentable global interface for Pinia-style typing. |
| `Container<T>` | `T & IContainer<T>` — resolved deps + container methods. |
| `ContainerBuilder<TContract, TBuilt>` | Fluent builder (also passed to `module()` callbacks). |
| `IContainer<T>` | Container methods interface. |
| `Module<TDeps, TBuilt>` | Module shape returned by `defineModule()`. |
| `InferModuleDeps<M>` / `InferModuleBuilt<M>` | Extract a module's prereqs / full output. |
| `Factory<T>` | Raw factory signature `(c: unknown) => T`. |
| `OnInit` / `OnDestroy` | Lifecycle interfaces (duck-typed). |
| `ContainerGraph` | Return of `inspect()` — `{ name?, providers }`. |
| `ContainerHealth` | Return of `health()` — `{ totalProviders, resolved, unresolved, warnings }`. |
| `ContainerWarning` | `{ type: 'scope_mismatch' \| 'async_init_error', message, details }`. |
| `ProviderInfo` | Return of `describe()` — `{ key, resolved, deps, scope }`. |
| `ScopeOptions` | `{ name?: string }`. |

---

## Architecture

Clean Architecture with an enforced one-way dependency rule.

```
src/
  index.ts                       # public barrel — only file consumers see
  domain/                        # pure contracts — no framework deps
    types.ts                     # barrel re-exporting types/public.ts + types/internal.ts
    types/public.ts              # Container, IContainer, IContainerBuilder, AppDeps, helpers
    types/internal.ts            # IResolver, ICycleDetector, IDependencyTracker, IValidator
    errors.ts                    # 7 error classes + 2 warnings, each with hint + details
    lifecycle.ts                 # OnInit / OnDestroy (duck-typed)
    validation.ts                # Validator (configurable similarity threshold), Levenshtein
  infrastructure/                # mechanisms — depends on domain/ only
    resolver.ts                  # lazy resolution, singleton cache, parent chain
    cycle-detector.ts            # circular dependency detection
    dependency-tracker.ts        # tracking Proxy + auto-built dependency graph
    transient.ts                 # transient() marker (Symbol.for-based)
  application/                   # orchestration — depends on domain/ + infrastructure/
    container-builder.ts         # ContainerBuilder + container() factory  ▸ Composition Root
    container-proxy.ts           # Proxy construction + dispatch            ▸ Composition Root
    scoper.ts                    # builds child resolvers for .scope()     ▸ Composition Root
    extender.ts                  # builds merged resolvers for .extend()   ▸ Composition Root
    define-module.ts             # defineModule() — both modes
    preloader.ts                 # topological sort (Kahn) + parallel onInit
    disposer.ts                  # reverse-order onDestroy + resilient errors
    introspection.ts             # inspect / describe / health / toString
```

The `Resolver` receives its collaborators via constructor injection — no internal `new`, no hidden coupling. Application code depends on `IResolver`, never on the concrete class. The four **Composition Roots** (`container-builder.ts`, `container-proxy.ts`, `scoper.ts`, `extender.ts`) are the only files allowed to instantiate concrete infrastructure (`Resolver`, `CycleDetector`, `DependencyTracker`).

---

## LLM / AI Integration

This package ships [llms.txt](https://llmstxt.org/) files for AI-assisted development:

- **`llms.txt`** — Concise index following the llms.txt standard
- **`llms-full.txt`** — Complete API reference optimized for LLM context windows

Compatible with [Context7](https://context7.com/) and any tool that supports the llms.txt standard. The `inspect()` output is also designed to be piped directly into an LLM for architecture analysis.

---

## License

MIT
