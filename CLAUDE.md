# CLAUDE.md

inwire — type-safe dependency injection for TypeScript. ESM-only, zero runtime dependencies, ~4KB gzip.

## Philosophy

Cross-cutting rules. They apply everywhere; everything below is a consequence.

- **No decorators, no tokens.** Deps are string keys; types accumulate via generics on `.add()`. **Why:** zero runtime cost, no `reflect-metadata`, full inference.
- **Proxy-based lazy resolution.** Accessing `c.db` triggers resolution. **Why:** factories declare deps by usage, not by annotation — no manual `.get()`.
- **Auto-built dependency graph.** The `c` passed to each factory is a tracking Proxy that records every property access. **Why:** zero extra API surface; the graph is a side product of normal code.
- **Singleton by default, transient opt-in.** `transient()` stamps `Symbol.for('inwire:transient')` on the factory. **Why:** predictable lifecycle, explicit opt-out, marker survives realm/bundler duplication.
- **Duck-typed lifecycle.** `onInit`/`onDestroy` are checked at runtime via `hasOnInit`/`hasOnDestroy`. **Why:** no base class, framework-agnostic, plain objects qualify.
- **Constructor injection for collaborators.** `Resolver` receives `{ cycleDetector, dependencyTracker, ... }` via `ResolverDeps`. **Why:** application code depends on `IResolver`, not on concretes; swappable in tests.
- **Composition Roots are sacred.** Only `application/container-builder.ts` and `application/container-proxy.ts` instantiate concrete infra (`Resolver`, `CycleDetector`, `DependencyTracker`). **Why:** dependency rule enforcement; everything else stays interface-only.

## Commands

```bash
pnpm test              # vitest run (245 tests, 23 files)
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # vitest run --coverage (thresholds: 90% all metrics)
pnpm build             # tsdown → dist/index.mjs + dist/index.d.mts
pnpm typecheck         # tsc --noEmit (src + examples/tsconfig.json)
pnpm lint              # biome check
pnpm lint:fix          # biome check --fix
pnpm check             # biome check && pnpm typecheck (full pre-commit check)
```

## Stack

- TypeScript 5.9 strict, target ES2022, module ES2022, `moduleResolution: bundler`
- Biome 2.x — formatter + linter
- Vitest 4.x with v8 coverage (90% statements/branches/functions/lines)
- tsdown (Rolldown-based) — ESM-only `.mjs` + `.d.mts`, minified, treeshaken, sourcemaps
- semantic-release — automated versioning from conventional commits
- pnpm 10 package manager
- **Zero runtime dependencies**

## Architecture

Clean Architecture with an enforced one-way dependency rule.

```
src/
  domain/              → Pure contracts. ZERO imports from other layers.
  infrastructure/      → Concrete mechanisms. Imports domain/ only.
  application/         → Use cases + orchestration. Imports domain/ + infrastructure/.
  index.ts             → Public barrel. Only file consumers see.
```

**The dependency rule is one-way**: `domain ← infrastructure ← application`. **Why:** keeps domain pure (testable without mocks), enforces inversion (infra implements domain interfaces), localizes concrete deps to the two Composition Roots.

**Architecture anti-patterns** (forbidden):

- Importing from `infrastructure/` or `application/` inside `domain/`.
- Importing from `application/` inside `infrastructure/`.
- Instantiating concrete infra classes (`Resolver`, `CycleDetector`, `DependencyTracker`) outside `container-builder.ts` or `container-proxy.ts`.
- Defining values inline in `src/index.ts` — the barrel only re-exports.

## Layer rules

### `domain/` — innermost

**What lives here:**

- `types.ts` — all interfaces: `IResolver`, `ICycleDetector`, `IDependencyTracker`, `IValidator`, `IContainer`, `Container<T>`, `Factory<T>`, `RESERVED_KEYS`, `AppDeps` (augmentable global interface for cross-module typing).
- `errors.ts` — 7 error classes (all extend `ContainerError` with `hint` + `details`) + 2 warning types.
- `lifecycle.ts` — `OnInit`/`OnDestroy` interfaces + duck-type guards (`hasOnInit`, `hasOnDestroy`).
- `validation.ts` — `Validator` class (implements `IValidator`), `detectDuplicateKeys`, Levenshtein distance.

**Rules:**

1. Zero external imports — neither sibling layers nor third-party. **Why:** domain is the contract layer; depending on anything else inverts the dependency rule.
2. All cross-layer interfaces declared here (`IResolver`, `ICycleDetector`, `IDependencyTracker`, `IValidator`, `IContainer`). **Why:** infra and application code depends on these, not on each other's concretes.
3. All errors extend `ContainerError` and carry `hint` + `details`. **Why:** consistent debugging surface — machine-readable details, human-readable hints.
4. `AppDeps` is an empty augmentable interface. **Why:** consumers `declare module 'inwire' { interface AppDeps { … } }` to enable cross-module forward references.

**Anti-patterns:**

