// src/server/app.ts
import express from "express";
import cookieParser from "cookie-parser";

// src/server/api/routes.ts
import { Router } from "express";
import multer from "multer";

// src/server/storage/catbox-storage-provider.ts
var CatboxStorageProvider = class {
  constructor(options) {
    this.name = "catbox";
    this.apiUrl = "https://catbox.moe/user/api.php";
    this.timeoutMs = options?.timeoutMs || parseInt(process.env.CATBOX_TIMEOUT_MS || "60000", 10);
    this.maxRetries = options?.maxRetries ?? 2;
  }
  /**
   * Reads userhash securely only on the server runtime.
   * If not set or empty, uploads proceed anonymously to Catbox.
   */
  getUserhash() {
    const hash = process.env.CATBOX_USERHASH?.trim();
    return hash && hash.length > 0 ? hash : void 0;
  }
  /**
   * Catbox API requires userhash to delete files.
   */
  isDeleteSupported() {
    return Boolean(this.getUserhash());
  }
  /**
   * Sanitizes error messages to guarantee no Catbox credentials leak.
   */
  sanitizeError(err, userhash) {
    let raw = err instanceof Error ? err.message : "Kesalahan jaringan atau server eksternal";
    if (userhash && userhash.length > 0) {
      raw = raw.split(userhash).join("***");
    }
    return new Error(raw);
  }
  /**
   * Single attempt to upload file buffer to Catbox with timeout signal.
   */
  async executeUploadAttempt(fileBlob, filename, userhash) {
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    if (userhash) {
      formData.append("userhash", userhash);
    }
    formData.append("fileToUpload", fileBlob, filename);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          "User-Agent": "AirSharePro-Security/2.1 (MediaSharingHub)"
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const isTransient = response.status >= 500 && response.status < 600;
        const err = new Error(`Catbox HTTP ${response.status}: ${response.statusText}`);
        err.isTransient = isTransient;
        throw err;
      }
      const rawResult = await response.text();
      const trimmedResult = rawResult.trim();
      if (!trimmedResult.startsWith("http://") && !trimmedResult.startsWith("https://")) {
        const err = new Error(`Catbox provider: ${trimmedResult}`);
        err.isTransient = false;
        throw err;
      }
      try {
        const parsedUrl = new URL(trimmedResult);
        if (!parsedUrl.hostname.endsWith("catbox.moe")) {
          throw new Error("URL yang diterima dari provider tidak valid.");
        }
      } catch {
        throw new Error("URL respon provider tidak valid.");
      }
      return trimmedResult;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        const timeoutErr = new Error(`Unggahan ke Catbox melebihi batas waktu (${this.timeoutMs / 1e3}s).`);
        timeoutErr.isTransient = true;
        throw timeoutErr;
      }
      throw err;
    }
  }
  /**
   * Uploads a file buffer to Catbox with exponential backoff for transient errors.
   */
  async upload(fileBuffer, filename, mimeType) {
    const userhash = this.getUserhash();
    let fileBlob;
    if (fileBuffer instanceof Blob) {
      fileBlob = fileBuffer;
    } else {
      const uint8 = new Uint8Array(
        fileBuffer.buffer,
        fileBuffer.byteOffset,
        fileBuffer.byteLength
      );
      fileBlob = new Blob([uint8], { type: mimeType || "application/octet-stream" });
    }
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const fileUrl = await this.executeUploadAttempt(fileBlob, filename, userhash);
        const urlParts = fileUrl.split("/");
        const generatedId = urlParts[urlParts.length - 1] || `${Date.now()}`;
        return {
          id: generatedId,
          url: fileUrl,
          provider: this.name,
          filename,
          size: fileBlob.size,
          mimeType
        };
      } catch (err) {
        lastError = err;
        const isTransient = err?.isTransient ?? false;
        if (!isTransient || attempt > this.maxRetries) {
          break;
        }
        const delayMs = Math.min(1e3 * Math.pow(2, attempt - 1), 3e3);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw this.sanitizeError(lastError, userhash);
  }
  /**
   * Deletes a file on Catbox using the official API (reqtype=deletefiles).
   */
  async delete(idOrUrl) {
    const userhash = this.getUserhash();
    if (!userhash) {
      return {
        success: false,
        supported: false,
        message: "Penghapusan dari server Catbox membutuhkan CATBOX_USERHASH. Berkas dihapus dari riwayat lokal."
      };
    }
    const filename = idOrUrl.includes("/") ? idOrUrl.split("/").pop() || idOrUrl : idOrUrl;
    const formData = new FormData();
    formData.append("reqtype", "deletefiles");
    formData.append("userhash", userhash);
    formData.append("files", filename);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 15e3));
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          "User-Agent": "AirSharePro-Security/2.1 (MediaSharingHub)"
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return {
          success: false,
          supported: true,
          message: `Gagal menghubungi Catbox: HTTP ${response.status}`
        };
      }
      const resultText = (await response.text()).trim();
      if (resultText.toLowerCase().includes("success") || resultText.length === 0) {
        return {
          success: true,
          supported: true,
          message: "Berkas berhasil dihapus dari Catbox."
        };
      }
      return {
        success: false,
        supported: true,
        message: `Catbox delete: ${resultText}`
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          supported: true,
          message: "Penghapusan berkas di Catbox melebihi batas waktu (15s)."
        };
      }
      const sanitized = this.sanitizeError(err, userhash);
      return {
        success: false,
        supported: true,
        message: sanitized.message
      };
    }
  }
};

