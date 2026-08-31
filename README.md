# AirShare Pro

> High-performance instant media sharing, streaming, and management platform powered by Catbox storage and the Clean Glass design system.

---

## Overview

**AirShare Pro** is a modern, responsive web application engineered for instant sharing, streaming, and organization of photos, videos, and audio files without speed throttling. It bridges the gap between high-capacity external storage providers and a polished, desktop-grade user experience with real-time audio visualizers, custom video controls, and flexible media library management.

---

## Key Features

- **Multi-Format Media Uploads**: Support for images (JPEG, PNG, WebP, GIF, SVG), video (MP4, WebM, MOV, MKV), and audio (MP3, WAV, FLAC, OGG, M4A) up to 200MB per file.
- **Real-Time Upload Progress**: Transparent progress tracking with calculated transfer speeds, estimated time remaining, and cancellable transfers via `AbortController`.
- **Integrated Rich Players**:
  - **HTML5 Video Player**: Custom scrubber, volume sliders, picture-in-picture, fullscreen toggle, and keyboard shortcuts.
  - **Dynamic Audio Player**: Real-time frequency bar visualizer powered by Web Audio API (`AnalyserNode`), automatic ID3 metadata extraction (artist, title, album, embedded artwork), and custom playback controls.
  - **Image Lightbox**: Smooth zooming, aspect ratio retention, rotation controls, and fullscreen view.
- **Media Library & Management**:
  - **Grid & List Views**: Responsive grid for visual media and dense list view for metadata inspection.
  - **Debounced Search**: Fast search across file names, audio track titles, and artist names.
  - **Filter & Sort**: Filter by category (*All*, *Photo*, *Video*, *Audio*) and sort by *Date*, *Name (A-Z)*, or *File Size*.
  - **Multi-Select & Bulk Actions**: Select multiple files for bulk URL copying, native mobile sharing (`navigator.share`), and batch removal.
- **Clean Glass Design**: Apple-inspired aesthetics with refined translucent surfaces, responsive touch targets, dark/light adaptive theming, and zero visual clutter.
- **Defense-in-Depth Security**:
  - Binary magic bytes validation preventing disguised executables.
  - Strict filename sanitization blocking directory traversal and null byte injections.
  - Sliding-window IP rate limiting.
  - Hardened Content-Security-Policy (CSP) headers.
  - Zero server secret leakage to client-side bundles.

---

