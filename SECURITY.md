# Security Policy

## Supported Versions

Security updates and patches are applied to the active mainline version of AirShare Pro.

| Version | Supported          |
| ------- | ------------------ |
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

- **Server-Side Credential Isolation**: Sensitive credentials such as `CATBOX_USERHASH` are strictly confined to Node.js server runtime memory and never sent to client bundles.
- **Strict File & Magic Bytes Validation**: Uploaded buffers are inspected for known media magic bytes (JPEG, PNG, WebP, MP4, MP3, FLAC, OGG, WAV, etc.) to prevent executable polyglots and disguised binaries.
- **Rate Limiting**: Sliding window IP-based rate limiting defends upload and media endpoints from automated abuse.
- **Security Headers**: Comprehensive Content-Security-Policy (CSP), nosniff, Referrer-Policy, and restricted Permissions-Policy are enforced on every response.
- **Sanitized Logging**: All server logs and error messages scrub credentials and sensitive parameters prior to output.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
