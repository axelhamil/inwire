# inwire

Zero-ceremony dependency injection for TypeScript. Full inference, no decorators, no tokens. Built-in introspection for AI tooling and debugging.

[![NPM Version](https://img.shields.io/npm/v/inwire)](https://www.npmjs.com/package/inwire)
[![CI](https://img.shields.io/github/actions/workflow/status/axelhamil/inwire/ci.yml)](https://github.com/axelhamil/inwire/actions)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/inwire)](https://bundlephobia.com/package/inwire)
[![NPM Downloads](https://img.shields.io/npm/dm/inwire)](https://www.npmjs.com/package/inwire)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/inwire)](https://github.com/axelhamil/inwire/blob/main/LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/inwire)

## Install

```bash
npm i inwire
```

## Quick Start

```typescript
import { createContainer } from 'inwire';

const container = createContainer({
  logger: () => new LoggerService(),
  db: () => new Database(process.env.DB_URL!),
  userRepo: (c): UserRepository => new PgUserRepo(c.db),
  userService: (c) => new UserService(c.userRepo, c.logger),
});

container.userService; // lazy, singleton, fully typed
```

That's it. Every dependency is a factory function `(container) => instance`. Access a property, get a singleton. TypeScript infers everything.

## ⚠️ Important: Async Lifecycle

Property access on the container is **synchronous**. If your service implements `onInit()` with an async function, it will be called but **not awaited** — errors are silently swallowed and your service may be used before it's ready.

**`preload()` is the only way to safely initialize async services.**

```typescript
class Database implements OnInit {
  async onInit() { await this.connect(); }
}

const container = createContainer({
  db: () => new Database(),
});

// ❌ BAD — onInit() fires but is NOT awaited, errors are lost
container.db;

// ✅ GOOD — onInit() is awaited, errors surface immediately
await container.preload('db');
container.db; // safe to use, fully initialized
```

## Why use a DI container?

Most JS/TS projects wire dependencies through direct imports. A DI container gives you three things imports don't:

- **Testability** — swap any dependency for a mock at creation time, no monkey-patching or `jest.mock`
- **Decoupling** — program against interfaces, not concrete imports; swap implementations without touching consumers
- **Visibility** — inspect the full dependency graph at runtime, catch scope mismatches, and monitor container health

## Features

### Lazy Singletons (default)

Factories run on first access and the result is cached forever. No eager init, no manual wiring.

```typescript
const container = createContainer({
  db: () => new Database(process.env.DB_URL!),
});

container.db; // creates Database
container.db; // same instance (cached)
```

### Dependency Inversion

Annotate the return type to program against an interface:

```typescript
const container = createContainer({
  userRepo: (c): UserRepository => new PgUserRepo(c.db),
  //            ^^^^^^^^^^^^^^^^^
  //            contract, not implementation
});

container.userRepo; // typed as UserRepository
```

### Modules = Spread Objects

Group related factories into plain objects and spread them:

```typescript
const dbModule = {
  db: () => new Database(process.env.DB_URL!),
  redis: () => new Redis(process.env.REDIS_URL!),
};

const serviceModule = {
  userService: (c) => new UserService(c.db),
};

const container = createContainer({
  ...dbModule,
  ...serviceModule,
});
```

> **Design trade-off**: the `c` parameter in every factory is typed as `any`. TypeScript fully infers the **resolved container** type (what you get from `container.userService`), but cannot circularly infer the container shape inside the factories that define it. This is a deliberate choice — zero ceremony, no tokens, no decorators. In exchange, inwire provides a robust runtime safety net: fuzzy key suggestions, full resolution chains, structured `hint` + `details` on all 7 error types, and `health()` warnings for scope mismatches. See [examples/02-modular-testing.ts](examples/02-modular-testing.ts) for a full walkthrough.

### Test Overrides

Replace any dependency with a mock at container creation:

```typescript
const container = createContainer({
  ...productionDeps,
  db: () => new InMemoryDatabase(), // override
});
```

### Scopes

Create child containers for request-level isolation. The child inherits all parent singletons and adds its own:

```typescript
const container = createContainer({
  logger: () => new LoggerService(),
  db: () => new Database(),
});

// Per-request child container
const request = container.scope({
  requestId: () => crypto.randomUUID(),
  currentUser: () => getCurrentUser(),
});

request.requestId;   // scoped singleton (unique to this child)
request.logger;      // inherited from parent
```

#### Named Scopes

Pass an options object to name a scope for debugging and introspection:

```typescript
const request = container.scope(
  { requestId: () => crypto.randomUUID() },
  { name: 'request-123' },
);

String(request);       // "Scope(request-123) { requestId (pending) }"
request.inspect().name; // "request-123"
```

### Transient

By default every dependency is a **singleton** (created once, cached forever). When you need a **fresh instance on every access**, wrap the factory with `transient()`:

```typescript
import { createContainer, transient } from 'inwire';

const container = createContainer({
  logger: () => new LoggerService(),                  // singleton (default)
  requestId: transient(() => crypto.randomUUID()),   // new value every time
});

container.logger === container.logger;       // true  — same instance
container.requestId === container.requestId; // false — different every time
```

### Lifecycle (onInit / onDestroy / dispose)

Implement `onInit()` for post-creation setup and `onDestroy()` for cleanup:

```typescript
import type { OnInit, OnDestroy } from 'inwire';

class Database implements OnInit, OnDestroy {
  async onInit() { await this.connect(); }
  async onDestroy() { await this.disconnect(); }
}

const container = createContainer({
  db: () => new Database(),
});

container.db;           // resolves + calls onInit()
await container.dispose(); // calls onDestroy() on all resolved instances (LIFO order)
```

**Async `onInit()` is fire-and-forget during property access.** Because container property access is synchronous, any async `onInit()` runs without being awaited — errors won't surface and the service may not be ready. Use `preload()` to await async initialization. See [⚠️ Important: Async Lifecycle](#️-important-async-lifecycle) above.

### Extend

Add dependencies to an existing container without mutating it. Existing singletons are shared:

```typescript
const base = createContainer({
  logger: () => new LoggerService(),
});

const extended = base.extend({
  db: (c) => new Database(c.logger),
});

extended.logger; // shared singleton from base
extended.db;     // new dependency
```

> **scope vs extend:** `scope()` creates a parent-child chain — the child delegates unresolved keys to the parent. `extend()` creates a flat container with a merged factory map and shared cache. Use `scope()` for per-request isolation, `extend()` for additive composition.

### Preload

Eagerly resolve specific dependencies at startup (warm-up):

```typescript
const container = createContainer({
  db: () => new Database(),
  cache: () => new Redis(),
  logger: () => new LoggerService(),
});

await container.preload('db', 'cache');
// db and cache are now resolved, logger is still lazy

await container.preload();
// resolve ALL dependencies at once
```

**This is how you safely initialize async services.** See [⚠️ Important: Async Lifecycle](#️-important-async-lifecycle) above.

### Reset

Invalidate cached singletons to force re-creation on next access:

```typescript
const container = createContainer({
  db: () => new Database(),
  cache: () => new Redis(),
});

container.db;  // creates Database
container.reset('db');
container.db;  // creates a NEW Database instance

// Other singletons are untouched
// Reset in a scope does not affect the parent
```

### Introspection

Built-in tools for debugging and AI analysis:

```typescript
// Full dependency graph
container.inspect();
// { providers: { db: { key: 'db', resolved: true, deps: [], scope: 'singleton' }, ... } }

// Single provider details
container.describe('userService');
// { key: 'userService', resolved: true, deps: ['userRepo', 'logger'], scope: 'singleton' }

// Health check
container.health();
// { totalProviders: 4, resolved: ['db', 'logger'], unresolved: ['cache'], warnings: [] }

// Human-readable string
String(container);
// "Container { db -> [] (resolved), logger (pending) }"
```

Feed the graph to an LLM or diagnostic tool:

```typescript
const graph = JSON.stringify(container.inspect(), null, 2);

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: `Analyze this dependency graph for issues:\n${graph}` }],
});
```

### Smart Errors

7 error types, each with `hint`, `details`, and actionable suggestions:

```typescript
// Non-function value
createContainer({ apiKey: 'sk-123' });
// ContainerConfigError: 'apiKey' must be a factory function, got string.
// hint: "Wrap it: apiKey: () => 'sk-123'"

// Reserved key
createContainer({ inspect: () => 'foo' });
// ReservedKeyError: 'inspect' is a reserved container method.
// hint: "Rename this dependency, e.g. 'inspectService' or 'myInspect'."

// Missing dependency with fuzzy suggestion
container.userServce; // typo
// ProviderNotFoundError: Cannot resolve 'userServce': dependency 'userServce' not found.
// hint: "Did you mean 'userService'?"

// Circular dependency
// CircularDependencyError: Circular dependency detected while resolving 'authService'.
// Cycle: authService -> userService -> authService

// Undefined return
// UndefinedReturnError: Factory 'db' returned undefined.
// hint: "Did you forget a return statement?"

// Factory runtime error
// FactoryError: Factory 'db' threw an error: "Connection refused"
```

### Scope Mismatch Detection

Warns when a singleton depends on a transient (the transient value gets frozen inside the singleton):

```typescript
const container = createContainer({
  requestId: transient(() => crypto.randomUUID()),
  userService: (c) => new UserService(c.requestId), // singleton depends on transient!
});

container.health().warnings;
// [{ type: 'scope_mismatch', message: "Singleton 'userService' depends on transient 'requestId'." }]
```

### Fuzzy Key Suggestion

When a key is not found, Levenshtein-based matching suggests the closest registered key (>= 50% similarity):

```typescript
container.userServce;
// ProviderNotFoundError: Did you mean 'userService'?
```

### Duplicate Key Detection

When spreading modules, JavaScript silently overwrites duplicate keys (last one wins). inwire detects this internally and surfaces collisions via `health().warnings`:

```typescript
const container = createContainer({
  ...authModule,   // has 'logger'
  ...userModule,   // also has 'logger' — last one wins silently
});

container.health().warnings;
// [{ type: 'duplicate_key', message: "Key 'logger' appears in multiple modules", ... }]
```

For pre-spread validation, `detectDuplicateKeys()` is also available:

```typescript
import { detectDuplicateKeys } from 'inwire';

detectDuplicateKeys(authModule, userModule);
// ['logger']
```

## Examples

Runnable examples in the [`examples/`](examples/) directory:

| Example | Run | Showcases |
|---|---|---|
| [01-web-service.ts](examples/01-web-service.ts) | `npm run example:web` | Lifecycle (`onInit`/`onDestroy`), scope, introspection, fuzzy error, dispose |
| [02-modular-testing.ts](examples/02-modular-testing.ts) | `npm run example:test` | Modules via spread, test overrides, reset, extend + transient, runtime safety net |
| [03-plugin-system.ts](examples/03-plugin-system.ts) | `npm run example:plugin` | Extend chain, scoped jobs, health, JSON graph for LLM, graceful shutdown |

## Comparison

| Feature | inwire | awilix | tsyringe | Inversify | NestJS |
|---|---|---|---|---|---|
| Decorators required | No | No | Yes | Yes | Yes |
| Tokens/symbols | No | No | Yes | Yes | Yes |
| Full TS inference | Yes | No (manual Cradle) | Partial | Partial | Partial |
| Lazy singletons | Default | Default | Manual | Manual | Manual |
| Scoped containers | `.scope()` | `.createScope()` | `.createChildContainer()` | `.createChild()` | Module scope |
| Lifecycle hooks | `onInit`/`onDestroy` | `dispose()` | `beforeResolution`/`afterResolution` | No | `onModuleInit`/`onModuleDestroy` |
| Introspection | Built-in JSON graph | `.registrations` | `isRegistered()` | No | DevTools |
| Smart errors | 7 types + hints | Resolution chain | Generic | Generic | Generic |
| Bundle size (gzip) | ~4.7 KB | ~3.6 KB | ~5.6 KB (+reflect-metadata) | ~50 KB | Framework |
| Runtime deps | 0 | 1 | 1 (+reflect-metadata) | 2 | Many |

## Architecture

```
src/
  index.ts                       # barrel export
  domain/
    types.ts                     # interfaces, types, RESERVED_KEYS
    errors.ts                    # 7 error classes + ScopeMismatchWarning
    lifecycle.ts                 # OnInit / OnDestroy interfaces
    validation.ts                # Validator, detectDuplicateKeys, Levenshtein
  infrastructure/
    proxy-handler.ts             # Resolver (Proxy handler, cache, cycle detection)
    transient.ts                 # transient() marker
  application/
    create-container.ts          # createContainer, buildContainerProxy
    scope.ts                     # createScope (child containers)
    introspection.ts             # inspect, describe, health, toString
```

## LLM / AI Integration

This package ships with [llms.txt](https://llmstxt.org/) files for AI-assisted development:

- **`llms.txt`** — Concise index following the llms.txt standard
- **`llms-full.txt`** — Complete API reference optimized for LLM context windows

Use them to feed inwire documentation to any LLM or AI coding tool:

```bash
cat node_modules/inwire/llms-full.txt
```

Compatible with [Context7](https://context7.com/) and any tool that supports the llms.txt standard.

At runtime, `.inspect()` returns the full dependency graph as serializable JSON — pipe it directly into an LLM for architecture analysis:

```typescript
const graph = JSON.stringify(container.inspect(), null, 2);
```

## API Reference

### Functions

| Export | Description |
|---|---|
| `createContainer(defs)` | Creates a DI container from factory functions |
| `transient(factory)` | Marks a factory as transient (new instance per access) |
| `detectDuplicateKeys(...modules)` | Pre-spread validation — detects duplicate keys across module objects |

### Container Methods

| Method | Description |
|---|---|
| `container.scope(extra, options?)` | Creates a child container with additional deps. Pass `{ name }` for debugging |
| `container.extend(extra)` | Returns a new container with additional deps (shared cache) |
| `container.preload(...keys)` | Eagerly resolves specific dependencies, or all if no keys given |
| `container.reset(...keys)` | Invalidates cached singletons, forcing re-creation on next access |
| `container.inspect()` | Returns the full dependency graph |
| `container.describe(key)` | Returns info about a single provider |
| `container.health()` | Returns health status and warnings |
| `container.dispose()` | Calls `onDestroy()` on all resolved instances |

### Types

| Export | Description |
|---|---|
| `Container<T>` | Full container type (resolved deps + methods) |
| `DepsDefinition` | `Record<string, Factory>` |
| `Factory<T>` | `(container) => T` |
| `ResolvedDeps<T>` | Extracts return types from a `DepsDefinition` |
| `OnInit` | Interface with `onInit(): void \| Promise<void>` |
| `OnDestroy` | Interface with `onDestroy(): void \| Promise<void>` |
| `ContainerGraph` | Return type of `inspect()` |
| `ContainerHealth` | Return type of `health()` |
| `ContainerWarning` | Warning object (`scope_mismatch` \| `duplicate_key`) |
| `ProviderInfo` | Return type of `describe()` |
| `IContainer<T>` | Container methods interface |
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