// src/server/repository/development-repository.ts
function assertValidSessionId(sessionId, operation) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error(`sessionId wajib diisi untuk operasi repository ${operation}`);
  }
}
var DevelopmentMediaRepository = class {
  constructor() {
    this.items = /* @__PURE__ */ new Map();
    this.maxItems = 250;
  }
  async create(media) {
    assertValidSessionId(media.sessionId, "create");
    if (this.items.size >= this.maxItems) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey) {
        this.items.delete(oldestKey);
      }
    }
    this.items.set(media.id, { ...media });
    return media;
  }
  async list(sessionId, limit = 100) {
    assertValidSessionId(sessionId, "list");
    let list = Array.from(this.items.values()).filter((item) => item.sessionId === sessionId);
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, limit);
  }
  async get(id, sessionId) {
    assertValidSessionId(sessionId, "get");
    const item = this.items.get(id);
    if (!item) return null;
    if (item.sessionId !== sessionId) {
      return null;
    }
    return { ...item };
  }
  async delete(id, sessionId) {
    assertValidSessionId(sessionId, "delete");
    const item = this.items.get(id);
    if (!item) return false;
    if (item.sessionId !== sessionId) {
      return false;
    }
    return this.items.delete(id);
  }
  async clearAll(sessionId) {
    assertValidSessionId(sessionId, "clearAll");
    for (const [id, item] of this.items.entries()) {
      if (item.sessionId === sessionId) {
        this.items.delete(id);
      }
    }
  }
};
var developmentMediaRepository = new DevelopmentMediaRepository();

// src/server/repository/upstash-repository.ts
function assertValidSessionId2(sessionId, operation) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error(`sessionId wajib diisi untuk operasi repository ${operation}`);
  }
}
var UpstashMediaRepository = class {
  constructor(redis) {
    this.redis = redis;
  }
  getItemKey(sessionId, id) {
    return `media:${sessionId}:${id}`;
  }
  getIndexKey(sessionId) {
    return `media_idx:${sessionId}`;
  }
  async create(media) {
    assertValidSessionId2(media.sessionId, "create");
    const sessionId = media.sessionId;
    const itemKey = this.getItemKey(sessionId, media.id);
    const indexKey = this.getIndexKey(sessionId);
    const pipeline = this.redis.pipeline();
    pipeline.set(itemKey, JSON.stringify(media));
    pipeline.zadd(indexKey, { score: media.createdAt, member: media.id });
    pipeline.expire(itemKey, 30 * 24 * 60 * 60);
    pipeline.expire(indexKey, 30 * 24 * 60 * 60);
    await pipeline.exec();
    return media;
  }
  async list(sessionId, limit = 100) {
    assertValidSessionId2(sessionId, "list");
    const indexKey = this.getIndexKey(sessionId);
    const ids = await this.redis.zrange(indexKey, 0, limit - 1, { rev: true });
    if (!ids || ids.length === 0) {
      return [];
    }
    const itemKeys = ids.map((id) => this.getItemKey(sessionId, id));
    const rawItems = await this.redis.mget(...itemKeys);
    const result = [];
    rawItems.forEach((raw) => {
      if (raw) {
        try {
          const item = typeof raw === "string" ? JSON.parse(raw) : raw;
          result.push(item);
        } catch {
        }
      }
    });
    return result;
  }
  async get(id, sessionId) {
    assertValidSessionId2(sessionId, "get");
    const itemKey = this.getItemKey(sessionId, id);
    const raw = await this.redis.get(itemKey);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
  async delete(id, sessionId) {
    assertValidSessionId2(sessionId, "delete");
    const itemKey = this.getItemKey(sessionId, id);
    const indexKey = this.getIndexKey(sessionId);
    const pipeline = this.redis.pipeline();
    pipeline.del(itemKey);
    pipeline.zrem(indexKey, id);
    const results = await pipeline.exec();
    const delCount = results[0];
    return typeof delCount === "number" && delCount > 0;
  }
  async clearAll(sessionId) {
    assertValidSessionId2(sessionId, "clearAll");
    const indexKey = this.getIndexKey(sessionId);
    const ids = await this.redis.zrange(indexKey, 0, -1);
    const pipeline = this.redis.pipeline();
    if (ids && ids.length > 0) {
      ids.forEach((id) => {
        pipeline.del(this.getItemKey(sessionId, id));
      });
    }
    pipeline.del(indexKey);
    await pipeline.exec();
  }
};

// src/server/storage/redis-client.ts
import { Redis } from "@upstash/redis";
var redisInstance = null;
function isUpstashConfigured() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}
function getRedisClient() {
  if (!isUpstashConfigured()) {
    return null;
  }
  if (!redisInstance) {
    try {
      redisInstance = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim()
      });
    } catch (err) {
      console.warn("[REDIS_INIT_FAILED] Gagal inisialisasi client Upstash Redis:", err);
      return null;
    }
  }
  return redisInstance;
}

