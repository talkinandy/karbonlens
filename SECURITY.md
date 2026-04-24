# Security Policy

## Supported Versions

KarbonLens is actively developed and only the latest `main` branch
receives security fixes. We do not backport to prior tags at this stage.

## Reporting a Vulnerability

If you discover a security issue, please **do not** open a public GitHub
issue. Instead, email **security@karbonlens.com** with:

- A description of the issue and its impact.
- Steps to reproduce (or a proof-of-concept, if you have one).
- The commit or version you tested against.
- Your name or handle, if you would like credit in the fix commit or
  release notes.

You should receive an acknowledgement within **72 hours**. We aim to
provide a fix or mitigation plan within **14 days** for confirmed
high-severity issues, and within **30 days** for others.

Please do not disclose the issue publicly until we have released a fix
and agreed a disclosure timeline with you. Coordinated disclosure keeps
users safe; we will credit reporters who follow this process.

## Scope

In scope:

- This repository's application code, API routes, authentication flow,
  and SQL layer.
- The public production site at `karbonlens.com`.

Out of scope:

- Denial-of-service tests against the production site.
- Issues in upstream third-party services (Verra, Gold Standard, Google
  OAuth, Sentry, Resend, etc.). Report those to the relevant vendor.
- Social-engineering attacks against contributors or staff.

## Safe-harbour

Good-faith security research under this policy will not result in legal
action from the KarbonLens project. Please use test accounts where
possible, avoid accessing other users' data, and stop immediately if you
encounter personal information.
