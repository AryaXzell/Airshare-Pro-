# AirShare Pro Architecture Documentation

## Overview

AirShare Pro is an instant, high-performance media sharing, streaming, and management platform built with React 19, TypeScript, Express, and Vite. Storage persistence is powered by upstream provider **Catbox.moe** via an extensible `StorageProvider` abstraction layer.

---

## 1. High-Level System Architecture

```mermaid
graph TD
    User([User / Browser])
    
    subgraph Frontend [AirShare Pro Client]
        UI[Clean Glass UI Layer]
        UploadHook[useUpload Hook]
        MediaHook[useMediaLibrary Hook]
        MetadataExtractor[Client Metadata Extractor]
        PlayerComponents[Audio / Video / Image Players]
    end
    
    subgraph Backend [Express Server Layer]
        Logger[Structured Logger & Request ID]
        SecurityHeaders[Security Headers & CSP]
        RateLimiter[Sliding Window Rate Limiter]
        Multer[Multer Stream Memory Buffer]
        Validator[Input & Magic Bytes Validator]
        Controller[Media Controller]
        Repo[Media Repository]
    end
    
    subgraph Storage [Storage Provider Layer]
        ProviderInterface[StorageProvider Interface]
        CatboxProvider[CatboxStorageProvider]
    end
    
    subgraph External [External Services]
        CatboxAPI[Catbox.moe API]
        CatboxCDN[files.catbox.moe CDN]
    end
    
    User <-->|HTTP / HTML5| UI
    UI --> UploadHook
    UI --> MediaHook
    UI --> PlayerComponents
    UploadHook --> MetadataExtractor
    UploadHook -->|POST /api/media/upload| Logger
    MediaHook -->|GET / DELETE /api/media| Logger
    
    Logger --> SecurityHeaders
    SecurityHeaders --> RateLimiter
    RateLimiter --> Multer
    Multer --> Validator
    Validator --> Controller
    Controller --> Repo
    Controller --> ProviderInterface
    ProviderInterface --> CatboxProvider
    CatboxProvider -->|HTTPS POST| CatboxAPI
    PlayerComponents -.->|Stream Media| CatboxCDN
```

---

## 2. Component Layers

### 2.1 Frontend Layer (Client-Side)
- **Framework**: React 19 with TypeScript.
- **Styling**: Tailwind CSS v4 featuring the **Clean Glass** design system, high-contrast typography (Plus Jakarta Sans & JetBrains Mono), and dark/light adaptive theming.
- **Client Metadata Extraction**: `mediaMetadata.ts` extracts video aspect ratios, image dimensions, and audio ID3 metadata (artist, title, album, embedded APIC album art) prior to or during upload.
- **Media Library Synchronization**: Multi-layer state management combining server repository data with local client caching for offline resilience and immediate UI updates.

### 2.2 Server & Security Layer (Express + Node.js)
- **Entry Point**: `server.ts` binding to port 3000 (`0.0.0.0`).
- **Request Identification**: Every incoming request is tagged with a unique `req_<timestamp>_<random>` ID passed via `X-Request-Id` response header.
- **Content Security Policy (CSP)**: Allows strict self-origin resources, Catbox CDN endpoints (`files.catbox.moe`), and Google Fonts CDN while forbidding dangerous object or frame embeddings.
- **Sliding-Window Rate Limiter**: IP-based rate limiting on upload and query endpoints to defend against automated resource exhaustion.
- **Authoritative Validation**: Validates file sizes against `MAX_UPLOAD_SIZE` (default: 200MB), strips dangerous characters/directory traversal patterns from filenames, and verifies binary magic bytes.

### 2.3 Storage Provider Abstraction
```typescript
export interface StorageProvider {
  readonly name: string;
  isDeleteSupported(): boolean;
  upload(fileBuffer: Buffer | Uint8Array | Blob, filename: string, mimeType: string): Promise<StorageUploadResult>;
  delete(idOrUrl: string): Promise<StorageDeleteResult>;
}
```
- **Provider Decoupling**: The core controller interacts strictly with the `StorageProvider` interface rather than hardcoding Catbox endpoints. This allows future storage drivers (e.g. S3, Cloudflare R2) to be added with zero changes to business logic.
- **Catbox Implementation (`CatboxStorageProvider`)**:
  - Implements multipart upload to `https://catbox.moe/user/api.php` (`reqtype=fileupload`).
  - Supports exponential backoff (retries transient 5xx/network errors, halts immediately on 4xx).
  - Employs `AbortController` timeouts (`CATBOX_TIMEOUT_MS`).
  - Catbox file deletion (`reqtype=deletefiles`) is executed if `CATBOX_USERHASH` is configured on the server.
  - Automatically scrubs credentials from error output.

### 2.4 Media Repository Layer
- **Interface (`MediaRepository`)**: Defines CRUD contracts (`create`, `list`, `get`, `delete`, `clearAll`).
- **Development Repository (`DevelopmentMediaRepository`)**: In-memory FIFO cache with memory bounding (150 items max) to ensure zero memory leaks during long-running sessions.

---

## 3. End-to-End Upload Lifecycle

1. **User Selection**: User drags or picks a photo, video, or audio file in `UploadZone.tsx`.
2. **Client Validation**: File type and size are inspected on the client for immediate visual feedback.
3. **Multipart Request**: `uploadService.ts` streams the file payload via `XMLHttpRequest` to track upload progress smoothly.
4. **Server Ingestion**: Multer buffers the file in memory.
5. **Security Gate**:
   - `input-validator.ts` checks banned extensions and validates binary magic bytes.
   - `rate-limiter.ts` verifies client IP quota.
6. **Upstream Forwarding**: `CatboxStorageProvider` streams the buffer to Catbox with timeout protection.
7. **Storage Response**: Catbox returns the public media URL (e.g. `https://files.catbox.moe/xyz123.mp4`).
8. **Metadata Record**: Server instantiates a `MediaObject`, records it in the repository, and returns a 201 JSON payload.
9. **UI Display**: Client adds the item to the reactive `MediaLibrary` state and presents instant sharing, playback, and copy actions.

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
