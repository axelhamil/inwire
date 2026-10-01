# Contributing to inwire

Thanks for your interest in contributing!

## Quick Setup

```bash
git clone https://github.com/axelhamil/inwire.git
cd inwire && pnpm install
pnpm check
```

## Development Commands

| Command           | What it does                                                   |
| ----------------- | -------------------------------------------------------------- |
| `pnpm check`      | Lint, typecheck, docs snippets check, tests with coverage      |
| `pnpm test`       | Run all tests (runtime and type assertions)                    |
| `pnpm test:bun`   | Run the runtime tests under Bun                                |
| `pnpm check:docs` | Type-check every snippet of README.md, llms.txt, llms-full.txt |
| `pnpm build`      | Build the package                                              |
| `pnpm lint:fix`   | Auto-fix lint issues                                           |

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/): they drive automated releases.

```
feat: add support for async factories
fix: resolve circular dependency detection
docs: update API examples
```

`feat` bumps minor, `fix` bumps patch, `feat!` or a `BREAKING CHANGE:` footer bumps major, `docs` does not release (except `docs(readme)`, a patch). Never set a version by hand.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm check`. A change to the public API updates README.md, llms.txt, llms-full.txt and the examples in the same PR
4. Open a PR against `main`

Biome handles formatting and linting: no style guide to memorize.