- Adding a class with side effects (logger, fetch, fs, env) to `domain/`.
- Importing Node built-ins or third-party libs in `domain/`.
- Throwing a raw `Error` instead of a `ContainerError` subclass.

### `infrastructure/` — middle

**What lives here:**

- `resolver.ts` — `Resolver` (implements `IResolver`). Receives `ResolverDeps` via constructor injection. Handles lazy resolution, singleton cache, parent chain (scopes), warnings, `onInit` lifecycle.
- `cycle-detector.ts` — `CycleDetector` (implements `ICycleDetector`). Wraps a `Set<string>` for `enter`/`leave`/`isResolving`.
- `dependency-tracker.ts` — `DependencyTracker` (implements `IDependencyTracker`). Creates the tracking Proxy and stores the dependency graph.
- `transient.ts` — `transient()` wrapper + `isTransient()` check. Uses `Symbol.for('inwire:transient')`.

**Rules:**

1. Imports from `domain/` only — never from `application/`. **Why:** infra implements domain contracts; application orchestrates infra. Reverse coupling breaks the dependency rule.
2. `Resolver` receives all collaborators via `ResolverDeps` (constructor injection of an object). **Why:** swappable, testable in isolation, no `new` inside `Resolver`.
3. `transient()` uses `Symbol.for('inwire:transient')`, not a module-private symbol. **Why:** survives module duplication across bundlers/realms — the marker stays stable.
4. Each concrete class implements its domain interface (`Resolver implements IResolver`, etc.). **Why:** application code consumes the interface, not the concrete.

**Anti-patterns:**

- Adding a collaborator without first declaring its interface in `domain/types.ts`.
- Instantiating `Resolver` outside a Composition Root.
- Making `transient`'s marker a module-private symbol or a string property.

### `application/` — outermost

**What lives here:**