// src/server/repository/media-repository.ts
var cachedUpstashRepository = null;
function getMediaRepository() {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      if (!cachedUpstashRepository) {
        cachedUpstashRepository = new UpstashMediaRepository(redis);
      }
      return cachedUpstashRepository;
    }
  }
  return developmentMediaRepository;
}

// src/shared/banned-extensions.ts
var BANNED_EXTENSIONS_LIST = [
  "exe",
  "bat",
  "cmd",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "js",
  "mjs",
  "cjs",
  "ts",
  "jsx",
  "tsx",
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "phps",
  "py",
  "pyc",
  "pyd",
  "pyo",
  "pyw",
  "rb",
  "pl",
  "cgi",
  "jar",
  "war",
  "ear",
  "apk",
  "aab",
  "msi",
  "msp",
  "mst",
  "com",
  "gadget",
  "wsf",
  "wsh",
  "scr",
  "hta",
  "cpl",
  "msc",
  "inf",
  "reg",
  "dll",
  "so",
  "dylib",
  "bin",
  "elf",
  "html",
  "htm",
  "iso"
];
var BANNED_EXTENSIONS = new Set(BANNED_EXTENSIONS_LIST);

// src/server/security/input-validator.ts
function sanitizeFilename(rawName) {
  if (!rawName || typeof rawName !== "string") {
    return `media_${Date.now()}`;
  }
  let clean = rawName.replace(/[\x00-\x1F\x7F]/g, "");
  clean = clean.replace(/^.*[\\/]/, "");
  clean = clean.replace(/[^a-zA-Z0-9._\- ()[\]]/g, "_");
  clean = clean.replace(/\.{2,}/g, ".");
  if (clean.length > 200) {
    const parts = clean.split(".");
    const ext = parts.length > 1 ? `.${parts.pop()}` : "";
    const base = parts.join(".").slice(0, 200 - ext.length);
    clean = `${base}${ext}`;
  }
  return clean.trim() || `media_${Date.now()}`;
}
function verifyMediaMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 4) return false;
  const headerHex = buffer.subarray(0, 12).toString("hex").toLowerCase();
  const mime = mimeType.toLowerCase();
  if (headerHex.startsWith("4d5a")) return false;
  if (headerHex.startsWith("7f454c46")) return false;
  if (headerHex.startsWith("504b0304") && (mime.includes("image") || mime.includes("audio"))) {
    return false;
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return headerHex.startsWith("ffd8ff");
  }
  if (mime.includes("png")) {
    return headerHex.startsWith("89504e470d0a1a0a");
  }
  if (mime.includes("gif")) {
    return headerHex.startsWith("47494638");
  }
  if (mime.includes("webp")) {
    return headerHex.startsWith("52494646") && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mime.includes("mp4") || mime.includes("quicktime") || mime.includes("m4a")) {
    return buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (mime.includes("webm") || mime.includes("matroska") || mime.includes("mkv")) {
    return headerHex.startsWith("1a45dfa3");
  }
  if (mime.includes("mp3") || mime.includes("mpeg")) {
    return headerHex.startsWith("494433") || headerHex.startsWith("fffb") || headerHex.startsWith("fff3") || headerHex.startsWith("fff2");
  }
  if (mime.includes("ogg")) {
    return headerHex.startsWith("4f676753") || headerHex.startsWith("4f676773");
  }
  if (mime.includes("flac")) {
    return headerHex.startsWith("664c6143");
  }
  if (mime.includes("wav")) {
    return headerHex.startsWith("52494646") && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (mime.includes("bmp")) {
    return headerHex.startsWith("424d");
  }
  if (mime.includes("svg")) {
    const textStart = buffer.subarray(0, 256).toString("utf8").trim().toLowerCase();
    return textStart.includes("<svg") || textStart.includes("<?xml");
  }
  const isKnownMedia = headerHex.startsWith("ffd8ff") || headerHex.startsWith("89504e47") || headerHex.startsWith("47494638") || headerHex.startsWith("52494646") || headerHex.startsWith("1a45dfa3") || headerHex.startsWith("494433") || headerHex.startsWith("664c6143") || headerHex.startsWith("4f676753") || headerHex.startsWith("4f676773") || buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  return isKnownMedia;
}
function validateUploadedFile(file, maxSizeBytes) {
  if (!file) {
    return {
      valid: false,
      errorCode: "NO_FILE",
      errorMessage: "Tidak ada berkas yang diunggah."
    };
  }
  const originalName = file.originalname || "unnamed-file";
  const sanitizedName = sanitizeFilename(originalName);
  const ext = sanitizedName.split(".").pop()?.toLowerCase() || "";
  if (BANNED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      errorCode: "FORBIDDEN_EXTENSION",
      errorMessage: `Ekstensi berkas .${ext} dilarang demi keamanan sistem.`
    };
  }
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      errorCode: "FILE_TOO_LARGE",
      errorMessage: `Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal (${(maxSizeBytes / (1024 * 1024)).toFixed(1)} MB).`
    };
  }
  if (file.size <= 0) {
    return {
      valid: false,
      errorCode: "INVALID_FILE",
      errorMessage: "Berkas kosong (0 bytes)."
    };
  }
  const mimeType = (file.mimetype || "").toLowerCase();
  let mediaType = null;
  if (mimeType.startsWith("image/")) mediaType = "image";
  else if (mimeType.startsWith("video/")) mediaType = "video";
  else if (mimeType.startsWith("audio/")) mediaType = "audio";
  if (!mediaType) {
    return {
      valid: false,
      errorCode: "UNSUPPORTED_MEDIA_TYPE",
      errorMessage: "Hanya format Foto (image/*), Video (video/*), dan Audio (audio/*) yang didukung."
    };
  }
  if (file.buffer && !verifyMediaMagicBytes(file.buffer, mimeType)) {
    return {
      valid: false,
      errorCode: "CORRUPTED_OR_INVALID_MEDIA",
      errorMessage: "Format biner berkas tidak cocok dengan tipe media yang ditentukan."
    };
  }
  return {
    valid: true,
    sanitizedFilename: sanitizedName,
    detectedMediaType: mediaType
  };
}
function isValidMediaId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[a-zA-Z0-9._\-]{1,100}$/.test(id);
}

