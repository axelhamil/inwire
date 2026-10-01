# [4.0.0](https://github.com/axelhamil/inwire/compare/v3.1.3...v4.0.0) (2026-10-01)


* feat!: refuse access to a disposed binding and allow a targeted dispose ([8dcf9a7](https://github.com/axelhamil/inwire/commit/8dcf9a71a8e92070bf734b6882bbe33047fd1686))
* feat!: reject modules whose prerequisites the host lacks at compile time ([f40f9ee](https://github.com/axelhamil/inwire/commit/f40f9eefd12937fa03acbba046e4c22e8c284a87))


### Bug Fixes

* **errors:** point DuplicateKeyError to builder override() ([d5ee8b1](https://github.com/axelhamil/inwire/commit/d5ee8b1c3202b49930ec09ad4ea0b519f60303f2))
* let teardown hooks drain work that reads cached bindings ([d864381](https://github.com/axelhamil/inwire/commit/d86438165dd844daaf7677ba69e96dbb25c90e52))
* **types:** reject a bare function in override() for a function binding ([a649f8b](https://github.com/axelhamil/inwire/commit/a649f8b68d9d122039690914e722861c6218c816))
* **types:** type a key overridden by container.module() with its new value ([37bc765](https://github.com/axelhamil/inwire/commit/37bc765f2f119d94065e77dda3db624e6a855485))


### Features

* bound each teardown hook with a disposeTimeout ([0e22470](https://github.com/axelhamil/inwire/commit/0e22470570477d444ddd376fe43f500410521441))
* declare a dispose hook per binding and dispose eager instances ([b729675](https://github.com/axelhamil/inwire/commit/b72967519b577cedc454142e1089636c2e3ced9b))
* override a binding on the builder so every dependent receives it ([96768f8](https://github.com/axelhamil/inwire/commit/96768f80d2513816795aaf55c615e7b6ea3b7b4f))
* **types:** let a container be assigned to Record<string, unknown> ([35e017a](https://github.com/axelhamil/inwire/commit/35e017a1e3230fbc4f904849a5231cf5fd9fda40))


### BREAKING CHANGES

* a container is single use after `dispose()`. Reading a
binding, iterating or calling `preload()` throws ContainerDisposedError
instead of recreating instances. Build a new container (or a new scope) when
you need fresh instances, and use `reset()` to drop cached singletons without
tearing them down.
* `addModule()` rejects at compile time a local-mode module
(`defineModule<TDeps>()`) whose prerequisites are not already on the builder.
Add the prerequisites first, or provide them from an earlier module. The host
type no longer gains the module's `TDeps`: a key that only the module declared
as a prerequisite is no longer visible on the built container.

## [3.1.3](https://github.com/axelhamil/inwire/compare/v3.1.2...v3.1.3) (2026-08-05)

## [3.1.2](https://github.com/axelhamil/inwire/compare/v3.1.1...v3.1.2) (2026-08-05)

## [3.1.1](https://github.com/axelhamil/inwire/compare/v3.1.0...v3.1.1) (2026-08-05)

# [3.1.0](https://github.com/axelhamil/inwire/compare/v3.0.0...v3.1.0) (2026-08-05)


### Bug Fixes

* **container:** align own-key traps with introspection, detect well-known symbols ([f89f620](https://github.com/axelhamil/inwire/commit/f89f62072731c99372668c4845711a29108dc754))
* **errors:** always raise a ContainerError, never a raw throw ([642a752](https://github.com/axelhamil/inwire/commit/642a752c99b15004d619318ee8796ec3f071e3d0))
* **graph:** dedupe tracked dependencies ([94606d9](https://github.com/axelhamil/inwire/commit/94606d98960fd01c6818f1091f6fc635df30ed98))
* **lifecycle:** run onDestroy once per instance across extend() ([ed534da](https://github.com/axelhamil/inwire/commit/ed534dac6440d45ff9d59fac224e2c4f6e320a59))


### Features

* **container:** expose similarityThreshold via ContainerOptions ([8b843e5](https://github.com/axelhamil/inwire/commit/8b843e57177f6833c2b9e115fcc1774cb40cfd9a))

# [3.0.0](https://github.com/axelhamil/inwire/compare/v2.4.0...v3.0.0) (2026-05-26)


* feat!: throw on duplicate keys, add toJSON/size/iterator, configurable fuzzy threshold ([828c0b6](https://github.com/axelhamil/inwire/commit/828c0b61812f5bbabb863307118c6fec10c77696)), closes [#3](https://github.com/axelhamil/inwire/issues/3) [#5](https://github.com/axelhamil/inwire/issues/5) [#6](https://github.com/axelhamil/inwire/issues/6) [#7](https://github.com/axelhamil/inwire/issues/7) [#8](https://github.com/axelhamil/inwire/issues/8) [#9](https://github.com/axelhamil/inwire/issues/9) [#11](https://github.com/axelhamil/inwire/issues/11) [#12](https://github.com/axelhamil/inwire/issues/12) [#19](https://github.com/axelhamil/inwire/issues/19) [#7](https://github.com/axelhamil/inwire/issues/7) [#6](https://github.com/axelhamil/inwire/issues/6) [#12](https://github.com/axelhamil/inwire/issues/12) [#8](https://github.com/axelhamil/inwire/issues/8) [#9](https://github.com/axelhamil/inwire/issues/9) [#3](https://github.com/axelhamil/inwire/issues/3)


### BREAKING CHANGES

* `detectDuplicateKeys` removed from the public API.
`.add()` and `.addTransient()` now throw `DuplicateKeyError` when a key is
already registered — silent overwrites are gone. Use `.extend()` or `.scope()`
on a built container for intentional overrides.

# [2.4.0](https://github.com/axelhamil/inwire/compare/v2.3.2...v2.4.0) (2026-05-26)


### Features

* ES2023 asyncDispose, clean-arch refactor, doc realignment ([4782ad2](https://github.com/axelhamil/inwire/commit/4782ad2ba7a3f15ed21cba0eac574eda9399d87f))

## [2.3.2](https://github.com/axelhamil/inwire/compare/v2.3.1...v2.3.2) (2026-05-07)

## [2.3.1](https://github.com/axelhamil/inwire/compare/v2.3.0...v2.3.1) (2026-05-02)


### Bug Fixes

* **typing:** addModule rejected non-empty AppDeps; .add() collapsed dup keys to never ([a52bcb1](https://github.com/axelhamil/inwire/commit/a52bcb1cbd927ce5b418374131c83f7fb20e0cbc))

# [2.3.0](https://github.com/axelhamil/inwire/compare/v2.2.1...v2.3.0) (2026-05-02)


### Features

* **typing:** cross-module forward refs via augmentable AppDeps interface ([b4ac943](https://github.com/axelhamil/inwire/commit/b4ac9432982cff11ae7fb837f9783dbcc489f7ea))

## [2.2.1](https://github.com/axelhamil/inwire/compare/v2.2.0...v2.2.1) (2026-05-02)


### Bug Fixes

* **typing:** preserve accumulated TBuilt across chained addModule() ([fcc4820](https://github.com/axelhamil/inwire/commit/fcc4820f0b33344f1523facd85bd01c79c83ad28))

# [2.2.0](https://github.com/axelhamil/inwire/compare/v2.1.7...v2.2.0) (2026-05-02)


### Bug Fixes

* **typing:** preserve T in IContainer.module() return type ([b86a62b](https://github.com/axelhamil/inwire/commit/b86a62bb84d1c8ca521eb710f32f8a501cc2f844))


### Features

* **api:** add defineModule helper and export Factory type ([f34b52c](https://github.com/axelhamil/inwire/commit/f34b52ca3ed0562b2d539fc014753a16567be6ea))
* **builder:** add .merge() to fuse standalone builders ([08b3e99](https://github.com/axelhamil/inwire/commit/08b3e997dbaa1848dd61586ce652e0a860acdfdc))

## [2.1.7](https://github.com/axelhamil/inwire/compare/v2.1.6...v2.1.7) (2026-02-19)


### Bug Fixes

* upgrade all devDependencies to latest versions ([e43e832](https://github.com/axelhamil/inwire/commit/e43e8328666d2ae248d49f77c775b3ec2c196f6d))

## [2.1.6](https://github.com/axelhamil/inwire/compare/v2.1.5...v2.1.6) (2026-02-19)


### Bug Fixes

* remove unnecessary hash option for tsdown v0.20 ([17a71b0](https://github.com/axelhamil/inwire/commit/17a71b076a2553b17ea2501b7f10c66d64dc46b3))

## [2.1.5](https://github.com/axelhamil/inwire/compare/v2.1.4...v2.1.5) (2026-02-19)


### Bug Fixes

* disable hash in tsdown output filenames ([eede35f](https://github.com/axelhamil/inwire/commit/eede35f33c0b06f5063eb2b8873299ca228f696e))

## [2.1.4](https://github.com/axelhamil/inwire/compare/v2.1.3...v2.1.4) (2026-02-19)


### Bug Fixes

* restore @semantic-release/git and use PAT for release ([98f92d2](https://github.com/axelhamil/inwire/commit/98f92d2852e02707275862e011eeb874c8f73d1c))

## [2.1.2](https://github.com/axelhamil/inwire/compare/v2.1.1...v2.1.2) (2026-02-18)


### Bug Fixes

* relax generic constraints to support interfaces without index signatures ([#1](https://github.com/axelhamil/inwire/issues/1)) ([ca98778](https://github.com/axelhamil/inwire/commit/ca987785b500ead5e33893cda08c3d2b473edd3b))

## [2.1.1](https://github.com/axelhamil/inwire/compare/v2.1.0...v2.1.1) (2026-02-11)


### Bug Fixes

* include README in published package ([bba30d8](https://github.com/axelhamil/inwire/commit/bba30d88fca3f5dfda37ceac3e8e514e60ad3801))

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
