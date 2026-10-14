# Contributing to LumenFlow

Thank you for your interest in contributing! Please read this guide before opening issues or pull requests.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

## Getting Started

1. **Fork** the repository and clone your fork.
2. Follow the [local setup guide](./docs/local-setup.md) to get the project running.
3. Look for issues labelled `good first issue` or `help wanted`.

## Development Workflow

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Run migrations
pnpm --filter api db:migrate

# Start everything
pnpm dev
```

## Conventions

| Convention | Rule |
|---|---|
| **Commits** | [Conventional Commits](https://www.conventionalcommits.org/) – `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:` |
| **TypeScript** | Strict mode; no `any`; Zod at every boundary |
| **Packages** | Shared logic lives in `/packages`, not duplicated across apps |
| **Providers** | New bridge/anchor/KYC/payout providers must implement the adapter interface and include tests |
| **Secrets** | Never commit `.env` files, private keys, or real user data |
| **Docs** | Update or add docs for any user-facing or architectural change |
| **Tests** | Every new feature or bug fix ships with tests; target ≥ 80% coverage on domain logic |

## Pull Request Process

1. Create a branch: `git checkout -b feat/your-feature` (or `fix/`, `docs/`, etc.).
2. Make your changes following the conventions above.
3. Run `pnpm lint && pnpm typecheck && pnpm test` and ensure they all pass.
4. Open a pull request describing **what** changed, **why**, and linking any related issue.
5. At least one review approval is required before merging.
6. Squash-merge into `main`.

## Adding a New Provider Adapter

See [docs/providers.md](./docs/providers.md) for a step-by-step guide on adding bridge, anchor, KYC, or payout adapters.

## Questions?

Open a [GitHub Discussion](https://github.com/your-org/lumenflow/discussions) or comment on an existing issue.