## How It Works

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant App as AirShare Pro (Express + React)
    participant Catbox as Catbox.moe API
    participant CDN as files.catbox.moe CDN

    User->>App: 1. Drag & drop media file
    App->>App: 2. Validate format, magic bytes & rate limits
    App->>Catbox: 3. Forward stream to Catbox API (reqtype=fileupload)
    Catbox-->>App: 4. Return public media URL (e.g. https://files.catbox.moe/abc123.mp4)
    App-->>User: 5. Return MediaObject with metadata & direct share URL
    User->>CDN: 6. Instant streaming & direct download
```

---

## Tech Stack

| Domain | Technology | Description |
| --- | --- | --- |
| **Frontend** | React 19, TypeScript | Declarative UI components and state management |
| **Styling** | Tailwind CSS v4, Motion | Clean Glass design system, hardware-accelerated animations |
| **Backend** | Express 4, Node.js (v20) | REST API endpoints, streaming proxy, security middleware |
| **Build Tooling** | Vite 6, esbuild | Instant development compilation and optimized CJS server bundle |
| **Storage** | Catbox.moe API | High-capacity, unthrottled media hosting provider |
| **Icons** | Lucide React | Consistent, accessible iconography |

---

## System Architecture

AirShare Pro features a dual-entrypoint architecture sharing a single, robust Express application and API core:

```
                    AirShare Pro
                         │
              ┌──────────┴──────────┐
              │                     │
        Development             Production
              │                     │
          server.ts               Vercel
              │                     │
           Express                /api
              │                     │
         app.listen()          api/index.ts
              │              (Vercel Function)
              │                     │
              └──────────┬──────────┘
                         │
                  Express App Core
                 (src/server/app.ts)
                         │
              ┌──────────┴──────────┐
              │                     │
        Security & CSP        API Router
        Rate Limiter         (/api/media)
              │                     │
              │              ┌──────┴──────┐
              │              ▼             ▼
              │       Media Controller  Media Repo
              │              │
              └──────────────┼─────────────┐
                             ▼             ▼
                     StorageProvider    Catbox API
                   (Catbox Provider)  (Upstream)
```

- **Local Development**: `server.ts` imports the shared Express app, attaches Vite dev middleware for Hot Module Replacement / asset serving, and binds `app.listen(3000)`.
- **Production (Vercel Serverless)**: `api/index.ts` imports the exact same Express app and exports it as a Vercel Serverless Function without executing `app.listen()`. `vercel.json` routes `/api/(.*)` directly to this serverless entrypoint.

For comprehensive architectural specifications, refer to [docs/architecture.md](docs/architecture.md).

---

## Getting Started

### Prerequisites
- Node.js 20.x or later
- npm 9.x or later

### Installation & Local Run

```bash
# 1. Clone the repository
git clone https://github.com/aryaxzell/Airshare-Pro.git
cd Airshare-Pro

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Launch development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `tsx server.ts` | Launches Express server with Vite in development mode |
| `npm run build` | `vite build && esbuild server.ts ...` | Compiles client and bundles standalone server to `dist/server.cjs` |
| `npm run start` | `node dist/server.cjs` | Runs the compiled standalone server in production |
| `npm run typecheck` | `tsc --noEmit` | Validates TypeScript types across the entire project |
| `npm run lint` | `tsc --noEmit` | Codebase type and syntax validation |
| `npm run test` | `tsx src/server/__tests__/security.test.ts` | Runs the security, sanitization, and rate limiter test suite |
| `npm run clean` | `rm -rf dist server.js` | Removes build outputs and artifacts |

---

## Environment Variables

All configuration is managed via standard environment variables:

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `CATBOX_USERHASH` | Optional | `""` | Userhash from Catbox.moe for account-linked storage & file deletion. |
| `MAX_UPLOAD_SIZE` | Optional | `209715200` | Maximum file size in bytes (200MB). |
| `CATBOX_TIMEOUT_MS` | Optional | `60000` | Timeout for Catbox upstream HTTP requests in ms. |
| `RATE_LIMIT_MAX_UPLOADS_PER_MIN` | Optional | `20` | Max uploads allowed per IP per minute. |
| `NODE_ENV` | Optional | `development` | Application mode (`development` / `production`). |
| `PORT` | Optional | `3000` | Server listen port. |

See [.env.example](.env.example) for a pre-formatted template.

---

## API Overview

AirShare Pro provides a REST API under `/api/media`:

- `GET /api/media/config`: Get server upload limits and provider capabilities.
- `POST /api/media/upload`: Multipart upload for images, videos, and audio.
- `GET /api/media`: List recorded media items in the repository.
- `GET /api/media/:id`: Retrieve details for a single media item.
- `DELETE /api/media/:id`: Delete a media item from repository (and from Catbox if `CATBOX_USERHASH` is set).
- `DELETE /api/media`: Clear repository media history.
- `GET /api/health`: Service health check and provider status.

For full payload contracts and status codes, see [docs/api.md](docs/api.md).

---

## Storage & Catbox Integration

- **Public URLs**: Files uploaded to Catbox are hosted publicly on `https://files.catbox.moe/<id>`. Media URLs are public by design.
- **Deletion Capabilities**: Catbox only permits API-driven deletion when files are uploaded with a valid `CATBOX_USERHASH`. Anonymous uploads cannot be deleted from Catbox via API and are cleared only from local repository state.
- **Provider Abstraction**: Storage interactions implement the `StorageProvider` interface, decoupling the application core from Catbox-specific logic.

---

## Limitations & Known Operational Constraints

1. **Catbox Server-Side Deletion**: Without `CATBOX_USERHASH`, files uploaded to Catbox cannot be purged from Catbox servers via API; deleting in the app removes the entry from the local catalog only.
2. **Serverless Ephemeral State**: The current media metadata repository uses in-memory storage on the server alongside client-side `localStorage` caching. In stateless serverless environments (e.g. Vercel Lambdas), server-side memory does not persist across cold starts. User media lists persist reliably via the client's browser storage.
3. **Serverless Payload Limits**: Vercel Serverless Functions on the Hobby tier impose a 4.5MB request body limit (Pro tier: 50MB). For unconstrained 200MB large media file uploads, containerized hosting (Google Cloud Run, Docker, VPS) is recommended.
4. **Public Accessibility**: Catbox media URLs are directly accessible over the public internet to anyone holding the direct link. Media uploaded to Catbox is not encrypted at rest or password-protected.

---

## Project Status

- :white_check_mark: **Real Catbox Storage Integration**: Fully operational.
- :white_check_mark: **Media Library & Management**: Fully operational.
- :white_check_mark: **Rich Audio/Video Players & Visualizer**: Fully operational.
- :white_check_mark: **Security & Rate Limiting Hardening**: Fully operational.
- :white_check_mark: **CI/CD & Repository Infrastructure**: Fully operational.

---

## Documentation Directory

- [Architecture Guide](docs/architecture.md)
- [API Reference](docs/api.md)
- [Development Workflow](docs/development.md)
- [Deployment Guide](docs/deployment.md)

---

## License

AirShare Pro is proprietary software.

Copyright (c) 2026 AryaXzell. All rights reserved.

See [LICENSE](LICENSE) for details.
