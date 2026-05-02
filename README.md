# inwire

Type-safe dependency injection for TypeScript. Builder pattern, full inference, no decorators, no tokens. Built-in introspection for AI tooling and debugging. Zero dependencies.

[![NPM Version](https://img.shields.io/npm/v/inwire)](https://www.npmjs.com/package/inwire)
[![CI](https://img.shields.io/github/actions/workflow/status/axelhamil/inwire/ci.yml)](https://github.com/axelhamil/inwire/actions)
[![Bundle size](https://deno.bundlejs.com/badge?q=inwire&treeshake=[*])](https://bundlejs.com/?q=inwire&treeshake=[*])
[![NPM Downloads](https://img.shields.io/npm/dm/inwire)](https://npmtrends.com/inwire)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/inwire)](https://github.com/axelhamil/inwire/blob/main/LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/inwire)

## Install

```bash
pnpm add inwire  # or npm i inwire
```

## Quick Start

```typescript
import { container } from 'inwire';

const app = container()
  .add('logger', () => new LoggerService())
  .add('db', (c) => new Database(c.logger))
  .add('userService', (c) => new UserService(c.db, c.logger))
  .build();

app.userService; // lazy, singleton, fully typed
// c.logger in the db factory is typed as LoggerService
```

Each `.add()` accumulates the type — `c` in every factory knows about all previously registered dependencies.

## Contract Mode (Interface-First)

Pass an interface to the builder to constrain keys and return types at compile time:

```typescript
interface AppDeps {
  ILogger: Logger;
  IDatabase: Database;
  IUserService: UserService;
}

const app = container<AppDeps>()
  .add('ILogger', () => new ConsoleLogger())         // key: autocomplete keyof AppDeps
  .add('IDatabase', (c) => new PgDatabase(c.ILogger)) // return must be Database
  .add('IUserService', (c) => new UserService(c.IDatabase, c.ILogger))
  .build();

app.ILogger; // typed as Logger (not ConsoleLogger)
```

The string key acts as a token (like NestJS), but type-safe at compile time.

## Instance Values (Eager)

Non-function values are registered eagerly:

```typescript
const app = container()
  .add('config', { port: 3000, host: 'localhost' })  // object, not factory — eager
  .add('db', (c) => new Database(c.config))           // factory — lazy
  .build();
```

Convention: `typeof value === 'function'` → factory (lazy). Otherwise → instance (eager, wrapped in `() => value`).
To register a function as a value: `.add('fn', () => myFunction)`.

## Async Lifecycle

Property access on the container is **synchronous**. If your service implements `onInit()` with an async function, it will be called but **not awaited** — errors are silently swallowed and your service may be used before it's ready.

**`preload()` is the only way to safely initialize async services.**

```typescript
class Database implements OnInit {
  async onInit() { await this.connect(); }
}

const app = container()
  .add('db', () => new Database())
  .build();

// BAD — onInit() fires but is NOT awaited, errors are lost
app.db;

// GOOD — onInit() is awaited, errors surface immediately
await app.preload('db');
app.db; // safe to use, fully initialized
```

## Why use a DI container?

- **Testability** — swap any dependency for a mock at creation time, no monkey-patching or `jest.mock`
- **Decoupling** — program against interfaces, not concrete imports; swap implementations without touching consumers
- **Visibility** — inspect the full dependency graph at runtime, catch scope mismatches, and monitor container health

## Why inwire?

- **Full type inference** — `c.db` gives you native autocomplete with zero annotations. No tokens, no decorators, no `container.get<T>('key')`.
- **Automatic dependency tracking** — a tracking Proxy records which keys each factory accesses at resolution time. The dependency graph builds itself.
- **Circular dependency detection** — cycles are caught at resolution time with the full chain (`A → B → C → A`) and actionable fix suggestions. No stack overflow, no cryptic errors. Most DI containers (awilix, ioctopus) just crash.
- **Smart errors** — 7 error types, each with `hint`, `details`, and fuzzy matching ("did you mean `userService`?"). Designed for both humans and LLMs to parse.
- **Built-in introspection** — `inspect()` returns a serializable JSON graph. Feed it to an LLM, render it in a dashboard, or use `health()` to catch scope mismatches at runtime.
- **Runtime agnostic** — pure ES2022. No decorators, no `reflect-metadata`, no compiler plugins. Works in Node.js, Deno, Bun, Cloudflare Workers, Vercel Edge, and browsers.
- **Clean internals** — Clean Architecture, SOLID, single-responsibility files. Open any file, understand it, change it without fear.
- **Tiny** — ~4 KB gzip, zero dependencies.

## Features

### Lazy Singletons (default)

```typescript
const app = container()
  .add('db', () => new Database(process.env.DB_URL!))
  .build();

app.db; // creates Database
app.db; // same instance (cached)
```

### Transient

Fresh instance on every access via `addTransient()`:

```typescript
import { container } from 'inwire';

const app = container()
  .add('logger', () => new LoggerService())
  .addTransient('requestId', () => crypto.randomUUID())
  .build();

app.logger === app.logger;         // true  — singleton
app.requestId === app.requestId;   // false — new every time
```

`transient()` wrapper is still available for `scope()`/`extend()`:

```typescript
import { transient } from 'inwire';

const extended = app.extend({
  timestamp: transient(() => Date.now()),
});
```

### Scopes

Create child containers for request-level isolation:

```typescript
const app = container()
  .add('logger', () => new LoggerService())
  .add('db', () => new Database())
  .build();

const request = app.scope({
  requestId: () => crypto.randomUUID(),
  handler: (c) => new Handler(c.logger),  // c typed as typeof app
});

request.requestId; // scoped singleton
request.logger;    // inherited from parent
```

#### Named Scopes

```typescript
const request = app.scope(
  { requestId: () => crypto.randomUUID() },
  { name: 'request-123' },
);

String(request);        // "Scope(request-123) { requestId (pending) }"
request.inspect().name; // "request-123"
```

### Lifecycle (onInit / onDestroy / dispose)

```typescript
import type { OnInit, OnDestroy } from 'inwire';

class Database implements OnInit, OnDestroy {
  async onInit() { await this.connect(); }
  async onDestroy() { await this.disconnect(); }
}

const app = container()
  .add('db', () => new Database())
  .build();

app.db;               // resolves + calls onInit()
await app.dispose();  // calls onDestroy() on all resolved instances (LIFO order)
```

### Extend

Add dependencies to an existing container without mutating it:

```typescript
const base = container()
  .add('logger', () => new LoggerService())
  .build();

const extended = base.extend({
  db: (c) => new Database(c.logger),  // c typed as typeof base
});

extended.logger; // shared singleton from base
extended.db;     // new dependency
```

> **scope vs extend:** `scope()` creates a parent-child chain. `extend()` creates a flat container with merged factories and shared cache. Use `scope()` for per-request isolation, `extend()` for additive composition.

### Modules

Split a large container into reusable modules. Each module declares its prerequisites locally — no shared `AppDeps` interface, no manual generics.

#### `defineModule()` — recommended pattern

`defineModule<Prerequisites>()(builder => builder.add(...))` infers the module's output from the chained `.add()` calls. Prerequisites are explicit and local to the module file.

```typescript
import { container, defineModule } from 'inwire';

interface Logger { log: (msg: string) => void }

const dbModule = defineModule<{ logger: Logger }>()((b) =>
  b
    .add('db', (c) => new Database(c.logger))
    .add('cache', (c) => new Redis(c.logger)),
);

const userModule = defineModule<{ db: Database; logger: Logger }>()((b) =>
  b.add('userService', (c) => new UserService(c.db, c.logger)),
);

const app = container()
  .add('logger', (): Logger => new ConsoleLogger())
  .addModule(dbModule)
  .addModule(userModule)
  .build();
```

Why this works:
- Each module declares only what it **needs** — no import of a global `AppDeps` interface.
- The output type is inferred from the `.add()` chain — no duplicated signatures.
- `addModule()` does not enforce prereq satisfaction at the type level — `c.X` is typed via the module's `<TDeps>` (or the global `AppDeps`), and missing keys raise `ProviderNotFoundError` at resolution time. The trade-off: cross-module forward references and global-mode (`defineModule()` + `AppDeps`) work without ordering constraints.

#### `.merge()` — fuse standalone builders

When a module has no prerequisites (or just bundles independent bindings), define it as a standalone builder and merge it:

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

`.merge()` copies factories into the host builder. Cross-builder dependencies are resolved at build time. Duplicate keys override (last write wins). Reserved keys throw.

#### Anti-pattern (avoid)

Older code may show this manual generic pattern — it works but is verbose, couples the module to a global `AppDeps`, and forces you to redeclare every prerequisite by hand:

```typescript
// Don't do this anymore — use defineModule() instead.
function dbModule<T extends { logger: Logger }>(
  b: ContainerBuilder<AppDeps, T>,
) {
  return b.add('db', (c) => new Database(c.logger));
}
```

#### Post-build: `module()` on the container

Compose post-build using the same builder DX:

```typescript
const core = container().add('logger', () => new Logger()).build();

const withDb = core.module((b) =>
  b.add('db', (c) => new Database(c.logger)),
);

// Chainable — c accumulates previous bindings
const full = withDb.module((b) =>
  b.add('userService', (c) => new UserService(c.db, c.logger)),
);
```

`module()` uses the builder internally for typed `c`, then delegates to `extend()`. Works on `scope()` and `extend()` results too.

#### Deriving the container shape (Zod-style)

You don't need to maintain a manual interface for the container's full shape. Derive it from the container itself, exactly like `z.infer<typeof schema>`:

```typescript
// container.ts
import { container } from 'inwire';
import { authModule } from './modules/auth.module';
import { billingModule } from './modules/billing.module';
import { persistenceModule } from './modules/persistence.module';

export const di = container()
  .addModule(persistenceModule)
  .addModule(authModule)
  .addModule(billingModule)
  .build();

// Single source of truth — derived, never written by hand.
// Use this as the type for handlers, controllers, etc.
export type Di = typeof di;
```

> Note: `Di` is your own type alias, not the global `AppDeps` interface inwire exports for the Pinia-style pattern below. They serve different purposes — `Di` is consumed by your code; `AppDeps` augments inwire's typing.

Each module declares only the contracts it consumes via `<TDeps>` — and those contracts are the **interfaces you already have** in `domain/` or `contracts/` (Clean Architecture, DDD):

```typescript
// modules/auth.module.ts
import { defineModule } from 'inwire';
import type { IUserRepository } from '../contracts/IUserRepository';
import type { IAuthProvider } from '../contracts/IAuthProvider';
import { BetterAuthProvider } from '../infrastructure/BetterAuthProvider';
import { SignInUseCase } from '../application/SignInUseCase';

export const authModule = defineModule<{ IUserRepository: IUserRepository }>()((b) =>
  b
    .add('IAuthProvider', (): IAuthProvider => new BetterAuthProvider())
    .add('SignInUseCase', (c) => new SignInUseCase(c.IUserRepository, c.IAuthProvider)),
);
```

Why this is the right pattern:
- **No shape interface to maintain.** Add a binding anywhere → `Di` grows automatically. Remove one → it shrinks.
- **No `declare module` augmentation.** No global state, no import side-effects.
- **Local prerequisites.** A module's `<TDeps>` is its API contract — three lines max, exactly what it needs.
- **Cross-module references work at build time.** When `authModule` registers `SignInUseCase` that needs `IUserRepository` (provided by `persistenceModule`), the prerequisite check at `addModule()` time enforces the order.

See [examples/05-zod-style-typing.ts](examples/05-zod-style-typing.ts) for a full walk-through with three modules and a derived `Di`.

#### Cross-module forward references (Pinia-style)

When a module needs to consume a binding **provided by another module loaded later**, the local `<TDeps>` pattern can't help — the prerequisite would have to list everything the module sees, defeating the locality. For that case, inwire exposes an augmentable global interface, exactly like Pinia's `PiniaCustomProperties` or Vue's `ComponentCustomProperties`:

```typescript
import 'inwire';

declare module 'inwire' {
  interface AppDeps {
    IUserRepository: IUserRepository;
    SignInUseCase: SignInUseCase;
  }
}
```

Each module file augments `AppDeps` with the bindings **it provides**. When you call `defineModule()` *without* a `<TDeps>` generic, `c` is typed as the global `AppDeps` — so `c.X` resolves transparently across modules, regardless of declaration order:

```typescript
// modules/auth.module.ts
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
  //                       provided by another module — type-checked via AppDeps
);
```

Trade-off vs `defineModule<TDeps>()`:

| Pattern | You declare | Cross-module forward ref |
|---|---|---|
| `defineModule<TDeps>()` | what the module **consumes** (inputs) | no — must be already added |
| `defineModule()` + `declare module` | what the module **adds** (outputs) | yes — order-independent |

Both patterns coexist. Mix freely — the explicit `<TDeps>` always overrides the global mode for that module. Why two? Because not every project needs the global augmentation, and not every module needs a tight prerequisite list. Pick the one that feels lighter for the file you're writing.

See [examples/06-pinia-augmentation.ts](examples/06-pinia-augmentation.ts) for a full walk-through with two modules cross-referencing each other.

### Preload

```typescript
await app.preload('db', 'cache'); // resolve specific deps
await app.preload();              // resolve ALL
```

`preload()` **awaits `onInit()`** on every resolved service and runs independent branches in parallel using topological sorting:

```
Level 0:  [config]          ← no deps, inits first
Level 1:  [db] [cache]      ← depend on config, init in parallel
Level 2:  [api]             ← depends on db + cache, inits last
```

Errors thrown in `onInit()` propagate to the caller — use `try/catch` around `preload()` for startup validation.

### Reset

```typescript
app.db;           // creates Database
app.reset('db');
app.db;           // creates a NEW Database instance
```

### Introspection

```typescript
app.inspect();     // full dependency graph (JSON)
app.describe('db'); // single provider info
app.health();      // health status + warnings
String(app);       // human-readable
```

Feed the graph to an LLM:

```typescript
const graph = JSON.stringify(app.inspect(), null, 2);
```

### Smart Errors

7 error types, each with `hint`, `details`, and actionable suggestions:

```typescript
// Reserved key
container().add('inspect', () => 'foo');
// ReservedKeyError: 'inspect' is a reserved container method.

// Missing dependency with fuzzy suggestion
app.userServce; // typo
// ProviderNotFoundError: Did you mean 'userService'?

// Circular dependency
// CircularDependencyError: Cycle: authService -> userService -> authService
```

### Scope Mismatch Detection

```typescript
app.health().warnings;
// [{ type: 'scope_mismatch', message: "Singleton 'userService' depends on transient 'requestId'." }]
```

### Duplicate Key Detection

```typescript
import { detectDuplicateKeys } from 'inwire';

detectDuplicateKeys(authModule, userModule);
// ['logger']
```

## Examples

| Example | Run | Showcases |
|---|---|---|
| [01-web-service.ts](examples/01-web-service.ts) | `npm run example:web` | Contract mode, lifecycle, dependency inversion, scope, introspection |
| [02-modular-testing.ts](examples/02-modular-testing.ts) | `npm run example:test` | Free mode, instance values, test overrides, extend + transient |
| [03-plugin-system.ts](examples/03-plugin-system.ts) | `npm run example:plugin` | Extend chain, scoped jobs, health, JSON graph for LLM |
| [04-modules.ts](examples/04-modules.ts) | `npm run example:modules` | addModule, module() post-build, typed reusable modules |
| [05-zod-style-typing.ts](examples/05-zod-style-typing.ts) | `npm run example:typing` | `type AppDeps = typeof di` pattern, Clean Arch contracts, no manual interface |
| [06-pinia-augmentation.ts](examples/06-pinia-augmentation.ts) | `npm run example:pinia` | Cross-module forward references via `declare module 'inwire'`, order-independent typing |

## Architecture

Clean Architecture / SOLID internals. The dependency rule is enforced: `domain/` has zero imports from other layers.

```
src/
  index.ts                       # public barrel — only file consumers import
  domain/                        # pure contracts — no framework deps
    types.ts                     # interfaces (IResolver, ICycleDetector, IDependencyTracker, IValidator)
    errors.ts                    # 7 error classes + 2 warning types, each with hint + details
    lifecycle.ts                 # OnInit / OnDestroy (duck-typed)
    validation.ts                # Validator, detectDuplicateKeys, Levenshtein
  infrastructure/                # low-level mechanisms — depends on domain/ only
    resolver.ts                  # lazy resolution, singleton cache, parent chain
    cycle-detector.ts            # circular dependency detection
    dependency-tracker.ts        # tracking Proxy + dependency graph builder
    transient.ts                 # transient() marker (Symbol-based)
  application/                   # use cases + orchestration — depends on domain/ + infrastructure/
    container-builder.ts         # fluent builder + container() factory
    container-proxy.ts           # Proxy construction, scope/extend/reset
    preloader.ts                 # topological sort (Kahn) + parallel onInit
    disposer.ts                  # reverse-order onDestroy + cleanup
    introspection.ts             # inspect, describe, health, toString
```

Each file has a single responsibility. The Resolver receives its collaborators (`CycleDetector`, `DependencyTracker`) via constructor injection — no internal `new`, no hidden coupling. `Preloader`, `Disposer`, and `Introspection` depend on the `IResolver` interface, not the concrete class.

## LLM / AI Integration

This package ships with [llms.txt](https://llmstxt.org/) files for AI-assisted development:

- **`llms.txt`** — Concise index following the llms.txt standard
- **`llms-full.txt`** — Complete API reference optimized for LLM context windows

Compatible with [Context7](https://context7.com/) and any tool that supports the llms.txt standard.

## API Reference

### Functions

| Export | Description |
|---|---|
| `container<T?>()` | Creates a new `ContainerBuilder`. Pass interface `T` for contract mode. |
| `defineModule<Deps>()(fn)` | Creates a typed, reusable module with locally-declared prerequisites |
| `transient(factory)` | Marks a factory as transient (for scope/extend) |
| `detectDuplicateKeys(...modules)` | Pre-spread validation — detects duplicate keys |

### ContainerBuilder Methods

| Method | Description |
|---|---|
| `.add(key, factory)` | Register a dependency (factory or instance) |
| `.addTransient(key, factory)` | Register a transient dependency |
| `.addModule(module)` | Apply a module `(builder) => builder` (use with `defineModule()`) |
| `.merge(otherBuilder)` | Merge a standalone builder's factories into this one |
| `.build()` | Build and return the container |

### Container Methods

| Method | Description |
|---|---|
| `.scope(extra, options?)` | Creates a child container with additional deps |
| `.extend(extra)` | Returns a new container with additional deps (shared cache) |
| `.module(fn)` | Applies a module post-build using the builder for typed `c` |
| `.preload(...keys)` | Eagerly resolves dependencies |
| `.reset(...keys)` | Invalidates cached singletons |
| `.inspect()` | Returns the full dependency graph |
| `.describe(key)` | Returns info about a single provider |
| `.health()` | Returns health status and warnings |
| `.dispose()` | Calls `onDestroy()` on all resolved instances |

### Types

| Export | Description |
|---|---|
| `Container<T>` | Full container type (resolved deps + methods) |
| `ContainerBuilder<TContract, TBuilt>` | Fluent builder class (also used in `module()` callbacks) |
| `IContainer<T>` | Container methods interface |
| `Module<TDeps, TBuilt>` | Type of a reusable module (returned by `defineModule()`) |
| `InferModuleDeps<M>` / `InferModuleBuilt<M>` | Extract a module's prerequisites or full output type |
| `Factory<T>` | Function type for raw factories (`(c: unknown) => T`) |
| `OnInit` | Interface with `onInit(): void \| Promise<void>` |
| `OnDestroy` | Interface with `onDestroy(): void \| Promise<void>` |
| `ContainerGraph` | Return type of `inspect()` |
| `ContainerHealth` | Return type of `health()` |
| `ContainerWarning` | Warning object (`scope_mismatch`) |
| `ProviderInfo` | Return type of `describe()` |
| `ScopeOptions` | Options for `scope()` (`{ name?: string }`) |

### Errors

| Export | Thrown when |
|---|---|
| `ContainerError` | Base class for all errors |
| `ContainerConfigError` | Non-function value in deps definition |
| `ReservedKeyError` | Reserved key used as dependency name |
| `ProviderNotFoundError` | Dependency not found during resolution |
| `CircularDependencyError` | Circular dependency detected |
| `UndefinedReturnError` | Factory returned `undefined` |
| `FactoryError` | Factory threw during resolution |
| `ScopeMismatchWarning` | Singleton depends on transient |

## License

MIT
