# Changelog

All notable changes to AirShare Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
