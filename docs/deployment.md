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
| `UPSTASH_REDIS_REST_URL` | Optional | `""` | Upstash Redis REST URL for multi-instance session state and distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | `""` | Upstash Redis REST Token for authenticated Redis commands. |

---

## 3. Vercel Serverless Deployment Architecture

AirShare Pro deploys seamlessly to Vercel as a hybrid application (Vite SPA frontend + Express Serverless Function API):

- **Serverless Build Entrypoint (`src/server/vercel.ts` -> `api/index.js`)**:
  - Exposes the shared Express application (`src/server/app.ts`) as a single unified Vercel Serverless Function handler.
  - Configured with `export const config = { api: { bodyParser: false } }` to pass raw multipart streams directly into Multer without body parser corruption.
- **Routing & Function Configuration (`vercel.json`)**:
  - `functions: { "api/index.js": { "maxDuration": 60 } }` grants up to 60 seconds of execution time for processing large uploads.
  - `rewrites: [{ "source": "/api/(.*)", "destination": "/api" }, { "source": "/s/(.*)", "destination": "/api" }]` routes all API requests and public share landing pages directly to `api/index.js`.
  - Non-API routes are automatically resolved by Vercel to static files compiled in `dist/` by Vite (`npm run build`).

### Serverless Operational Considerations:
1. **Payload Limits & Streaming**: Vercel Serverless Functions configure `bodyParser: false` in `src/server/vercel.ts`, allowing Multer to ingest the raw incoming multipart stream directly. Combined with `maxDuration: 60`, uploads up to the configured `MAX_UPLOAD_SIZE` are smoothly ingested and forwarded to Catbox.
2. **Distributed Persistence (Implemented)**: AirShare Pro implements production state persistence via **Upstash Redis** (`UpstashMediaRepository`). When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, media metadata is persistently stored across serverless cold starts and scoped strictly per anonymous session. If these variables are not configured, the application falls back automatically to an in-memory repository.
3. **Distributed Rate Limiting (Implemented)**: Distributed sliding-window rate limiting is natively supported via `RedisRateLimiter` using atomic Redis pipelines (`INCR` + `EXPIRE`). This ensures consistent quota enforcement across concurrent serverless lambda instances. If Upstash is not configured, the server falls back to an in-memory sliding window limiter.

---

## 4. Setting Up Upstash Redis

Upstash Redis is recommended for production deployments to guarantee persistent session history and synchronized rate limiting across Vercel serverless lambdas:

1. **Create Database**: Go to [console.upstash.com](https://console.upstash.com) and create a new Redis database (free tier is fully sufficient).
2. **Retrieve REST Credentials**: Under the database details page, scroll to the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. **Configure Environment Variables**:
   - In your Vercel project dashboard, navigate to **Settings** > **Environment Variables**.
   - Add both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the **Production** and **Preview** environments.
4. **Deploy / Redeploy**:
   - Trigger a new deployment on Vercel so the serverless function loads the new credentials. The health check (`/api/health`) will continue to show healthy, and media metadata will now persist across cold starts.

---

## 5. SEO & Search Console Setup

AirShare Pro is pre-configured with SEO assets in `public/` (copied directly to `dist/` during build):

- **Robots Policy (`robots.txt`)**: Allows search engine crawlers to discover public assets and index public share landing routes (`/s/*`), while preventing crawling of internal API paths (`/api/*`).
- **Sitemap Index (`sitemap.xml`)**: Declares primary entry points and provides canonical structure for web indexers.
- **Dynamic Open Graph & Twitter Cards**: Public share links (`/s/:id`) are server-side rendered with rich metadata tags (`og:title`, `og:image`, `og:video`, `og:audio`, `twitter:card`). Social crawlers (WhatsApp, Telegram, Discord, Twitter/X, iMessage) generate immediate rich visual embeds without executing client JavaScript.

### Submitting to Google Search Console:
1. Open [Google Search Console](https://search.google.com/search-console).
2. Add and verify your production domain (URL Prefix or Domain verification).
3. Navigate to **Sitemaps** in the sidebar.
4. Enter `sitemap.xml` and click **Submit**. Google will process the file and index your application's public routes.

---

## 6. Telegram Bot Admin Control Setup

AirShare Pro supports remote administration via a private Telegram bot with two-step confirmations for destructive actions and automatic push alerts for security/traffic anomalies.

### 6.1 Creating the Telegram Bot:
1. Open Telegram and chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, enter a friendly name (e.g. `AirShare Pro Admin`) and a unique username ending in `bot`.
3. Copy the HTTP API token provided by BotFather (`TELEGRAM_BOT_TOKEN`).

### 6.2 Getting Your Telegram User ID:
1. Open Telegram and chat with [@userinfobot](https://t.me/userinfobot).
2. The bot will reply with your numerical User ID (`Id: 123456789`).
3. Set this value in `TELEGRAM_ADMIN_USER_IDS` (comma-separated if multiple admins).

### 6.3 Environment Variables:
- `TELEGRAM_BOT_TOKEN`: The API token from BotFather.
- `TELEGRAM_ADMIN_USER_IDS`: Comma-separated allowed Telegram user IDs (e.g. `123456789,987654321`).
- `TELEGRAM_WEBHOOK_SECRET`: A long random secret string (e.g., `openssl rand -hex 32`) for verifying the `X-Telegram-Bot-Api-Secret-Token` header.

*Note: If either `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ADMIN_USER_IDS` is unset, the bot is completely disabled.*

### 6.4 Registering the Webhook:
After deployment, configure the webhook using the setup endpoint or curl:
```bash
curl -F "url=https://airshare-pro.vercel.app/api/telegram/webhook" \
     -F "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```
Or execute the automated setup from the web admin panel: `POST /{ADMIN_PANEL_PATH}/api/telegram-setup`.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*

