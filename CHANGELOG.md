# Changelog

All notable changes to AirShare Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] - 2026-09-04

### Added
- **Session-Scoped Anonymous Privacy**: Introduced cookie-based (`httpOnly`, `Secure`, `SameSite=Strict`, 1-year persistence) anonymous session scoping (`sessionMiddleware`). Media repository queries (`list`, `get`, `delete`, `clearAll`) are strictly isolated per user session to prevent cross-tenant data leaks.
- **Distributed State & Rate Limiting via Upstash Redis**:
  - `UpstashMediaRepository` with Redis pipeline persistence for production serverless execution.
  - `RedisRateLimiter` utilizing atomic Redis pipelines (`INCR` + `EXPIRE`) for synchronized rate limits across stateless serverless lambdas.
  - Automatic zero-config fallback to bounded in-memory repository and sliding-window rate limiter for local development.
- **Progressive Web App (PWA) & Offline Shell**:
  - Service Worker integration powered by `vite-plugin-pwa` and Workbox caching the offline app shell and visual assets.
  - Strict `NetworkOnly` routing strategy with `navigateFallbackDenylist` for `/api/*` and `/s/*` routes to avoid stale or intercepted media API responses.
  - Responsive online/offline network connectivity toast notifications.
  - In-app custom install prompt modal and action button ("Pasang Aplikasi") handling the `beforeinstallprompt` event.
- **Dynamic Share Landing Page (`/s/:id`)**:
  - Dedicated public share route with server-side rendered HTML and dynamic Open Graph / Twitter Card tags (images, audio, video).
  - Public repository projection (`getByIdPublic`) serving sanitized `PublicMediaView` records without exposing owner session identifiers.
- **QR Code Generator Modal**:
  - Seamless QR code modal generator (`qrcode`) for instant mobile media access, supporting one-click clipboard copying of the QR image and direct PNG file downloading.
- **Clipboard Paste-to-Upload**:
  - Global `paste` event listener enabling instant `Ctrl+V` / `Cmd+V` upload of image and audio buffers directly from the clipboard.
- **MediaSession API Integration**:
  - Full hardware and OS-level lock screen media integration (`navigator.mediaSession`) for audio and video playback, complete with track artwork, title, artist, and playback state synchronizations.
- **SEO & Search Discovery**:
  - Added discovery assets `robots.txt` and `sitemap.xml` with dynamic base URL support.

### Changed
- **Vercel Serverless Architecture**:
  - Dedicated Vercel build script (`src/server/vercel.ts` bundled with `esbuild` to `api/index.js`) completely separated from standalone `server.ts`.
  - Configured `maxDuration: 60` in `vercel.json` alongside `bodyParser: false` to allow unconstrained streaming of large multipart payloads.
- **Strict TypeScript Configuration**:
  - Enforced `strict: true`, `noUncheckedIndexedAccess`, and comprehensive null checks across entire frontend and backend codebases.
- **Clean Glass Design System & Accessibility**:
  - Standardized interactive element IDs across all components for automated testing and screen reader accessibility.
  - Optimized audio/video playback scrubbing and throttled time updates to prevent UI jank.

### Fixed
- **Audio ID3 Album Art Extraction**: Fixed premature base64 string truncation on embedded cover art by safely isolating binary buffers.
- **Banned Extensions Consistency**: Unified banned file extension rules between client-side file picker and server-side validation using `src/shared/banned-extensions.ts`.
- **Silent Fallbacks**: Replaced silent URL copying fallbacks in native share dialogs with clear user-facing feedback and toast indicators.
- **Public Share URL Consistency**: Ensured all copy-link and share actions consistently emit Open Graph landing links (`/s/:id`) instead of raw direct Catbox links.

### Security
- **Strict Proxy Trust & Client IP Resolution**: Enabled `trust proxy` in Express with multi-header evaluation (`getClientIp`) prioritizing Vercel headers `x-forwarded-for` and `x-real-ip` to prevent rate limit spoofing.
- **Elimination of Global Session Fallbacks**: Removed insecure default fallback session IDs, ensuring unauthenticated or invalid session requests generate unique cryptographic UUIDs.
- **Content-Security-Policy (CSP) Hardening**: Purged obsolete image origins (e.g. Unsplash) and locked down frame ancestors and media source directives.
- **Enhanced Magic Bytes Inspection**: Expanded signature verification to detect ZIP/APK/JAR archives masquerading as images or audio binaries, while unconditionally blocking DOS/PE `MZ` and Linux ELF files.

---

## [1.0.1] - 2026-08-31

### Added
- **Vercel Serverless Function Entrypoint (`api/index.ts`)**: Serverless adapter exporting the shared Express app with `bodyParser: false` for lossless multipart streaming.
- **Express App Factory (`src/server/app.ts`)**: Extracted stateless Express configuration and routing layer decoupled from persistent server socket listeners (`app.listen()`).

### Changed
- **Server Runner (`server.ts`)**: Refactored to act as a dedicated standalone and local development runner.
- **Routing Configuration (`vercel.json`)**: Simplified API rewrite routing to map all `/api/*` requests directly to `api/index.ts`.

---

## [1.0.0] - 2026-08-30

### Added
- **Real Catbox Storage Provider**: Implemented `CatboxStorageProvider` under the `StorageProvider` abstraction for uploading media buffers directly to Catbox.moe with exponential backoff and timeout abort handling.
- **Media Library & Management**:
  - Grid and List responsive view modes with local preference persistence.
  - Multi-criteria debounced search (filenames, ID3 audio title, artist).
  - Categorical filters (All, Photo, Video, Audio) and multi-field sorting (Date, Name, Size).
  - Multi-item selection with floating bulk action bar (Bulk Copy URL, Native Share, Bulk Delete).
  - Detailed media inspector modal with raw metadata and direct provider links.
- **Integrated Rich Players**:
  - Custom HTML5 Video Player with custom progress scrubbing, volume controls, picture-in-picture, and fullscreen toggle.
  - Custom Web Audio Player with real-time dynamic frequency bar visualizer, ID3 tag metadata extraction (album cover, artist, title), and responsive scrubbing.
  - High-resolution image preview lightbox with zoom, rotate, and aspect ratio retention.
- **Robust Security & Validation**:
  - Server-side filename sanitization preventing directory traversal and null byte injection.
  - Magic bytes inspection for image, video, and audio binaries (blocking disguised executables like DOS PE and ELF).
  - In-memory sliding window IP rate limiter on upload and general media endpoints.
  - Comprehensive Content-Security-Policy (CSP), nosniff, Referrer-Policy, and restricted Permissions-Policy.
  - Automatic credential scrubbing in error handling and request logs to prevent `CATBOX_USERHASH` leakage.
- **Performance Optimizations**:
  - Next-gen image lazy-loading (`loading="lazy"`, `decoding="async"`).
  - Video `preload="none"` optimization to preserve mobile bandwidth.
  - Production asset caching with immutable static hashing and Brotli/Gzip compliance.
- **Repository & Infrastructure Foundation**:
  - GitHub Actions CI pipeline running typechecking, linting, security test suites, and production build.
  - Comprehensive technical documentation (`docs/architecture.md`, `docs/api.md`, `docs/development.md`, `docs/deployment.md`).
  - Strict proprietary licensing (`LICENSE`), security policy (`SECURITY.md`), and issue templates.

### Changed
- Standardized package scripts (`dev`, `build`, `start`, `typecheck`, `lint`, `test`).
- Modernized build pipeline using Vite 6 + Tailwind CSS v4 + esbuild server bundling.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
