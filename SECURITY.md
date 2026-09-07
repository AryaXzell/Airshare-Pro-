# Security Policy

## Supported Versions

Security updates and patches are applied to the active mainline version of AirShare Pro.

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

We take the security of AirShare Pro and its users seriously. If you believe you have found a security vulnerability in this application, please report it responsibly.

### How to Report

1. **Private Reporting**: Please use GitHub's private vulnerability reporting feature on the repository:  
   Navigate to **Security** > **Advisories** > **Report a vulnerability**.
2. **Alternative Contact**: If private vulnerability reporting is unavailable, reach out directly to the maintainer via private communication channels before any public disclosure.

### What to Include

To help us triage and resolve the issue quickly, please provide:

- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or a minimal Proof of Concept (PoC) to reproduce the behavior.
- Affected endpoints, parameters, or components.
- Any suggested mitigations or patches if available.

### What NOT to Do

- **DO NOT** create public GitHub issues or public pull requests disclosing unpatched security vulnerabilities.
- **DO NOT** attempt to access, modify, or delete user data or third-party provider accounts (e.g. Catbox upstream services).
- **DO NOT** execute denial-of-service (DoS) or resource exhaustion attacks against live production services.

---

## Security Architecture Highlights

AirShare Pro enforces multiple defense-in-depth measures:

- **Session-Scoped Anonymous Privacy**: Every visitor is assigned a unique cryptographic session identifier stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie (`airshare_session`). All media repository operations (`list`, `get`, `delete`, `clearAll`) are strictly isolated to the caller's session ID on the server (via Upstash Redis in production or memory-bounded repository in development), preventing cross-tenant access or unauthorized deletion. Public share endpoints (`/s/:id`) strictly query via `getByIdPublic()` to return sanitized `PublicMediaView` projections without exposing session ownership metadata.
- **Distributed Rate Limiting**: Sliding-window IP rate limiting is backed by Upstash Redis in production using atomic pipeline operations (`INCR` + `EXPIRE`), guaranteeing consistent enforcement across distributed serverless lambda instances. A bounded in-memory rate limiter acts as an automatic zero-config fallback for local development.
- **Strict File & Magic Bytes Validation**: Uploaded buffers undergo two-tier inspection. Filenames are strictly sanitized to block directory traversal, null bytes, and dangerous shell characters. Buffers are verified against known media magic byte signatures (JPEG, PNG, WebP, GIF, MP4, WebM, MP3, FLAC, OGG, WAV). The server unconditionally blocks DOS/PE executables (`MZ` / `4d5a`), Linux ELF binaries (`7f454c46`), and ZIP/APK/JAR archive signatures (`504b0304`) attempting to masquerade as media files. Banned executable and script extensions are checked uniformly via shared validation logic.
- **Server-Side Credential Isolation**: Sensitive credentials such as `CATBOX_USERHASH`, `UPSTASH_REDIS_REST_TOKEN`, and `GEMINI_API_KEY` are strictly confined to Node.js server runtime memory and never leaked into client bundles or browser responses.
- **Security Headers & CSP**: Comprehensive Content-Security-Policy (CSP) with restrictive `frame-ancestors 'self'`, no third-party CDN leaks, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, and Strict-Transport-Security (HSTS) in production.
- **Sanitized Logging**: All server logs and error messages scrub credentials, upstream API hashes, and sensitive parameters prior to terminal output.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
