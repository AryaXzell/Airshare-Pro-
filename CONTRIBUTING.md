# Contributing to AirShare Pro

Thank you for your interest in AirShare Pro.

## Repository Status

AirShare Pro is a **proprietary and closed-source** software project owned by AryaXzell.

Because of its proprietary nature:

1. **Restricted Contributions**: External pull requests and code submissions are **not automatically accepted or merged**.
2. **No Default Licensing Grant**: Submitting issues, feature suggestions, or pull requests to this repository does not grant any permission to copy, modify, sublicense, distribute, or create derivative works of AirShare Pro.
3. **Issue Submissions**: If you encounter bugs or operational anomalies, feel free to open a concise issue using the repository's issue tracker. Please ensure that no sensitive credentials, private tokens, or personal information are included in public issue tickets.

---

## Development Standards (Internal / Maintainer Reference)

For authorized maintainers working on this codebase:

- **Audit Before Modifying**: Inspect existing architecture and dependencies prior to introducing changes.
- **Dependency & Lockfile Sync**: Always ensure `package-lock.json` is perfectly synchronized with `package.json` by running `npm install` and verifying with `npm ci` locally prior to push.
- **Type Safety**: Maintain strict TypeScript compliance (`npm run typecheck`). Avoid `@ts-ignore` or arbitrary `any` types.
- **Testing**: Ensure all security and regression assertions pass (`npm run test`).
- **No Hardcoded Secrets**: Never commit `.env` files, API keys, or provider userhashes.
- **Zero Mock / Zero Stub Policy**: Do not introduce simulated or fake APIs that pretend to function without real implementation.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
