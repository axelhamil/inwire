# [2.1.0](https://github.com/axelhamil/inwire/compare/v2.0.0...v2.1.0) (2026-02-11)


### Features

* harden error handling, lifecycle resilience + 62 new tests ([d5365d7](https://github.com/axelhamil/inwire/commit/d5365d7c3db47f7890641345514ad2964e5bb81d))

# [2.0.0](https://github.com/axelhamil/inwire/compare/v1.2.0...v2.0.0) (2026-02-10)


* feat!: parallel preload with topological sort + await onInit ([db931ac](https://github.com/axelhamil/inwire/commit/db931ac667c8702b9be98f4e7e65090e2f6e07a9))


### BREAKING CHANGES

* preload() now propagates onInit() errors instead
of swallowing them — this matches the documented behavior.

Also removes dead code (transientKeys, DepsDefinition, ResolvedDeps)
and strips non-doc comments.

# [1.2.0](https://github.com/axelhamil/inwire/compare/v1.1.0...v1.2.0) (2026-02-10)


### Bug Fixes

* **ci:** regenerate pnpm-lock.yaml with biome dependency ([e29ce21](https://github.com/axelhamil/inwire/commit/e29ce21e5e7a46f2ecabd9f0034fe31c55710536))
* **lint:** resolve all Biome warnings and format errors ([b48438d](https://github.com/axelhamil/inwire/commit/b48438df5154639d615a4b527d81b4c69fbcbaa9))


### Features

* add Biome linter/formatter + revamp CI pipeline ([d4cef08](https://github.com/axelhamil/inwire/commit/d4cef08274de9ffe27380db49c539f91f3a4d1e2))
* switch to pnpm + add "Why inwire?" section + remove benchmarks ([672eb74](https://github.com/axelhamil/inwire/commit/672eb74a0ee437630521c05cf83a308dda25618c))

# [1.1.0](https://github.com/axelhamil/inwire/compare/v1.0.3...v1.1.0) (2026-02-10)


### Bug Fixes

* **types:** replace all any with unknown across internal and public API ([296b3f5](https://github.com/axelhamil/inwire/commit/296b3f5ef4186ddcf0e2bdc3b6ad35c2ae492343))


### Features

* add module() post-build composition + architecture refactor ([5c5a66f](https://github.com/axelhamil/inwire/commit/5c5a66f4ba2f1b448d44dfbb85f5547f6a16bbd3))

## [1.0.3](https://github.com/axelhamil/inwire/compare/v1.0.2...v1.0.3) (2026-02-10)


### Bug Fixes

* **types:** audit fixes — override typing, dead code, redundant casts, type tests ([137d102](https://github.com/axelhamil/inwire/commit/137d1024f4f846de7fa4b1696f4a8614c2148770))

## [1.0.2](https://github.com/axelhamil/inwire/compare/v1.0.1...v1.0.2) (2026-02-10)


### Bug Fixes

* **types:** eliminate unnecessary `any` casts and tighten type safety ([8be0997](https://github.com/axelhamil/inwire/commit/8be0997446be0f3461a75183fc1ed867ae48b0c4))

## [1.0.1](https://github.com/axelhamil/inwire/compare/v1.0.0...v1.0.1) (2026-02-10)


### Performance Improvements

* optimize build — ESM-only, minify, treeshake, exclude sourcemaps (194kB → 38kB) ([3a04835](https://github.com/axelhamil/inwire/commit/3a04835b9a3c1d52ad6bad83712e34b5fb0cc8c9))

# 1.0.0 (2026-02-10)


### Features

* add preload all, named scopes, and reset ([79a8e60](https://github.com/axelhamil/inwire/commit/79a8e6049fd7848e4411283f9850bf8550218035))
* initial release — AI-first DI container for TypeScript ([41ef8e8](https://github.com/axelhamil/inwire/commit/41ef8e8e5358c91720bb139f0f3752af58a63b4c))
* initial release as inwire ([5d6b099](https://github.com/axelhamil/inwire/commit/5d6b099388ef4b3f10fd90026729fec12154ce30))

# 1.0.0 (2026-02-10)


### Features

* add preload all, named scopes, and reset ([79a8e60](https://github.com/axelhamil/inwire/commit/79a8e6049fd7848e4411283f9850bf8550218035))
* initial release — AI-first DI container for TypeScript ([41ef8e8](https://github.com/axelhamil/inwire/commit/41ef8e8e5358c91720bb139f0f3752af58a63b4c))