- `container-builder.ts` — `ContainerBuilder` fluent API (`.add` / `.addTransient` / `.addModule` / `.merge` / `.build`) + `container()` factory. Composition Root: instantiates `Resolver` with its collaborators.
- `container-proxy.ts` — `buildContainerProxy()`. Creates the ES Proxy, dispatches to `Preloader` / `Disposer` / `Introspection`. Also a Composition Root (creates resolvers for `.scope()` / `.extend()`).
- `define-module.ts` — `defineModule<TDeps>()(fn)` helper + `Module<TDeps, TBuilt>`, `InferModuleDeps`, `InferModuleBuilt` types.
- `preloader.ts` — `Preloader` + `topologicalLevels()` (Kahn's BFS). Depends on `IResolver`.
- `disposer.ts` — `Disposer`. Reverse-order `onDestroy()`, resilient error collection. Depends on `IResolver`.
- `introspection.ts` — `Introspection`. `inspect()` / `describe()` / `health()` / `toString()`. Depends on `IResolver`.

**Rules:**

1. Two Composition Roots only: `container-builder.ts` (initial build) and `container-proxy.ts` (`.scope()` / `.extend()`). **Why:** concentrate concrete infra wiring; everything else depends on `IResolver`.
2. Use cases (`Preloader`, `Disposer`, `Introspection`) depend on `IResolver` only. **Why:** swappable Resolver, testable with a fake, layer-pure.
3. `defineModule` has two modes — pick by ergonomics, not by accident:
   - **Local:** `defineModule<TDeps>()(b => …)` — declares **consumed** prereqs locally, no global state.
   - **Global:** `defineModule()(b => …)` + `declare module 'inwire' { interface AppDeps { … } }` — declares **provided** keys globally for cross-module forward references.
   **Why:** local is safer (zero coupling); global is needed when modules cross-reference each other regardless of declaration order.
4. `TBuilt` is **always** inferred from the chained `.add()` calls — never declared by hand. **Why:** hand-declaring breaks inference and lets shapes drift from reality.

**Anti-patterns:**

- Free-function module signatures: `function fooModule<T extends {…}>(b: ContainerBuilder<AppDeps, T>) { … }`. Verbose, couples to global, breaks inference. Use `defineModule` instead.
- Instantiating `Resolver`, `CycleDetector`, or `DependencyTracker` outside the two Composition Roots.
- Adding a use case class without an interface, or one that depends on a concrete infra class instead of `IResolver`.
- Re-exporting internal classes (`Resolver`, `Preloader`, `Disposer`, etc.) from `src/index.ts`.

## Conventions

### Code style (Biome)

- Always 2 spaces, single quotes, trailing commas, semicolons. Line width 100.
- `useConst`, `useTemplate`, no `console.*` in `src/` (allowed in `tests/`, `examples/`).
- `noExplicitAny` is `warn`. Suppress with `biome-ignore` and a one-line **Why** when generic flexibility requires it (`Record<string, any>` for interfaces without index signatures).

### TypeScript

- `strict: true`, target ES2022, module ES2022, `moduleResolution: bundler`.
- All imports use `.js` extensions. **Why:** ESM resolution requires explicit extensions; bundler resolution still maps `.js` → `.ts`.
- `any` is used sparingly for generic constraints — always with a `biome-ignore` comment explaining why.

### Testing

- Vitest with globals enabled.
- Tests import from `'../src/index.js'` (the public barrel) **except** unit tests for internal classes. **Why:** validates the public API surface; internal unit tests cover non-exported classes (`CycleDetector`, `DependencyTracker`, `Preloader`, `Disposer`).
- Coverage thresholds: 90% statements, branches, functions, lines. **Why:** library code with public API surface — branch/function regressions are user-facing.
- Layout:
  - Internal infra: `tests/cycle-detector.test.ts`, `tests/dependency-tracker.test.ts`.
  - Internal use cases: `tests/preloader.test.ts`, `tests/disposer.test.ts`.
  - Public API: everything else.
  - Integration: `tests/integration.test.ts`.

### Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- semantic-release drives versioning — never bump versions by hand.
- Branch naming: `feat/`, `fix/`, `refactor/`.

### Build

- tsdown (Rolldown): ESM only, minified, treeshaken, sourcemaps, `.d.mts` declarations.
- `publint` runs on build.
- Only `dist/` is published (sourcemaps excluded via `!dist/*.map`).

## API surface

The public API is defined in `src/index.ts`. **If it's not in this list, it's not part of the public API — never re-export an internal class to "fix" a consumer's import.**

Exported:

- **Values:** `container()`, `ContainerBuilder`, `defineModule`, `transient`, `detectDuplicateKeys`.
- **Errors (values):** `ContainerError`, `CircularDependencyError`, `ContainerConfigError`, `FactoryError`, `ProviderNotFoundError`, `ReservedKeyError`, `UndefinedReturnError`, `AsyncInitErrorWarning`, `ScopeMismatchWarning`.
- **Types:** `OnInit`, `OnDestroy`, `AppDeps`, `Container`, `IContainer`, `Factory`, `ContainerGraph`, `ContainerHealth`, `ContainerWarning`, `ProviderInfo`, `ScopeOptions`, `Module`, `InferModuleDeps`, `InferModuleBuilt`.

Internal (NOT exported): `Resolver`, `CycleDetector`, `DependencyTracker`, `Preloader`, `Disposer`, `Introspection`, `Validator`, `TRANSIENT_MARKER`.

## Cookbooks

### Adding a new container method

1. Add the method signature to `IContainer<T>` in `domain/types.ts`.
2. Add the key to `RESERVED_KEYS` in `domain/types.ts`.
3. Implement in `container-proxy.ts` (or extract a new use case class in `application/`).
4. Add tests through the public barrel (`tests/<feature>.test.ts` importing from `'../src/index.js'`).

### Authoring a separate module

Three patterns. Pick by the table below — never mix.

| Situation | Pattern | Snippet |
|---|---|---|
| Small fixed prereqs, no cross-module refs | **Local prereqs** | `defineModule<{ db: Db }>()(b => b.add('users', c => new UsersService(c.db)))` |
| Modules forward-reference each other | **Global cross-ref** | `defineModule()(b => b.add('users', c => …))` + `declare module 'inwire' { interface AppDeps { users: UsersService } }` per file |
| Module has no prereqs at all | **Standalone + merge** | `const usersBuilder = container().add('users', () => …)` then `host.merge(usersBuilder)` |

**Anti-pattern:** the legacy `function fooModule<T extends { ... }>(b: ContainerBuilder<AppDeps, T>)` free-function generic. Verbose, couples to global, breaks inference. Use one of the three patterns above.

### Adding a new error type

1. Create a class extending `ContainerError` in `domain/errors.ts` with `hint` and `details`.
2. If it's a non-fatal warning, add to the `AnyWarning` union.
3. Export from `src/index.ts`.

### Adding a new infrastructure collaborator

1. Define its interface in `domain/types.ts`.
2. Implement the concrete in `infrastructure/`.
3. Add it to `ResolverDeps` in `resolver.ts` if `Resolver` consumes it.
4. Inject in both Composition Roots (`container-builder.ts`, `container-proxy.ts`).

## Top-level anti-patterns

A consolidated list — what NOT to do across the whole codebase.

- Don't add a third Composition Root. The two existing ones (`container-builder.ts`, `container-proxy.ts`) cover initial build and scope/extend respectively.
- Don't reintroduce decorators, tokens, or metadata-based DI. The whole library exists to avoid them.
- Don't make singleton-vs-transient implicit — transient must be explicit via `transient()` or `.addTransient()`.
- Don't catch errors silently. Wrap unknown errors in a `FactoryError` (or a new `ContainerError` subclass) and bubble up.
- Don't add inline comments explaining what code does. Names + types document **what**; reserve comments for non-obvious **why** (a hidden invariant, a subtle bug fix, a workaround).
- Don't grow `src/index.ts` with inline definitions — it's a re-export barrel only.
- Don't bump `package.json` version manually. semantic-release owns versioning.
