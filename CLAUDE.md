# CLAUDE.md

## Project

inwire — type-safe dependency injection for TypeScript. ESM-only library, zero runtime dependencies. ~4KB gzip.

## Commands

```bash
pnpm test              # vitest run (224 tests, 20 files)
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # vitest run --coverage (thresholds: 90% all metrics)
pnpm build             # tsdown → dist/index.mjs + dist/index.d.mts
pnpm typecheck         # tsc --noEmit
pnpm lint              # biome check
pnpm lint:fix          # biome check --fix
pnpm check             # biome check && tsc --noEmit (full pre-commit check)
```

## Architecture

Clean Architecture with enforced dependency rule. Three layers:

```
src/
  domain/              → Pure contracts. ZERO imports from other layers.
  infrastructure/      → Concrete mechanisms. Imports domain/ only.
  application/         → Use cases + orchestration. Imports domain/ + infrastructure/.
  index.ts             → Public barrel. Only file consumers see.
```

### domain/ (innermost)
- `types.ts` — All interfaces: `IResolver`, `ICycleDetector`, `IDependencyTracker`, `IValidator`, `IContainer`, `Container<T>`, `Factory<T>`, `RESERVED_KEYS`
- `errors.ts` — 7 error classes (all extend `ContainerError` with `hint` + `details`) + 2 warning types
- `lifecycle.ts` — `OnInit`/`OnDestroy` interfaces + duck-type guards (`hasOnInit`, `hasOnDestroy`)
- `validation.ts` — `Validator` class (implements `IValidator`), `detectDuplicateKeys`, Levenshtein distance

### infrastructure/ (middle)
- `resolver.ts` — `Resolver` (implements `IResolver`). Receives `ICycleDetector` + `IDependencyTracker` via constructor injection (`ResolverDeps` object). Handles: lazy resolution, singleton cache, parent chain (scopes), warnings, onInit lifecycle.
- `cycle-detector.ts` — `CycleDetector` (implements `ICycleDetector`). Wraps a `Set<string>` for enter/leave/isResolving.
- `dependency-tracker.ts` — `DependencyTracker` (implements `IDependencyTracker`). Creates tracking Proxy + stores the dependency graph.
- `transient.ts` — `transient()` wrapper + `isTransient()` check. Uses `Symbol.for('inwire:transient')`.

### application/ (outermost)
- `container-builder.ts` — `ContainerBuilder` fluent API + `container()` factory. Composition Root: instantiates Resolver with its collaborators.
- `container-proxy.ts` — `buildContainerProxy()`. Creates the ES Proxy, dispatches to Preloader/Disposer/Introspection. Also a Composition Root (creates Resolvers for scope/extend).
- `preloader.ts` — `Preloader` class + `topologicalLevels()` (Kahn's BFS). Depends on `IResolver`.
- `disposer.ts` — `Disposer` class. Reverse-order `onDestroy()`, resilient error collection. Depends on `IResolver`.
- `introspection.ts` — `Introspection` class. `inspect()`/`describe()`/`health()`/`toString()`. Depends on `IResolver`.

## Key Design Decisions

- **No decorators, no tokens** — deps identified by string keys, types inferred via generic accumulation on `.add()`.
- **Proxy-based lazy resolution** — accessing `c.db` triggers resolution. No manual `.get()`.
- **Auto-built dependency graph** — the `c` passed to each factory is a tracking Proxy that records every property access. No annotations needed.
- **Singleton by default, transient opt-in** — `transient()` stamps a Symbol marker on the factory function.
- **Duck-typed lifecycle** — `onInit`/`onDestroy` checked at runtime with `hasOnInit`/`hasOnDestroy`. No base class required.
- **Constructor injection for collaborators** — Resolver receives CycleDetector + DependencyTracker. Application layer depends on IResolver interface.
- **Composition Roots** — `container-builder.ts` and `container-proxy.ts` are the only places that instantiate concrete infrastructure classes.

## Conventions

### Code Style (biome)
- 2 spaces, single quotes, trailing commas, semicolons always
- Line width: 100
- `useConst`, `useTemplate`, no `console.*` in src (allowed in tests/examples)
- `noExplicitAny` is warn (suppressed with `biome-ignore` comments where needed for generic flexibility)

### TypeScript
- `strict: true`, target ES2022, module ES2022, bundler resolution
- All `.js` extensions in imports (ESM)
- `any` used sparingly for generic constraints (`Record<string, any>` to support interfaces without index signatures) — always with biome-ignore comment explaining why

### Testing
- Vitest with globals enabled
- All tests import from `'../src/index.js'` (public API barrel) except unit tests for internal classes
- Unit tests for infrastructure: `tests/cycle-detector.test.ts`, `tests/dependency-tracker.test.ts`
- Unit tests for use cases: `tests/preloader.test.ts`, `tests/disposer.test.ts`
- Integration tests: `tests/integration.test.ts`
- Coverage thresholds: 90% statements, branches, functions, lines

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- semantic-release for automated versioning
- Branch naming: `feat/`, `fix/`, `refactor/`

### Build
- tsdown (Rolldown-based): ESM only, minified, treeshaken, sourcemaps, `.d.mts` declarations
- publint validation on build
- Only `dist/` is published (no sourcemaps in package: `!dist/*.map`)

## API Surface

The public API is defined in `src/index.ts`. Internal classes (`Resolver`, `CycleDetector`, `DependencyTracker`, `Preloader`, `Disposer`, `Introspection`) are NOT exported — they are implementation details.

Exported:
- `container()`, `ContainerBuilder` (application)
- All 7 error classes + 2 warning types (domain)
- `OnInit`, `OnDestroy` (domain, type-only)
- `Container`, `IContainer`, `ContainerGraph`, `ContainerHealth`, `ContainerWarning`, `ProviderInfo`, `ScopeOptions` (domain, type-only)
- `detectDuplicateKeys` (domain)
- `transient` (infrastructure)

## Common Patterns

### Adding a new container method
1. Add the method signature to `IContainer<T>` in `domain/types.ts`
2. Add the key to `RESERVED_KEYS` in `domain/types.ts`
3. Implement in `container-proxy.ts` methods object (or extract a new use case class)
4. Add tests through the public API

### Adding a new error type
1. Create class extending `ContainerError` in `domain/errors.ts` with `hint` and `details`
2. Add to `AnyWarning` union if it's a warning
3. Export from `src/index.ts`

### Adding a new infrastructure collaborator
1. Define interface in `domain/types.ts`
2. Implement in `infrastructure/`
3. Add to `ResolverDeps` in `resolver.ts` if the Resolver needs it
4. Inject in Composition Roots (`container-builder.ts`, `container-proxy.ts`)
