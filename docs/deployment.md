# AirShare Pro Deployment Guide

AirShare Pro is designed to run as a Node.js full-stack service with standalone compiled output, or containerized within Docker / Cloud Run.

---

## 1. Container & Server Deployment (Standard Node.js / Cloud Run / Docker)

### 1.1 Production Build Pipeline
The production build compiles both client assets and server bundle into a standalone, optimized distribution in `dist/`:

```bash
# 1. Install dependencies
npm ci

# 2. Build production assets & standalone CommonJS server
npm run build

# 3. Start standalone server
npm start
```

### 1.2 Build Output Layout
- `dist/index.html`: Optimized HTML entry point with preconnected font origins.
- `dist/assets/`: Code-split, hashed CSS and JS bundles (served with `immutable, maxAge: 1y` headers).
- `dist/server.cjs`: Self-contained Node.js server bundle with externalized npm modules and sourcemaps.

### 1.3 Dockerfile Reference
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

---

## 2. Environment Variables in Production

Ensure the following variables are configured in your deployment platform:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Enables production optimizations and CSP modes. |
| `PORT` | Optional | `3000` | Port for the Express server to bind to `0.0.0.0`. |
| `CATBOX_USERHASH` | Optional | `""` | Userhash from Catbox.moe for account-linked storage & file deletion. |
| `MAX_UPLOAD_SIZE` | Optional | `209715200` | Max file upload limit in bytes (200MB). |
| `CATBOX_TIMEOUT_MS` | Optional | `60000` | Timeout for Catbox upstream requests (60s). |
| `RATE_LIMIT_MAX_UPLOADS_PER_MIN` | Optional | `20` | Max upload attempts per IP per minute. |

---

## 3. Vercel Serverless Functions Deployment

AirShare Pro includes native root `/api` Serverless Functions configured for Vercel deployment:

- **Root `/api` Functions**:
  - `/api/health.ts` : Health check and provider verification.
  - `/api/media/upload.ts` : File upload handler (with `bodyParser: false` for direct multipart streaming).
  - `/api/media/config.ts` : Client configuration metadata.
  - `/api/media/index.ts` : Media listing and batch deletion.
  - `/api/media/[id].ts` : Individual media retrieval and deletion.
  - `/api/[...path].ts` & `/api/index.ts` : Catch-all routing fallback.
- **Frontend SPA Routing**: `vercel.json` ensures `/api/*` routes are handled by Serverless Functions while all client-side routes fallback to `dist/index.html`.

### Serverless Considerations:
- **Payload Limits**: Note that Vercel Serverless Functions on the Hobby tier impose a 4.5MB request body limit (Pro tier: up to 50MB). For unconstrained 200MB large file uploads, container runtime hosting (Cloud Run, Docker, VPS) is recommended.
- **In-Memory Rate Limiter**: The built-in rate limiter uses in-memory sliding windows. For multi-instance horizontal scaling, connect the `RateLimiter` interface to an external Redis instance (e.g. Upstash).

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