// src/server/api/media-controller.ts
var storageProvider = new CatboxStorageProvider();
var MAX_UPLOAD_SIZE = parseInt(
  process.env.MAX_UPLOAD_SIZE || "209715200",
  10
);
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
var mediaController = {
  /**
   * GET /api/media/config
   * Provides non-sensitive upload configuration to client
   */
  async getConfig(req, res) {
    const response = {
      success: true,
      data: {
        maxUploadSize: MAX_UPLOAD_SIZE,
        formattedMaxSize: formatBytes(MAX_UPLOAD_SIZE),
        provider: storageProvider.name,
        isDeleteSupported: storageProvider.isDeleteSupported(),
        rateLimitUploadsPerMinute: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS_PER_MIN || "20", 10)
      }
    };
    res.json(response);
  },
  /**
   * POST /api/media/upload
   * Receives uploaded file stream, validates strictly, uploads to Catbox, and persists metadata.
   */
  async uploadMedia(req, res) {
    const mediaRepository = getMediaRepository();
    try {
      const file = req.file;
      const validation = validateUploadedFile(file, MAX_UPLOAD_SIZE);
      if (!validation.valid || !file || !validation.sanitizedFilename || !validation.detectedMediaType) {
        const status = validation.errorCode === "FILE_TOO_LARGE" ? 413 : 400;
        const err = {
          success: false,
          error: {
            code: validation.errorCode || "INVALID_REQUEST",
            message: validation.errorMessage || "Berkas tidak valid."
          }
        };
        res.status(status).json(err);
        return;
      }
      const originalName = file.originalname || "unknown-file";
      const sanitizedName = validation.sanitizedFilename;
      const mediaType = validation.detectedMediaType;
      const mimeType = file.mimetype || "application/octet-stream";
      const sessionId = req.sessionId;
      let imageMeta;
      let videoMeta;
      let audioMeta;
      if (req.body && req.body.metadata) {
        try {
          const parsed = typeof req.body.metadata === "string" ? JSON.parse(req.body.metadata) : req.body.metadata;
          if (parsed && typeof parsed === "object") {
            if (parsed.imageMeta) {
              imageMeta = {
                width: typeof parsed.imageMeta.width === "number" ? parsed.imageMeta.width : void 0,
                height: typeof parsed.imageMeta.height === "number" ? parsed.imageMeta.height : void 0
              };
            }
            if (parsed.videoMeta) {
              videoMeta = {
                duration: typeof parsed.videoMeta.duration === "number" ? parsed.videoMeta.duration : void 0,
                width: typeof parsed.videoMeta.width === "number" ? parsed.videoMeta.width : void 0,
                height: typeof parsed.videoMeta.height === "number" ? parsed.videoMeta.height : void 0
              };
            }
            if (parsed.audioMeta) {
              audioMeta = {
                title: typeof parsed.audioMeta.title === "string" ? parsed.audioMeta.title.slice(0, 150) : void 0,
                artist: typeof parsed.audioMeta.artist === "string" ? parsed.audioMeta.artist.slice(0, 150) : void 0,
                album: typeof parsed.audioMeta.album === "string" ? parsed.audioMeta.album.slice(0, 150) : void 0,
                duration: typeof parsed.audioMeta.duration === "number" ? parsed.audioMeta.duration : void 0,
                coverUrl: void 0
                // Handled specifically below to prevent base64 truncation
              };
              const rawCover = parsed.audioMeta.coverUrl;
              if (typeof rawCover === "string" && rawCover.startsWith("data:image/")) {
                try {
                  const match = rawCover.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                  if (match) {
                    const coverMime = match[1];
                    const base64Data = match[2];
                    const coverBuffer = Buffer.from(base64Data, "base64");
                    if (coverBuffer.length > 0 && coverBuffer.length <= 2 * 1024 * 1024) {
                      const baseName = sanitizedName.replace(/\.[^.]+$/, "");
                      const coverFilename = `${baseName}-cover.jpg`;
                      const coverUpload = await storageProvider.upload(
                        coverBuffer,
                        coverFilename,
                        coverMime
                      );
                      audioMeta.coverUrl = coverUpload.url;
                    }
                  }
                } catch (coverErr) {
                  console.warn("Failed to upload audio cover art to storage provider:", coverErr);
                }
              } else if (typeof rawCover === "string" && (rawCover.startsWith("http://") || rawCover.startsWith("https://"))) {
                audioMeta.coverUrl = rawCover;
              }
            }
          }
        } catch {
        }
      }
      const uploadResult = await storageProvider.upload(
        file.buffer,
        sanitizedName,
        mimeType
      );
      const mediaObject = {
        id: uploadResult.id,
        name: sanitizedName,
        originalFileName: originalName.slice(0, 200),
        size: file.size,
        formattedSize: formatBytes(file.size),
        type: mediaType,
        mimeType,
        shareUrl: uploadResult.url,
        provider: "catbox",
        createdAt: Date.now(),
        sessionId,
        imageMeta,
        videoMeta,
        audioMeta
      };
      await mediaRepository.create(mediaObject);
      const response = {
        success: true,
        data: mediaObject
      };
      res.status(201).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengunggah berkas ke provider.";
      const isTimeout = message.toLowerCase().includes("timeout") || message.toLowerCase().includes("waktu");
      const errorCode = isTimeout ? "UPLOAD_TIMEOUT" : "PROVIDER_ERROR";
      const err = {
        success: false,
        error: {
          code: errorCode,
          message
        }
      };
      res.status(502).json(err);
    }
  },
  /**
   * GET /api/media
   * Retrieves list of stored media items scoped to current caller session
   */
  async listMedia(req, res) {
    const mediaRepository = getMediaRepository();
    try {
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = isNaN(rawLimit) ? 100 : Math.min(Math.max(1, rawLimit), 200);
      const items = await mediaRepository.list(req.sessionId, limit);
      const response = {
        success: true,
        data: items
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memuat daftar media.";
      const err = {
        success: false,
        error: {
          code: "REPOSITORY_ERROR",
          message
        }
      };
      res.status(500).json(err);
    }
  },
  /**
   * GET /api/media/:id
   * Retrieves single media item by ID, scoped to caller session
   */
  async getMedia(req, res) {
    const mediaRepository = getMediaRepository();
    try {
      const { id } = req.params;
      if (!isValidMediaId(id)) {
        const err = {
          success: false,
          error: {
            code: "INVALID_ID",
            message: "Format ID media tidak valid."
          }
        };
        res.status(400).json(err);
        return;
      }
      const item = await mediaRepository.get(id, req.sessionId);
      if (!item) {
        const err = {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Berkas media tidak ditemukan di repositori."
          }
        };
        res.status(404).json(err);
        return;
      }
      const response = {
        success: true,
        data: item
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengambil data media.";
      const err = {
        success: false,
        error: {
          code: "FETCH_ERROR",
          message
        }
      };
      res.status(500).json(err);
    }
  },
  /**
   * DELETE /api/media/:id
   * Deletes item from repository (session-scoped) and requests Catbox deletion if userhash is configured
   */
  async deleteMedia(req, res) {
    const mediaRepository = getMediaRepository();
    try {
      const { id } = req.params;
      if (!isValidMediaId(id)) {
        const err = {
          success: false,
          error: {
            code: "INVALID_ID",
            message: "Format ID media tidak valid."
          }
        };
        res.status(400).json(err);
        return;
      }
      const item = await mediaRepository.get(id, req.sessionId);
      if (!item) {
        const err = {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Berkas media tidak ditemukan di repositori."
          }
        };
        res.status(404).json(err);
        return;
      }
      await mediaRepository.delete(id, req.sessionId);
      let providerResult = {
        success: false,
        supported: false
      };
      if (item.shareUrl) {
        providerResult = await storageProvider.delete(item.shareUrl);
      }
      const response = {
        success: true,
        data: {
          deletedId: id,
          providerResult
        }
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus berkas.";
      const err = {
        success: false,
        error: {
          code: "DELETE_ERROR",
          message
        }
      };
      res.status(500).json(err);
    }
  },
  /**
   * DELETE /api/media
   * Clears repository history for current session
   */
  async clearAllMedia(req, res) {
    const mediaRepository = getMediaRepository();
    try {
      await mediaRepository.clearAll(req.sessionId);
      const response = {
        success: true,
        data: { cleared: true }
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membersihkan riwayat.";
      const err = {
        success: false,
        error: {
          code: "CLEAR_ERROR",
          message
        }
      };
      res.status(500).json(err);
    }
  }
};

// src/server/security/client-ip.ts
function getClientIp(req) {
  const vercelIp = req.headers["x-vercel-forwarded-for"];
  if (typeof vercelIp === "string" && vercelIp.trim()) {
    return vercelIp.split(",")[0].trim();
  }
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (req.ip) {
    return req.ip;
  }
  return req.socket?.remoteAddress || "unknown-ip";
}

// src/server/security/rate-limiter.ts
var SlidingWindowRateLimiter = class {
  constructor() {
    this.buckets = /* @__PURE__ */ new Map();
    this.lastCleanup = Date.now();
  }
  cleanup(now) {
    if (now - this.lastCleanup < 3e4) return;
    this.lastCleanup = now;
    for (const [key, val] of this.buckets.entries()) {
      if (val.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
  async check(key, limit, windowMs) {
    const now = Date.now();
    this.cleanup(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, {
        count: 1,
        expiresAt: now + windowMs
      });
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTimeMs: now + windowMs
      };
    }
    if (bucket.count < limit) {
      bucket.count += 1;
      return {
        allowed: true,
        limit,
        remaining: limit - bucket.count,
        resetTimeMs: bucket.expiresAt
      };
    }
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTimeMs: bucket.expiresAt
    };
  }
};
var RedisRateLimiter = class {
  constructor(redis) {
    this.redis = redis;
  }
  async check(key, limit, windowMs) {
    const now = Date.now();
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1e3));
    const redisKey = `rl:${key}`;
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);
      const results = await pipeline.exec();
      const count = Number(results[0]) || 1;
      let ttl = Number(results[1]);
      if (ttl === -1 || ttl === -2 || count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
        ttl = windowSeconds;
      }
      const resetTimeMs = now + Math.max(1, ttl) * 1e3;
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      return {
        allowed,
        limit,
        remaining,
        resetTimeMs
      };
    } catch (err) {
      console.warn("[REDIS_RATE_LIMIT_ERROR] Gagal mengecek rate limit di Redis, fail-open:", err);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTimeMs: now + windowMs
      };
    }
  }
};
function getRateLimiter() {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      return new RedisRateLimiter(redis);
    }
  }
  return defaultRateLimiter;
}
var defaultRateLimiter = new SlidingWindowRateLimiter();
function rateLimitMiddleware(options) {
  const {
    limit,
    windowMs,
    keyPrefix = "rl",
    limiter
  } = options;
  return async (req, res, next) => {
    const activeLimiter = limiter || getRateLimiter();
    const clientIp = getClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    try {
      const result = await activeLimiter.check(key, limit, windowMs);
      const resetSeconds = Math.max(1, Math.ceil((result.resetTimeMs - Date.now()) / 1e3));
      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", resetSeconds);
      if (!result.allowed) {
        res.setHeader("Retry-After", resetSeconds);
        const errorResponse = {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `Terlalu banyak permintaan. Silakan tunggu ${resetSeconds} detik sebelum mencoba kembali.`
          }
        };
        res.status(429).json(errorResponse);
        return;
      }
      next();
    } catch (err) {
      console.warn("Rate limiter error, failing open:", err);
      next();
    }
  };
}

