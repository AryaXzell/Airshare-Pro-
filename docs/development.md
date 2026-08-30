# AirShare Pro Development Guide

This guide provides instructions for setting up, developing, testing, and debugging AirShare Pro locally.

---

## 1. Prerequisites

- **Node.js**: Version 20.x or later (LTS recommended).
- **Package Manager**: `npm` (version 9.x or later).
- **Git**: For version control.

---

## 2. Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/aryaxzell/Airshare-Pro.git
cd Airshare-Pro

# 2. Install dependencies
npm install

# 3. Create your local environment configuration
cp .env.example .env

# 4. Start the full-stack development server
npm run dev
```

The application will start on `http://localhost:3000` with hot asset serving and backend endpoints mounted.

---

## 3. Available Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `tsx server.ts` | Launches Express server with Vite middleware in development mode. |
| `npm run build` | `vite build && esbuild server.ts ...` | Compiles client assets and bundles server to `dist/server.cjs`. |
| `npm run start` | `node dist/server.cjs` | Runs the compiled standalone server in production mode. |
| `npm run typecheck` | `tsc --noEmit` | Validates strict TypeScript types across the entire project. |
| `npm run lint` | `tsc --noEmit` | Runs codebase type and syntax validation. |
| `npm run test` | `tsx src/server/__tests__/security.test.ts` | Runs the security, sanitization, and rate limiter test suite. |
| `npm run clean` | `rm -rf dist server.js` | Removes compiled build outputs and temporary artifacts. |

---

## 4. Environment Configuration

Edit your local `.env` file to customize behavior:

```env
# Optional Catbox userhash for account-linked uploads & remote deletion
CATBOX_USERHASH=

# Max upload limit in bytes (defaults to 200MB)
MAX_UPLOAD_SIZE=209715200

# Catbox upstream request timeout (defaults to 60s)
CATBOX_TIMEOUT_MS=60000

# Sliding-window rate limit (uploads/minute/IP)
RATE_LIMIT_MAX_UPLOADS_PER_MIN=20
```

---

## 5. Development Architecture & Conventions

### 5.1 Project Layout
- `src/components/`: Modular React components grouped by functional domain (`upload`, `media-library`, `audio-player`, `video-player`, `media-preview`, `ui`).
- `src/hooks/`: Reusable React hooks (`useUpload`, `useMediaLibrary`, `useTheme`, `useToast`).
- `src/server/`: Backend modules (`api`, `security`, `storage`, `repository`).
- `src/types/`: Central TypeScript interfaces and types.

### 5.2 Code Standards
- **Zero Stub Policy**: Never write mock functions, simulated delays, or fake success stubs for real operations.
- **Strict Typing**: Do not use `any` or `@ts-ignore` to suppress compilation errors.
- **Clean Glass Design**: Use Tailwind CSS utilities adhering to Apple-inspired Clean Glass principles (subtle translucent borders, backdrop blur, strict contrast, no arbitrary neon gradients).

---

## 6. Testing & Quality Assurance

Run the automated test suite before opening any pull request:

```bash
# Run security test suite
npm run test

# Run TypeScript type check
npm run typecheck

# Run production build test
npm run build
```

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
