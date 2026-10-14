# Security Policy

## Supported Versions

LumenFlow is currently in active development on Stellar Testnet. No production version exists yet. Security fixes are applied to the `main` branch.

## Reporting a Vulnerability

**Please do NOT open public GitHub issues for security vulnerabilities.**

Email **security@your-domain.com** with:

1. A clear description of the vulnerability.
2. Steps to reproduce (proof-of-concept if possible).
3. The potential impact and affected component(s).
4. Any suggested mitigations.

We aim to acknowledge reports within **48 hours** and will keep you informed of our progress.

## Disclosure Policy

- We follow coordinated disclosure. Please give us reasonable time to fix the issue before publishing details.
- We will credit researchers in release notes unless they prefer to remain anonymous.
- A bug bounty program may be added once the project reaches a public release.

## Scope

In scope:
- Authentication and session handling
- Webhook signature verification
- Quote manipulation or replay attacks
- Order state machine bypass
- Any issue that could lead to loss of user funds or data

Out of scope:
- Issues in upstream dependencies (report those to the dependency maintainer)
- Theoretical vulnerabilities without a proof of concept
- Social engineering attacks

## Key Security Properties

LumenFlow is non-custodial by design. The backend **never** handles or stores user private keys. Transactions are built server-side and signed exclusively in the user's wallet. Any finding that violates this property is critical severity.
