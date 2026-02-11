# Contributing to inwire

Thanks for your interest in contributing!

## Quick Setup

```bash
git clone https://github.com/axelhamil/inwire.git
cd inwire && pnpm install
pnpm check
```

## Development Commands

| Command         | What it does                    |
| --------------- | ------------------------------- |
| `pnpm check`    | Lint + typecheck (run this first)|
| `pnpm test`     | Run all tests                   |
| `pnpm build`    | Build the package               |
| `pnpm lint:fix` | Auto-fix lint issues            |

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) — this drives automated releases.

```
feat: add support for async factories
fix: resolve circular dependency detection
docs: update API examples
```

That's it. `feat` bumps minor, `fix` bumps patch, `docs` doesn't release.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm check` and `pnpm test`
4. Open a PR against `main`

Biome handles all formatting and linting automatically — no style guide to memorize.
