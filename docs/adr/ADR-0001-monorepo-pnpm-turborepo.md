# ADR-0001: Monorepo with pnpm + Turborepo

**Date:** 2026-10-14  
**Status:** Accepted  
**Deciders:** LumenFlow core team

---

## Context

LumenFlow consists of a Next.js web app, a NestJS API, a BullMQ worker service, and several shared packages (shared-types, stellar helpers, quote engine, bridge adapters, anchor client, UI components, and shared configs). All of these share types, utilities, and configuration but are deployed independently.

We needed a monorepo toolchain that:

1. Handles inter-package dependencies and build ordering automatically.
2. Supports incremental builds and caching to keep CI fast.
3. Is well-supported by the Node/TypeScript ecosystem.
4. Is easy for new contributors to set up.

## Decision

We chose **pnpm workspaces** for package management and **Turborepo** as the build orchestration layer.

- **pnpm** provides workspace support with strict dependency isolation (no phantom dependencies), content-addressable storage (fast installs, small disk footprint), and a `workspace:*` protocol for local package references.
- **Turborepo** provides task pipelines with dependency-aware execution, remote caching, and affected-only execution in CI. Configuration lives in a single `turbo.json` at the repo root.

## Alternatives Considered

| Tool | Reason not chosen |
|---|---|
| npm workspaces | Slower installs, no content-addressable store, less mature workspace support |
| Yarn workspaces + Nx | Nx is powerful but adds significant complexity; team is more familiar with Turborepo |
| Lerna | Largely superseded by Turborepo for build orchestration |
| Single-package repo | Would not scale to multiple deployable services with shared logic |

## Consequences

- All contributors must use **pnpm ≥ 9** (enforced in `package.json` `engines` field).
- Local package references use `workspace:*` in `package.json`; Turborepo resolves build order automatically.
- The `turbo.json` `tasks` configuration must be updated when new task types are introduced.
- Remote caching (Turborepo Cloud or self-hosted) can be enabled later by setting `TURBO_TOKEN` and `TURBO_TEAM` in CI without code changes.

## References

- [Turborepo documentation](https://turbo.build/repo/docs)
- [pnpm workspaces](https://pnpm.io/workspaces)
- README.md — "Monorepo Structure" and "Tech Stack" sections