// src/server/api/routes.ts
var router = Router();
var MAX_UPLOAD_SIZE2 = parseInt(
  process.env.MAX_UPLOAD_SIZE || "209715200",
  10
);
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE2,
    files: 1
    // Enforce single file per request
  }
});
function handleMulterErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const errorResp2 = {
        success: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: `Ukuran berkas melebihi batas maksimal ${(MAX_UPLOAD_SIZE2 / (1024 * 1024)).toFixed(0)} MB.`
        }
      };
      res.status(413).json(errorResp2);
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      const errorResp2 = {
        success: false,
        error: {
          code: "TOO_MANY_FILES",
          message: "Hanya 1 berkas per permintaan yang diizinkan."
        }
      };
      res.status(400).json(errorResp2);
      return;
    }
    const errorResp = {
      success: false,
      error: {
        code: "INVALID_MULTIPART_REQUEST",
        message: err.message
      }
    };
    res.status(400).json(errorResp);
    return;
  }
  if (err) {
    next(err);
    return;
  }
  next();
}
var uploadRateLimiter = rateLimitMiddleware({
  limit: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS_PER_MIN || "20", 10),
  windowMs: 60 * 1e3,
  keyPrefix: "upload_ip"
});
var standardRateLimiter = rateLimitMiddleware({
  limit: 120,
  windowMs: 60 * 1e3,
  keyPrefix: "media_general_ip"
});
function methodNotAllowedHandler(allowedMethods) {
  return (req, res) => {
    res.setHeader("Allow", allowedMethods.join(", "));
    const errorResp = {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Metode ${req.method} tidak diizinkan untuk endpoint ini. Gunakan: ${allowedMethods.join(", ")}.`
      }
    };
    res.status(405).json(errorResp);
  };
}
router.route("/config").get(standardRateLimiter, mediaController.getConfig).all(methodNotAllowedHandler(["GET"]));
router.route("/upload").post(
  uploadRateLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      handleMulterErrors(err, req, res, next);
    });
  },
  mediaController.uploadMedia
).all(methodNotAllowedHandler(["POST"]));
router.route("/:id").get(standardRateLimiter, mediaController.getMedia).delete(standardRateLimiter, mediaController.deleteMedia).all(methodNotAllowedHandler(["GET", "DELETE"]));
router.route("/").get(standardRateLimiter, mediaController.listMedia).delete(standardRateLimiter, mediaController.clearAllMedia).all(methodNotAllowedHandler(["GET", "DELETE"]));

// src/server/security/request-logger.ts
import crypto from "crypto";
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}
function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  const incomingReqId = req.headers["x-request-id"];
  const requestId = incomingReqId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingReqId) ? incomingReqId : generateRequestId();
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const clientIp = getClientIp(req);
    const maskedIp = clientIp.includes(".") ? clientIp.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.***.$4") : clientIp.includes(":") ? clientIp.split(":").slice(0, 3).join(":") + ":****" : clientIp;
    const logEntry = {
      requestId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      ip: maskedIp,
      status: res.statusCode,
      durationMs,
      contentLength: res.getHeader("content-length")
    };
    if (res.statusCode >= 500) {
      console.error(`[API_ERROR] ${JSON.stringify(logEntry)}`);
    } else if (res.statusCode >= 400) {
      console.warn(`[API_WARN] ${JSON.stringify(logEntry)}`);
    } else if (process.env.NODE_ENV !== "production" || logEntry.url.startsWith("/api")) {
      console.log(`[API_INFO] ${JSON.stringify(logEntry)}`);
    }
  });
  next();
}

// src/server/security/session.ts
import crypto2 from "crypto";
var SESSION_COOKIE_NAME = "airshare_session";
function isValidSessionId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}
function sessionMiddleware(req, res, next) {
  const existingCookie = req.cookies?.[SESSION_COOKIE_NAME];
  let sessionId = existingCookie;
  if (!sessionId || !isValidSessionId(sessionId)) {
    sessionId = `sess_${crypto2.randomBytes(16).toString("hex")}`;
    const isProd = process.env.NODE_ENV === "production";
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1e3,
      // 1 year persistence
      path: "/"
    });
  }
  req.sessionId = sessionId;
  next();
}

// src/server/app.ts
function createExpressApp() {
  const app2 = express();
  const isDev = process.env.NODE_ENV !== "production";
  app2.set("trust proxy", 1);
  app2.use(cookieParser());
  app2.use(sessionMiddleware);
  app2.use(requestLoggerMiddleware);
  app2.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    res.setHeader("X-XSS-Protection", "0");
    if (!isDev) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    const cspDirectives = [
      "default-src 'self'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe https://images.unsplash.com",
      "media-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
      isDev ? "connect-src 'self' data: blob: ws: wss: http: https: https://catbox.moe https://*.catbox.moe" : "connect-src 'self' data: blob: https://files.catbox.moe https://catbox.moe https://*.catbox.moe",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      isDev ? "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://ai.studio https://*.ai.studio https://*.aistudio.google.com https://*.run.app https://*.cloudshell.dev" : "frame-ancestors 'self'"
    ];
    res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Request-ID, Accept"
      );
      res.setHeader("Access-Control-Max-Age", "86400");
      res.status(204).end();
      return;
    }
    next();
  });
  app2.use(express.json({ limit: "10mb" }));
  app2.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app2.use((err, req, res, next) => {
    if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
      const errorResp = {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Format data JSON pada body permintaan tidak valid."
        }
      };
      res.status(400).json(errorResp);
      return;
    }
    next(err);
  });
  const healthHandler = (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({
      status: "ok",
      service: "AirShare Pro API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      storageProvider: "catbox",
      hasUserhash: Boolean(process.env.CATBOX_USERHASH?.trim())
    });
  };
  const healthMethodNotAllowed = (req, res) => {
    res.setHeader("Allow", "GET");
    const errorResp = {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Metode ${req.method} tidak diizinkan pada endpoint health check. Gunakan GET.`
      }
    };
    res.status(405).json(errorResp);
  };
  app2.route("/api/health").get(healthHandler).all(healthMethodNotAllowed);
  app2.route("/health").get(healthHandler).all(healthMethodNotAllowed);
  app2.use("/api/media", router);
  app2.use("/media", router);
  app2.all(["/api/*", "/media/*"], (req, res) => {
    const errorResp = {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Endpoint API '${req.method} ${req.path}' tidak ditemukan.`
      }
    };
    res.status(404).json(errorResp);
  });
  app2.use((err, req, res, _next) => {
    console.error("[UNHANDLED_ERROR]", err);
    const errorResp = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi kesalahan internal pada server."
      }
    };
    res.status(500).json(errorResp);
  });
  return app2;
}
var app = createExpressApp();
var app_default = app;

// src/server/vercel.ts
var FUNCTION_MAX_DURATION_MS = 6e4;
var catboxTimeoutMs = parseInt(process.env.CATBOX_TIMEOUT_MS || "60000", 10);
if (catboxTimeoutMs > FUNCTION_MAX_DURATION_MS) {
  console.warn(
    `[CONFIG_WARN] CATBOX_TIMEOUT_MS (${catboxTimeoutMs}ms) dikonfigurasi melebihi serverless maxDuration (${FUNCTION_MAX_DURATION_MS}ms). Permintaan berisiko diputus lebih awal oleh Vercel.`
  );
}
var config = {
  api: {
    bodyParser: false
  }
};
function handler(req, res) {
  return app_default(req, res);
}
export {
  config,
  handler as default
};
//# sourceMappingURL=index.js.map
