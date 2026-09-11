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
    const defaultTimeout = process.env.VERCEL ? 35e3 : 45e3;
    const configuredTimeout = options?.timeoutMs || parseInt(process.env.CATBOX_TIMEOUT_MS || `${defaultTimeout}`, 10);
    this.timeoutMs = process.env.VERCEL ? Math.min(configuredTimeout, 4e4) : configuredTimeout;
    this.maxRetries = options?.maxRetries ?? (process.env.VERCEL ? 1 : 2);
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
        let bodyText = "";
        try {
          bodyText = (await response.text()).trim();
        } catch {
        }
        const isTransient = response.status >= 500 && response.status < 600;
        let errorMessage = `Catbox HTTP ${response.status}: ${bodyText || response.statusText || "Gagal memproses berkas"}`;
        if (bodyText.includes("Invalid uploader")) {
          errorMessage = "Catbox menolak unggahan anonim dari server cloud (Invalid uploader). Harap konfigurasikan CATBOX_USERHASH di Environment Variables Vercel Anda untuk menghubungkan akun Catbox resmi.";
        }
        const err = new Error(errorMessage);
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
        const timeoutErr = new Error(
          `Unggahan ke Catbox melebihi batas waktu (${this.timeoutMs / 1e3}s). Server upstream sedang lambat atau berkas terlalu besar untuk diproses dalam batas waktu serverless.`
        );
        timeoutErr.isTransient = false;
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
        message: "Penghapusan dari server Catbox membutuhkan CATBOX_USERHASH. Berkas dihapus dari riwayat pada sesi Anda, namun berkas aslinya tetap ada di Catbox."
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
    this.tombstones = /* @__PURE__ */ new Map();
    this.maxItems = 250;
    this.maxTombstones = 1e3;
  }
  async create(media) {
    assertValidSessionId(media.sessionId, "create");
    this.tombstones.delete(media.id);
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
  async getByIdPublic(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    if (this.tombstones.has(cleanId)) {
      return null;
    }
    const item = this.items.get(cleanId);
    if (!item) return null;
    const publicItem = {
      id: item.id,
      name: item.name,
      originalFileName: item.originalFileName,
      type: item.type,
      mimeType: item.mimeType,
      size: item.size,
      formattedSize: item.formattedSize,
      shareUrl: item.shareUrl,
      uploaderCountryCode: item.uploaderCountryCode,
      uploaderCountryName: item.uploaderCountryName,
      audioMeta: item.audioMeta,
      videoMeta: item.videoMeta,
      imageMeta: item.imageMeta,
      createdAt: item.createdAt,
      isTextPreviewable: item.isTextPreviewable,
      textLanguageHint: item.textLanguageHint
    };
    return publicItem;
  }
  async getTombstone(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    return this.tombstones.get(id.trim()) || null;
  }
  async recordTombstone(id, reason) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return;
    }
    const cleanId = id.trim();
    if (this.tombstones.size >= this.maxTombstones) {
      const oldestKey = this.tombstones.keys().next().value;
      if (oldestKey) this.tombstones.delete(oldestKey);
    }
    this.tombstones.set(cleanId, {
      id: cleanId,
      deletedAt: Date.now(),
      reason
    });
  }
  async delete(id, sessionId) {
    assertValidSessionId(sessionId, "delete");
    const item = this.items.get(id);
    if (!item) return false;
    if (item.sessionId !== sessionId) {
      return false;
    }
    const deleted = this.items.delete(id);
    if (deleted) {
      await this.recordTombstone(id, "USER_DELETED");
    }
    return deleted;
  }
  async clearAll(sessionId) {
    assertValidSessionId(sessionId, "clearAll");
    for (const [id, item] of this.items.entries()) {
      if (item.sessionId === sessionId) {
        this.items.delete(id);
        await this.recordTombstone(id, "USER_CLEARED");
      }
    }
  }
  /**
   * Internal Administrative Method ONLY.
   * Cross-session lookup strictly for authenticated admin controller.
   */
  async getByIdForAdmin(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    const item = this.items.get(id.trim());
    return item ? { ...item } : null;
  }
  /**
   * Internal Administrative Method ONLY.
   * Deletes item from repository across all sessions.
   */
  async deleteForAdmin(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return false;
    }
    const cleanId = id.trim();
    const deleted = this.items.delete(cleanId);
    await this.recordTombstone(cleanId, "ADMIN_DELETED");
    return deleted;
  }
  /**
   * Cleans all mock/test fixture artifacts so automated tests or stale test runs
   * never pollute real development memory.
   */
  clearTestData() {
    for (const id of Array.from(this.items.keys())) {
      if (id.startsWith("test-") || id.startsWith("mock-") || id.startsWith("secret_") || id.startsWith("img_test_") || id.startsWith("audio_test_")) {
        this.items.delete(id);
      }
    }
  }
  resetStore() {
    this.items.clear();
    this.tombstones.clear();
  }
};
var developmentMediaRepository = new DevelopmentMediaRepository();
developmentMediaRepository.clearTestData();

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
  getPublicKey(id) {
    return `public_media:${id}`;
  }
  getIndexKey(sessionId) {
    return `media_idx:${sessionId}`;
  }
  /**
   * Dedicated small mapping key for cross-session admin operations: id -> sessionId.
   * Enables admin to look up and purge items across all sessions without full keyspace scanning.
   */
  getIdToSessionKey(id) {
    return `id_to_session:${id}`;
  }
  getTombstoneKey(id) {
    return `deleted_media:${id}`;
  }
  async getTombstone(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    try {
      const raw = await this.redis.get(this.getTombstoneKey(cleanId));
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
  async recordTombstone(id, reason) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return;
    }
    const cleanId = id.trim();
    const tombstone = {
      id: cleanId,
      deletedAt: Date.now(),
      reason
    };
    try {
      await this.redis.set(this.getTombstoneKey(cleanId), JSON.stringify(tombstone), {
        ex: 14 * 24 * 60 * 60
      });
    } catch {
    }
  }
  async create(media) {
    assertValidSessionId2(media.sessionId, "create");
    const sessionId = media.sessionId;
    const itemKey = this.getItemKey(sessionId, media.id);
    const publicKey = this.getPublicKey(media.id);
    const indexKey = this.getIndexKey(sessionId);
    const idToSessionKey = this.getIdToSessionKey(media.id);
    const publicMedia = {
      id: media.id,
      name: media.name,
      originalFileName: media.originalFileName,
      type: media.type,
      mimeType: media.mimeType,
      size: media.size,
      formattedSize: media.formattedSize,
      shareUrl: media.shareUrl,
      uploaderCountryCode: media.uploaderCountryCode,
      uploaderCountryName: media.uploaderCountryName,
      audioMeta: media.audioMeta,
      videoMeta: media.videoMeta,
      imageMeta: media.imageMeta,
      createdAt: media.createdAt,
      isTextPreviewable: media.isTextPreviewable,
      textLanguageHint: media.textLanguageHint
    };
    const pipeline = this.redis.pipeline();
    pipeline.set(itemKey, JSON.stringify(media));
    pipeline.set(publicKey, JSON.stringify(publicMedia));
    pipeline.set(idToSessionKey, sessionId);
    pipeline.zadd(indexKey, { score: media.createdAt, member: media.id });
    pipeline.expire(itemKey, 30 * 24 * 60 * 60);
    pipeline.expire(publicKey, 30 * 24 * 60 * 60);
    pipeline.expire(idToSessionKey, 30 * 24 * 60 * 60);
    pipeline.expire(indexKey, 30 * 24 * 60 * 60);
    const tombstoneKey = this.getTombstoneKey(media.id);
    pipeline.del(tombstoneKey);
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
  async getByIdPublic(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    const tombstone = await this.getTombstone(cleanId);
    if (tombstone) {
      return null;
    }
    const publicKey = this.getPublicKey(cleanId);
    const raw = await this.redis.get(publicKey);
    let publicMedia = null;
    if (raw) {
      try {
        publicMedia = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        publicMedia = null;
      }
    }
    if (publicMedia && (!publicMedia.uploaderCountryCode || !publicMedia.createdAt)) {
      try {
        const fullRaw = await this.redis.get(`stats:media_obj:${cleanId}`);
        if (fullRaw) {
          const full = typeof fullRaw === "string" ? JSON.parse(fullRaw) : fullRaw;
          if (full && typeof full === "object") {
            if (!publicMedia.uploaderCountryCode && full.uploaderCountryCode) {
              publicMedia.uploaderCountryCode = full.uploaderCountryCode;
              publicMedia.uploaderCountryName = full.uploaderCountryName;
            }
            if ((!publicMedia.createdAt || isNaN(publicMedia.createdAt)) && full.createdAt) {
              publicMedia.createdAt = full.createdAt;
            }
            if (!publicMedia.audioMeta && full.audioMeta && full.type === "audio") {
              publicMedia.audioMeta = full.audioMeta;
            }
            if (!publicMedia.videoMeta && full.videoMeta && full.type === "video") {
              publicMedia.videoMeta = full.videoMeta;
            }
            if (!publicMedia.imageMeta && full.imageMeta && full.type === "image") {
              publicMedia.imageMeta = full.imageMeta;
            }
            if (publicMedia.isTextPreviewable === void 0 && full.isTextPreviewable !== void 0) {
              publicMedia.isTextPreviewable = full.isTextPreviewable;
              publicMedia.textLanguageHint = full.textLanguageHint;
            }
          }
        }
      } catch {
      }
    }
    return publicMedia;
  }
  async delete(id, sessionId) {
    assertValidSessionId2(sessionId, "delete");
    const cleanId = id.trim();
    const itemKey = this.getItemKey(sessionId, cleanId);
    const publicKey = this.getPublicKey(cleanId);
    const indexKey = this.getIndexKey(sessionId);
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const tombstoneKey = this.getTombstoneKey(cleanId);
    const tombstoneData = {
      id: cleanId,
      deletedAt: Date.now(),
      reason: "USER_DELETED"
    };
    const pipeline = this.redis.pipeline();
    pipeline.del(itemKey);
    pipeline.del(publicKey);
    pipeline.del(idToSessionKey);
    pipeline.del(`stats:media_obj:${cleanId}`);
    pipeline.zrem(indexKey, cleanId);
    pipeline.zrem("stats:recent_uploads", cleanId);
    if (typeof pipeline.set === "function") {
      pipeline.set(tombstoneKey, JSON.stringify(tombstoneData), { ex: 14 * 24 * 60 * 60 });
    }
    const results = await pipeline.exec();
    if (typeof pipeline.set !== "function") {
      this.recordTombstone(cleanId, "USER_DELETED").catch(() => {
      });
    }
    const delCount = results[0];
    return typeof delCount === "number" && delCount > 0;
  }
  async clearAll(sessionId) {
    assertValidSessionId2(sessionId, "clearAll");
    const indexKey = this.getIndexKey(sessionId);
    const ids = await this.redis.zrange(indexKey, 0, -1);
    const pipeline = this.redis.pipeline();
    if (ids && ids.length > 0) {
      const now = Date.now();
      ids.forEach((id) => {
        const cleanId = id.trim();
        pipeline.del(this.getItemKey(sessionId, cleanId));
        pipeline.del(this.getPublicKey(cleanId));
        pipeline.del(this.getIdToSessionKey(cleanId));
        pipeline.del(`stats:media_obj:${cleanId}`);
        pipeline.zrem("stats:recent_uploads", cleanId);
        if (typeof pipeline.set === "function") {
          pipeline.set(
            this.getTombstoneKey(cleanId),
            JSON.stringify({ id: cleanId, deletedAt: now, reason: "USER_CLEARED" }),
            { ex: 14 * 24 * 60 * 60 }
          );
        }
      });
    }
    pipeline.del(indexKey);
    await pipeline.exec();
  }
  /**
   * Internal Administrative Method ONLY.
   * Looks up a media item across all sessions using the explicit id_to_session mapping,
   * falling back to public_media and stats:media_obj for legacy entries.
   */
  async getByIdForAdmin(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const sessionId = await this.redis.get(idToSessionKey);
    if (sessionId) {
      const itemKey = this.getItemKey(sessionId, cleanId);
      const raw = await this.redis.get(itemKey);
      if (raw) {
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
        }
      }
    }
    const publicKey = this.getPublicKey(cleanId);
    const pubRaw = await this.redis.get(publicKey);
    if (pubRaw) {
      try {
        const pub = typeof pubRaw === "string" ? JSON.parse(pubRaw) : pubRaw;
        if (pub) {
          return {
            ...pub,
            sessionId: sessionId || "admin_recovered_session"
          };
        }
      } catch {
      }
    }
    const statsRaw = await this.redis.get(`stats:media_obj:${cleanId}`);
    if (statsRaw) {
      try {
        const statsObj = typeof statsRaw === "string" ? JSON.parse(statsRaw) : statsRaw;
        if (statsObj) {
          return {
            ...statsObj,
            sessionId: sessionId || "admin_recovered_session"
          };
        }
      } catch {
      }
    }
    return null;
  }
  /**
   * Internal Administrative Method ONLY.
   * Permanently deletes all Redis keys for an item across all sessions, indices, and lookups.
   */
  async deleteForAdmin(id) {
    if (!id || typeof id !== "string" || !id.trim()) {
      return false;
    }
    const cleanId = id.trim();
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const sessionId = await this.redis.get(idToSessionKey);
    const tombstoneKey = this.getTombstoneKey(cleanId);
    const tombstoneData = {
      id: cleanId,
      deletedAt: Date.now(),
      reason: "ADMIN_DELETED"
    };
    const pipeline = this.redis.pipeline();
    pipeline.del(this.getPublicKey(cleanId));
    pipeline.del(idToSessionKey);
    pipeline.del(`stats:media_obj:${cleanId}`);
    pipeline.zrem("stats:recent_uploads", cleanId);
    if (typeof pipeline.set === "function") {
      pipeline.set(tombstoneKey, JSON.stringify(tombstoneData), { ex: 14 * 24 * 60 * 60 });
    }
    if (sessionId) {
      pipeline.del(this.getItemKey(sessionId, cleanId));
      pipeline.zrem(this.getIndexKey(sessionId), cleanId);
    }
    const results = await pipeline.exec();
    if (typeof pipeline.set !== "function") {
      this.recordTombstone(cleanId, "ADMIN_DELETED").catch(() => {
      });
    }
    return results.some((r) => typeof r === "number" && r > 0);
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
async function checkRedisHealth() {
  if (!isUpstashConfigured()) {
    return {
      configured: false,
      connected: false,
      latencyMs: null
    };
  }
  const client = getRedisClient();
  if (!client) {
    return {
      configured: true,
      connected: false,
      latencyMs: null
    };
  }
  const start = Date.now();
  try {
    const pingPromise = client.ping();
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Redis ping timeout")), 2e3)
    );
    const res = await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;
    const isConnected = res === "PONG" || res === "pong" || Boolean(res);
    return {
      configured: true,
      connected: isConnected,
      latencyMs: isConnected ? latencyMs : null
    };
  } catch {
    return {
      configured: true,
      connected: false,
      latencyMs: null
    };
  }
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

// src/server/repository/deleted-files-repository.ts
var DELETED_FILES_INDEX = "stats:deleted_files_index";
var DELETED_FILE_PREFIX = "stats:deleted_file_obj:";
var MAX_DELETED_RECORDS = 500;
var RETENTION_SECONDS = 30 * 24 * 60 * 60;
var InMemoryDeletedFilesStore = class {
  constructor() {
    this.records = [];
  }
  record(file) {
    this.records = this.records.filter((r) => r.id !== file.id);
    this.records.unshift(file);
    if (this.records.length > MAX_DELETED_RECORDS) {
      this.records = this.records.slice(0, MAX_DELETED_RECORDS);
    }
  }
  get(limit = 100) {
    return this.records.slice(0, limit);
  }
  clear() {
    const count = this.records.length;
    this.records = [];
    return count;
  }
  isDeleted(id) {
    return this.records.some((r) => r.id === id);
  }
};
var inMemoryStore = new InMemoryDeletedFilesStore();
var DeletedFilesRepository = class {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }
  getRedis() {
    if (this.redisClient !== void 0) {
      return this.redisClient;
    }
    if (isUpstashConfigured()) {
      return getRedisClient();
    }
    return null;
  }
  /**
   * Records a deleted file in the isolated Deleted Files archive.
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   */
  async recordDeleted(file) {
    try {
      inMemoryStore.record(file);
      const redis = this.getRedis();
      if (!redis) return;
      const pipeline = redis.pipeline();
      const objKey = `${DELETED_FILE_PREFIX}${file.id}`;
      pipeline.zadd(DELETED_FILES_INDEX, { score: file.deletedAt, member: file.id });
      pipeline.set(objKey, JSON.stringify(file));
      pipeline.expire(objKey, RETENTION_SECONDS);
      await pipeline.exec();
    } catch (err) {
      console.warn("[DELETED_FILES_RECORD_ERROR] Fail-open:", err);
    }
  }
  /**
   * Retrieves the list of deleted files for the dedicated Admin "Berkas Terhapus" tab.
   */
  async getDeletedFiles(limit = 100) {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.get(limit);
    }
    try {
      const ids = await redis.zrange(DELETED_FILES_INDEX, 0, limit - 1, { rev: true });
      if (!ids || ids.length === 0) {
        return inMemoryStore.get(limit);
      }
      const keys = ids.map((id) => `${DELETED_FILE_PREFIX}${id}`);
      const rawObjects = await redis.mget(...keys);
      const result = [];
      rawObjects.forEach((raw, idx) => {
        if (raw) {
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            result.push(parsed);
          } catch {
          }
        } else {
          const mem = inMemoryStore.get(limit).find((r) => r.id === ids[idx]);
          if (mem) result.push(mem);
        }
      });
      return result;
    } catch (err) {
      console.warn("[DELETED_FILES_GET_ERROR] Fallback to in-memory:", err);
      return inMemoryStore.get(limit);
    }
  }
  /**
   * Clears all deletion log records from the archive.
   */
  async clearAll() {
    inMemoryStore.clear();
    const redis = this.getRedis();
    if (!redis) return 0;
    try {
      const ids = await redis.zrange(DELETED_FILES_INDEX, 0, -1);
      if (ids && ids.length > 0) {
        const keys = ids.map((id) => `${DELETED_FILE_PREFIX}${id}`);
        const pipeline = redis.pipeline();
        pipeline.del(DELETED_FILES_INDEX);
        for (const k of keys) {
          pipeline.del(k);
        }
        await pipeline.exec();
        return ids.length;
      }
      return 0;
    } catch (err) {
      console.warn("[DELETED_FILES_CLEAR_ERROR]:", err);
      return 0;
    }
  }
  /**
   * Checks whether a file ID is archived as deleted.
   */
  async isDeleted(id) {
    if (!id) return false;
    if (inMemoryStore.isDeleted(id)) return true;
    const redis = this.getRedis();
    if (!redis) return false;
    try {
      const score = await redis.zscore(DELETED_FILES_INDEX, id);
      return score !== null && score !== void 0;
    } catch {
      return false;
    }
  }
};
var deletedFilesRepository = new DeletedFilesRepository();

// src/server/repository/analytics-repository.ts
var STATS_TTL_SECONDS = 90 * 24 * 60 * 60;
var TOTAL_ITEMS_KEY = "stats:total_items_ever";
function isTestArtifactId(id) {
  if (!id || typeof id !== "string") return false;
  const lower = id.toLowerCase().trim();
  return lower.startsWith("test-") || lower.startsWith("mock-") || lower.startsWith("secret_") || lower.startsWith("img_test_") || lower.startsWith("audio_test_") || lower.startsWith("test_") || lower.includes("test-admin-file") || lower.includes("test-note") || lower.includes("test-del");
}
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function getTodayDateString(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().slice(0, 10);
}
function toPublicMediaView(item) {
  const publicView = {
    id: item.id,
    name: item.name,
    originalFileName: item.originalFileName,
    type: item.type,
    mimeType: item.mimeType,
    size: item.size,
    formattedSize: item.formattedSize,
    shareUrl: item.shareUrl,
    uploaderCountryCode: item.uploaderCountryCode,
    uploaderCountryName: item.uploaderCountryName,
    createdAt: item.createdAt
  };
  if (item.audioMeta) publicView.audioMeta = item.audioMeta;
  if (item.videoMeta) publicView.videoMeta = item.videoMeta;
  if (item.imageMeta) publicView.imageMeta = item.imageMeta;
  if (item.isTextPreviewable !== void 0) publicView.isTextPreviewable = item.isTextPreviewable;
  if (item.textLanguageHint) publicView.textLanguageHint = item.textLanguageHint;
  return publicView;
}
var InMemoryAnalyticsStore = class {
  constructor() {
    this.uploadsByDate = /* @__PURE__ */ new Map();
    this.bytesByDate = /* @__PURE__ */ new Map();
    this.viewsByDate = /* @__PURE__ */ new Map();
    this.byTypeByDate = /* @__PURE__ */ new Map();
    this.byCountryByDate = /* @__PURE__ */ new Map();
    this.fileViews = /* @__PURE__ */ new Map();
    this.recentUploads = [];
    this.totalItemsEver = 0;
  }
  recordUpload(item) {
    const today = getTodayDateString();
    this.uploadsByDate.set(today, (this.uploadsByDate.get(today) || 0) + 1);
    this.bytesByDate.set(today, (this.bytesByDate.get(today) || 0) + item.size);
    if (!this.byTypeByDate.has(today)) this.byTypeByDate.set(today, /* @__PURE__ */ new Map());
    const typeMap = this.byTypeByDate.get(today);
    typeMap.set(item.type, (typeMap.get(item.type) || 0) + 1);
    const country = item.uploaderCountryCode || "UNKNOWN";
    if (!this.byCountryByDate.has(today)) this.byCountryByDate.set(today, /* @__PURE__ */ new Map());
    const countryMap = this.byCountryByDate.get(today);
    countryMap.set(country, (countryMap.get(country) || 0) + 1);
    this.totalItemsEver += 1;
    const publicItem = toPublicMediaView(item);
    this.recentUploads.unshift(publicItem);
    if (this.recentUploads.length > 100) {
      this.recentUploads = this.recentUploads.slice(0, 100);
    }
  }
  recordDeletion(count = 1) {
    this.totalItemsEver = Math.max(0, this.totalItemsEver - count);
  }
  removeRecentUpload(id) {
    this.recentUploads = this.recentUploads.filter((item) => item.id !== id);
  }
  removeFileFromAllStats(id) {
    this.fileViews.delete(id);
    this.recentUploads = this.recentUploads.filter((item) => item.id !== id);
  }
  resetStore() {
    this.uploadsByDate.clear();
    this.bytesByDate.clear();
    this.viewsByDate.clear();
    this.byTypeByDate.clear();
    this.byCountryByDate.clear();
    this.fileViews.clear();
    this.recentUploads = [];
    this.totalItemsEver = 0;
  }
  purgeTestAndOrphanItems() {
    this.recentUploads = this.recentUploads.filter((item) => !isTestArtifactId(item.id));
    for (const id of Array.from(this.fileViews.keys())) {
      if (isTestArtifactId(id)) {
        this.fileViews.delete(id);
      }
    }
  }
  getTotalItemsEver() {
    return this.totalItemsEver;
  }
  recordShareView(id) {
    const today = getTodayDateString();
    this.fileViews.set(id, (this.fileViews.get(id) || 0) + 1);
    this.viewsByDate.set(today, (this.viewsByDate.get(today) || 0) + 1);
  }
  getDailySummary(date) {
    const uploads = this.uploadsByDate.get(date) || 0;
    const bytes = this.bytesByDate.get(date) || 0;
    const totalViews = this.viewsByDate.get(date) || 0;
    const byTypeRecord = {};
    const typeMap = this.byTypeByDate.get(date);
    if (typeMap) {
      typeMap.forEach((v, k) => {
        byTypeRecord[k] = v;
      });
    }
    const byCountryRecord = {};
    const countryMap = this.byCountryByDate.get(date);
    if (countryMap) {
      countryMap.forEach((v, k) => {
        byCountryRecord[k] = v;
      });
    }
    const averageFileSize = uploads > 0 ? Math.round(bytes / uploads) : 0;
    return {
      date,
      uploads,
      bytes,
      formattedBytes: formatBytes(bytes),
      totalViews,
      averageFileSize,
      formattedAverageSize: formatBytes(averageFileSize),
      byType: byTypeRecord,
      byCountry: byCountryRecord
    };
  }
  getTopFiles(limit) {
    const sorted = Array.from(this.fileViews.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
    return sorted.map(([id, views]) => ({ id, views }));
  }
  getWeeklyTrend() {
    const result = [];
    const now = /* @__PURE__ */ new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getTodayDateString(d);
      const uploads = this.uploadsByDate.get(dateStr) || 0;
      const bytes = this.bytesByDate.get(dateStr) || 0;
      const views = this.viewsByDate.get(dateStr) || 0;
      result.push({
        date: dateStr,
        uploads,
        bytes,
        formattedBytes: formatBytes(bytes),
        views
      });
    }
    return result;
  }
  getViewCount(id) {
    return this.fileViews.get(id) || 0;
  }
  getRecentUploads(limit) {
    return this.recentUploads.slice(0, limit);
  }
};
var inMemoryStore2 = new InMemoryAnalyticsStore();
var AnalyticsRepository = class {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }
  getRedis() {
    if (this.redisClient !== void 0) {
      return this.redisClient;
    }
    if (isUpstashConfigured()) {
      return getRedisClient();
    }
    return null;
  }
  /**
   * Records upload event metrics in Redis (or in-memory fallback).
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   * STRICT SECURITY: Saves only safe PublicMediaView without sessionId.
   */
  async recordUpload(item) {
    try {
      inMemoryStore2.recordUpload(item);
      const redis = this.getRedis();
      if (!redis) return;
      const today = getTodayDateString();
      const countryCode = item.uploaderCountryCode || "UNKNOWN";
      const publicView = toPublicMediaView(item);
      const pipeline = redis.pipeline();
      const uploadKey = `stats:uploads:${today}`;
      const bytesKey = `stats:bytes:${today}`;
      const typeKey = `stats:by_type:${today}`;
      const countryKey = `stats:by_country:${today}`;
      const recentIndexKey = "stats:recent_uploads";
      const recentDataKey = `stats:media_obj:${item.id}`;
      pipeline.incr(uploadKey);
      pipeline.incrby(bytesKey, item.size);
      pipeline.hincrby(typeKey, item.type, 1);
      pipeline.hincrby(countryKey, countryCode, 1);
      pipeline.incr(TOTAL_ITEMS_KEY);
      pipeline.zadd(recentIndexKey, { score: item.createdAt, member: item.id });
      pipeline.set(recentDataKey, JSON.stringify(publicView));
      pipeline.expire(uploadKey, STATS_TTL_SECONDS);
      pipeline.expire(bytesKey, STATS_TTL_SECONDS);
      pipeline.expire(typeKey, STATS_TTL_SECONDS);
      pipeline.expire(countryKey, STATS_TTL_SECONDS);
      pipeline.expire(recentDataKey, STATS_TTL_SECONDS);
      await pipeline.exec();
    } catch (err) {
      console.warn("[ANALYTICS_RECORD_UPLOAD_ERROR] Gagal mencatat analitik upload, fail-open:", err);
    }
  }
  /**
   * Records deletion event to keep cumulative count accurate.
   * Fail-safe: errors do not disrupt caller.
   */
  async recordDeletion(count = 1) {
    try {
      inMemoryStore2.recordDeletion(count);
      const redis = this.getRedis();
      if (!redis) return;
      const current = await redis.get(TOTAL_ITEMS_KEY);
      const currentNum = Number(current) || 0;
      const nextNum = Math.max(0, currentNum - count);
      await redis.set(TOTAL_ITEMS_KEY, nextNum);
    } catch (err) {
      console.warn("[ANALYTICS_RECORD_DELETION_ERROR] Gagal mencatat analitik deletion, fail-open:", err);
    }
  }
  /**
   * Immediately purges an item from recent uploads cache in Redis and memory.
   */
  async removeRecentUpload(id) {
    await this.removeFileFromAllStats(id);
  }
  /**
   * Completely purges a file from all analytics sets (recent uploads, popular files, cached media objects, views).
   */
  async removeFileFromAllStats(id) {
    try {
      inMemoryStore2.removeFileFromAllStats(id);
      const redis = this.getRedis();
      if (!redis) return;
      const pipeline = redis.pipeline();
      pipeline.zrem("stats:recent_uploads", id);
      pipeline.zrem("stats:popular_files", id);
      pipeline.del(`stats:media_obj:${id}`);
      pipeline.del(`stats:views:${id}`);
      await pipeline.exec();
    } catch (err) {
      console.warn("[ANALYTICS_REMOVE_ALL_STATS_ERROR] Fail-open:", err);
    }
  }
  /**
   * Returns the cumulative total of items currently stored.
   */
  async getTotalItemsEver() {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore2.getTotalItemsEver();
    }
    try {
      const val = await redis.get(TOTAL_ITEMS_KEY);
      if (val !== null && val !== void 0) {
        return Math.max(0, Number(val) || 0);
      }
      const count = await redis.zcard("stats:recent_uploads");
      if (count > 0) {
        await redis.set(TOTAL_ITEMS_KEY, count);
        return count;
      }
      return inMemoryStore2.getTotalItemsEver();
    } catch (err) {
      console.warn("[ANALYTICS_GET_TOTAL_ITEMS_ERROR] Gagal membaca total items ever:", err);
      return inMemoryStore2.getTotalItemsEver();
    }
  }
  /**
   * Records share view event metrics.
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   */
  async recordShareView(id) {
    try {
      inMemoryStore2.recordShareView(id);
      const redis = this.getRedis();
      if (!redis) return;
      const today = getTodayDateString();
      const pipeline = redis.pipeline();
      const viewsKey = `stats:views:${id}`;
      const popularKey = "stats:popular_files";
      const totalViewsKey = `stats:total_views:${today}`;
      pipeline.incr(viewsKey);
      pipeline.zincrby(popularKey, 1, id);
      pipeline.incr(totalViewsKey);
      pipeline.expire(totalViewsKey, STATS_TTL_SECONDS);
      await pipeline.exec();
    } catch (err) {
      console.warn("[ANALYTICS_RECORD_VIEW_ERROR] Gagal mencatat analitik view, fail-open:", err);
    }
  }
  /**
   * Retrieves summary metrics for a given date using Redis pipeline.
   */
  async getDailySummary(date) {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore2.getDailySummary(date);
    }
    try {
      const uploadKey = `stats:uploads:${date}`;
      const bytesKey = `stats:bytes:${date}`;
      const totalViewsKey = `stats:total_views:${date}`;
      const typeKey = `stats:by_type:${date}`;
      const countryKey = `stats:by_country:${date}`;
      const pipeline = redis.pipeline();
      pipeline.get(uploadKey);
      pipeline.get(bytesKey);
      pipeline.get(totalViewsKey);
      pipeline.hgetall(typeKey);
      pipeline.hgetall(countryKey);
      const results = await pipeline.exec();
      const uploads = Number(results[0]) || 0;
      const bytes = Number(results[1]) || 0;
      const totalViews = Number(results[2]) || 0;
      const rawTypes = results[3] || {};
      const rawCountries = results[4] || {};
      const byType = {};
      for (const [k, v] of Object.entries(rawTypes)) {
        byType[k] = Number(v) || 0;
      }
      const byCountry = {};
      for (const [k, v] of Object.entries(rawCountries)) {
        byCountry[k] = Number(v) || 0;
      }
      const averageFileSize = uploads > 0 ? Math.round(bytes / uploads) : 0;
      return {
        date,
        uploads,
        bytes,
        formattedBytes: formatBytes(bytes),
        totalViews,
        averageFileSize,
        formattedAverageSize: formatBytes(averageFileSize),
        byType,
        byCountry
      };
    } catch (err) {
      console.warn("[ANALYTICS_GET_DAILY_ERROR] Gagal membaca ringkasan harian Redis, fallback in-memory:", err);
      return inMemoryStore2.getDailySummary(date);
    }
  }
  /**
   * Retrieves top most viewed files from Redis sorted set.
   * STRICT FILTER: Excludes test artifacts and deleted files.
   */
  async getTopFiles(limit = 10) {
    const redis = this.getRedis();
    if (!redis) {
      const memFiles = inMemoryStore2.getTopFiles(limit);
      const filtered = [];
      for (const f of memFiles) {
        if (!await deletedFilesRepository.isDeleted(f.id)) {
          filtered.push(f);
        }
      }
      return filtered;
    }
    try {
      const rawResults = await redis.zrange("stats:popular_files", 0, limit * 3 - 1, {
        rev: true,
        withScores: true
      });
      const items = [];
      if (Array.isArray(rawResults)) {
        for (let i = 0; i < rawResults.length; i += 2) {
          const entry = rawResults[i];
          let id = "";
          let score = 0;
          if (typeof entry === "object" && entry !== null && "member" in entry) {
            const obj = entry;
            id = String(obj.member);
            score = Number(obj.score) || 0;
          } else {
            id = String(entry);
            score = Number(rawResults[i + 1]) || 0;
          }
          if (id) {
            const isDeleted = await deletedFilesRepository.isDeleted(id);
            if (!isDeleted) {
              items.push({ id, views: score });
              if (items.length >= limit) break;
            }
          }
        }
      }
      return items;
    } catch (err) {
      console.warn("[ANALYTICS_GET_TOP_FILES_ERROR] Gagal membaca top files dari Redis, fallback in-memory:", err);
      return inMemoryStore2.getTopFiles(limit);
    }
  }
  /**
   * Retrieves 7-day trend metrics for chart display.
   */
  async getWeeklyTrend() {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore2.getWeeklyTrend();
    }
    try {
      const dates = [];
      const now = /* @__PURE__ */ new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(getTodayDateString(d));
      }
      const pipeline = redis.pipeline();
      for (const d of dates) {
        pipeline.get(`stats:uploads:${d}`);
        pipeline.get(`stats:bytes:${d}`);
        pipeline.get(`stats:total_views:${d}`);
      }
      const results = await pipeline.exec();
      const trend = [];
      for (let i = 0; i < dates.length; i++) {
        const uploads = Number(results[i * 3]) || 0;
        const bytes = Number(results[i * 3 + 1]) || 0;
        const views = Number(results[i * 3 + 2]) || 0;
        trend.push({
          date: dates[i],
          uploads,
          bytes,
          formattedBytes: formatBytes(bytes),
          views
        });
      }
      return trend;
    } catch (err) {
      console.warn("[ANALYTICS_GET_WEEKLY_TREND_ERROR] Gagal membaca tren mingguan dari Redis, fallback in-memory:", err);
      return inMemoryStore2.getWeeklyTrend();
    }
  }
  /**
   * Retrieves total view count for a specific file ID.
   */
  async getViewCount(id) {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore2.getViewCount(id);
    }
    try {
      const val = await redis.get(`stats:views:${id}`);
      return Number(val) || 0;
    } catch (err) {
      console.warn("[ANALYTICS_GET_VIEW_COUNT_ERROR] Gagal membaca view count file:", err);
      return inMemoryStore2.getViewCount(id);
    }
  }
  /**
   * Retrieves recent 50 uploads across all sessions for admin monitoring.
   * STRICT SECURITY: Returns only PublicMediaView objects (never exposes sessionId).
   * STRICT FILTER: Excludes test artifacts and deleted files.
   */
  async getRecentUploads(limit = 50) {
    const redis = this.getRedis();
    if (!redis) {
      const memUploads = inMemoryStore2.getRecentUploads(limit);
      const filtered = [];
      for (const m of memUploads) {
        if (!await deletedFilesRepository.isDeleted(m.id)) {
          filtered.push(m);
        }
      }
      return filtered;
    }
    try {
      const recentIds = await redis.zrange("stats:recent_uploads", 0, limit * 2 - 1, {
        rev: true
      });
      if (!recentIds || recentIds.length === 0) {
        return inMemoryStore2.getRecentUploads(limit);
      }
      const validIds = [];
      for (const id of recentIds) {
        const isDeleted = await deletedFilesRepository.isDeleted(id);
        if (!isDeleted) {
          validIds.push(id);
          if (validIds.length >= limit) break;
        }
      }
      if (validIds.length === 0) {
        return [];
      }
      const keys = validIds.map((id) => `stats:media_obj:${id}`);
      const rawObjects = await redis.mget(...keys);
      const items = [];
      rawObjects.forEach((raw, idx) => {
        if (raw) {
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            const sanitized = toPublicMediaView(parsed);
            items.push(sanitized);
          } catch {
          }
        } else {
          const fallback = inMemoryStore2.recentUploads.find((m) => m.id === validIds[idx]);
          if (fallback) items.push(fallback);
        }
      });
      return items;
    } catch (err) {
      console.warn("[ANALYTICS_GET_RECENT_UPLOADS_ERROR] Gagal mengambil recent uploads:", err);
      return inMemoryStore2.getRecentUploads(limit);
    }
  }
  /**
   * Cleans all mock/test fixture artifacts so automated tests or stale test runs
   * never pollute real production statistics, top files, or recent upload tables.
   */
  async purgeTestData() {
    inMemoryStore2.purgeTestAndOrphanItems();
    const redis = this.getRedis();
    if (!redis) return;
    try {
      const recentIds = await redis.zrange("stats:recent_uploads", 0, 500);
      if (recentIds && Array.isArray(recentIds)) {
        for (const id of recentIds) {
          if (isTestArtifactId(id)) {
            await this.removeFileFromAllStats(id);
          }
        }
      }
      const popularIds = await redis.zrange("stats:popular_files", 0, 500);
      if (popularIds && Array.isArray(popularIds)) {
        for (const id of popularIds) {
          if (isTestArtifactId(id)) {
            await this.removeFileFromAllStats(id);
          }
        }
      }
      const explicitTestIds = [
        "test-admin-file-01.png",
        "test-note.txt",
        "test-del.jpg",
        "test-admin-del-123.jpg",
        "img_test_1.png",
        "test_sec_media_1.png",
        "test_sec_media_2.png",
        "test-file-1.png",
        "test-file-2.png"
      ];
      for (const tid of explicitTestIds) {
        await this.removeFileFromAllStats(tid);
      }
    } catch {
    }
  }
  /**
   * Complete test-only store reset for isolated integration test suites.
   */
  async resetForTesting() {
    inMemoryStore2.resetStore();
    const redis = this.getRedis();
    if (!redis) return;
    try {
      await redis.del("stats:recent_uploads");
      await redis.del("stats:popular_files");
      await redis.del("stats:total_items_ever");
    } catch {
    }
  }
};
var analyticsRepository = new AnalyticsRepository();
analyticsRepository.purgeTestData().catch(() => {
});

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
  "iso"
];
var BANNED_EXTENSIONS = new Set(BANNED_EXTENSIONS_LIST);

// src/server/security/input-validator.ts
var ALLOWED_FILE_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/rtf",
  "application/xml",
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/markdown",
  "text/x-markdown",
  "text/xml",
  "text/x-yaml",
  "text/yaml",
  "application/json",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql"
]);
function isAllowedGenericFileMime(mime) {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  if (ALLOWED_FILE_MIME_TYPES.has(lower)) return true;
  if (lower.startsWith("text/")) return true;
  if (lower.startsWith("application/vnd.openxmlformats-officedocument.")) return true;
  return false;
}
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
  if (mime.includes("zip") || mime.includes("openxmlformats")) {
    return headerHex.startsWith("504b0304") || headerHex.startsWith("504b0506");
  }
  if (mime.includes("rar")) {
    return headerHex.startsWith("526172211a07");
  }
  if (mime.includes("7z")) {
    return headerHex.startsWith("377abcaf271c");
  }
  if (mime.includes("gzip") || mime.includes("tar+gzip")) {
    return headerHex.startsWith("1f8b");
  }
  if (mime.includes("pdf")) {
    return headerHex.startsWith("25504446");
  }
  if (mime.includes("msword")) {
    return headerHex.startsWith("d0cf11e0a1b11ae1");
  }
  if (mime.includes("tar")) {
    if (buffer.length >= 262 && buffer.subarray(257, 262).toString("ascii") === "ustar") {
      return true;
    }
    return buffer.length >= 512;
  }
  if (mime.includes("text") || mime.includes("csv") || mime.includes("json") || mime.includes("xml") || mime.includes("yaml") || mime.includes("toml") || mime.includes("sql")) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
        return false;
      }
    }
    if (mime.includes("json")) {
      const text = sample.toString("utf8").trim();
      return text.startsWith("{") || text.startsWith("[");
    }
    return true;
  }
  const isKnownMedia = headerHex.startsWith("ffd8ff") || headerHex.startsWith("89504e47") || headerHex.startsWith("47494638") || headerHex.startsWith("52494646") || headerHex.startsWith("1a45dfa3") || headerHex.startsWith("494433") || headerHex.startsWith("664c6143") || headerHex.startsWith("4f676753") || headerHex.startsWith("4f676773") || headerHex.startsWith("504b0304") || headerHex.startsWith("504b0506") || headerHex.startsWith("526172211a07") || headerHex.startsWith("377abcaf271c") || headerHex.startsWith("1f8b") || headerHex.startsWith("25504446") || headerHex.startsWith("d0cf11e0a1b11ae1") || buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
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
  else if (isAllowedGenericFileMime(mimeType)) mediaType = "file";
  else {
    const archiveAndDocExts = /* @__PURE__ */ new Set([
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
      "bz2",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "csv",
      "txt",
      "json",
      "xml",
      "md",
      "rtf",
      "log",
      "html",
      "htm",
      "css",
      "scss",
      "sass",
      "less",
      "yaml",
      "yml",
      "toml",
      "sql"
    ]);
    const imageExts = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "heic"]);
    const videoExts = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v"]);
    const audioExts = /* @__PURE__ */ new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"]);
    if (imageExts.has(ext)) mediaType = "image";
    else if (videoExts.has(ext)) mediaType = "video";
    else if (audioExts.has(ext)) mediaType = "audio";
    else if (archiveAndDocExts.has(ext)) mediaType = "file";
  }
  if (!mediaType) {
    return {
      valid: false,
      errorCode: "UNSUPPORTED_MEDIA_TYPE",
      errorMessage: "Tipe berkas tidak didukung. Unggah foto, video, audio, atau dokumen/arsip yang diizinkan."
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

// src/server/security/system-config.ts
var inMemoryConfig = {
  maintenanceMode: false,
  announcement: null,
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || "209715200", 10),
  // default 200MB
  rateLimit: {
    limit: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS_PER_MIN || "20", 10),
    windowMs: 60 * 1e3
  },
  featureFlags: {
    pasteToUpload: true,
    qrCode: true,
    pwaInstallPrompt: true
  }
};
function formatBytes2(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
async function isMaintenanceModeActive() {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get("config:maintenance_mode");
      if (val !== null && val !== void 0) {
        return val === "true" || val === "1";
      }
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal membaca maintenance mode dari Redis, fail-safe false:", err);
    }
  }
  return inMemoryConfig.maintenanceMode;
}
async function setMaintenanceMode(active) {
  inMemoryConfig.maintenanceMode = active;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set("config:maintenance_mode", active ? "true" : "false");
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal menyimpan maintenance mode ke Redis:", err);
    }
  }
}
async function getAnnouncement() {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get("config:announcement");
      if (raw) {
        let parsed = raw;
        while (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === "object") {
          const announcement = {
            message: String(parsed.message || ""),
            type: ["info", "warning", "success"].includes(parsed.type) ? parsed.type : "info",
            enabled: parsed.enabled === true || parsed.enabled === "true",
            updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
          };
          inMemoryConfig.announcement = announcement;
          return announcement;
        }
      }
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal membaca pengumuman dari Redis:", err);
    }
  }
  return inMemoryConfig.announcement;
}
async function setAnnouncement(announcement) {
  const finalAnnouncement = {
    message: String(announcement.message || "").trim(),
    type: ["info", "warning", "success"].includes(announcement.type) ? announcement.type : "info",
    enabled: announcement.enabled === true || announcement.enabled === "true",
    updatedAt: Date.now()
  };
  inMemoryConfig.announcement = finalAnnouncement;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set("config:announcement", JSON.stringify(finalAnnouncement));
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal menyimpan pengumuman ke Redis:", err);
    }
  }
}
async function getMaxUploadSize() {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get("config:max_upload_size");
      if (val !== null && val !== void 0) {
        const num = typeof val === "number" ? val : parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          return num;
        }
      }
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal membaca max_upload_size dari Redis:", err);
    }
  }
  return inMemoryConfig.maxUploadSize;
}
async function setMaxUploadSize(bytes) {
  const MIN_SIZE = 1024 * 1024;
  const MAX_SIZE = 500 * 1024 * 1024;
  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, bytes));
  inMemoryConfig.maxUploadSize = clamped;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set("config:max_upload_size", clamped.toString());
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal menyimpan max_upload_size ke Redis:", err);
    }
  }
}
async function getUploadRateLimit() {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get("config:rate_limit_upload");
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed.limit > 0 && parsed.windowMs > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal membaca rate limit dari Redis:", err);
    }
  }
  return inMemoryConfig.rateLimit;
}
async function setUploadRateLimit(limit, windowMs) {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const safeWindow = Math.max(10 * 1e3, Math.min(3600 * 1e3, windowMs));
  const config2 = { limit: safeLimit, windowMs: safeWindow };
  inMemoryConfig.rateLimit = config2;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set("config:rate_limit_upload", JSON.stringify(config2));
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal menyimpan rate limit ke Redis:", err);
    }
  }
}
async function getFeatureFlags() {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const hash = await redis.hgetall("config:feature_flags");
      if (hash && Object.keys(hash).length > 0) {
        return {
          pasteToUpload: hash.pasteToUpload !== "false",
          qrCode: hash.qrCode !== "false",
          pwaInstallPrompt: hash.pwaInstallPrompt !== "false"
        };
      }
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal membaca feature flags dari Redis:", err);
    }
  }
  return { ...inMemoryConfig.featureFlags };
}
async function setFeatureFlags(flags) {
  const current = await getFeatureFlags();
  const updated = {
    ...current,
    ...flags
  };
  inMemoryConfig.featureFlags = updated;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.hset("config:feature_flags", {
        pasteToUpload: updated.pasteToUpload ? "true" : "false",
        qrCode: updated.qrCode ? "true" : "false",
        pwaInstallPrompt: updated.pwaInstallPrompt ? "true" : "false"
      });
    } catch (err) {
      console.warn("[SYSTEM_CONFIG] Gagal menyimpan feature flags ke Redis:", err);
    }
  }
}
async function getAllSystemConfig() {
  const [maintenanceMode, announcement, maxUploadSize, rateLimit, featureFlags] = await Promise.all([
    isMaintenanceModeActive(),
    getAnnouncement(),
    getMaxUploadSize(),
    getUploadRateLimit(),
    getFeatureFlags()
  ]);
  return {
    maintenanceMode,
    announcement,
    maxUploadSize,
    formattedMaxSize: formatBytes2(maxUploadSize),
    rateLimit,
    featureFlags
  };
}

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

// src/server/security/geo-lookup.ts
function isPrivateOrLocalIp(ip) {
  if (!ip || typeof ip !== "string") return true;
  const clean = ip.trim().replace(/^::ffff:/i, "");
  if (clean === "localhost" || clean === "127.0.0.1" || clean === "::1" || clean === "0.0.0.0" || clean === "unknown-ip") {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(clean) || /^fe80:/i.test(clean)) {
    return true;
  }
  return false;
}
async function lookupCountryFromIp(ip) {
  try {
    if (!ip || isPrivateOrLocalIp(ip)) {
      return null;
    }
    const cleanIp = ip.trim().replace(/^::ffff:/i, "");
    const url = `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,countryCode,country`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e3);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "AirShare-Pro/1.0"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && data.status === "success" && data.countryCode && data.country) {
      return {
        countryCode: String(data.countryCode).toUpperCase(),
        countryName: String(data.country)
      };
    }
    return null;
  } catch {
    return null;
  }
}
function getCountryNameFromCode(countryCode) {
  if (!countryCode || typeof countryCode !== "string") return "";
  const code = countryCode.trim().toUpperCase();
  try {
    const dn = new Intl.DisplayNames(["id", "en"], { type: "region" });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}
async function resolveCountryFromRequest(req, clientIp) {
  const rawCountry = req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"] || req.headers["x-appengine-country"] || req.headers["x-client-country"];
  const headerCountry = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;
  if (typeof headerCountry === "string") {
    const code = headerCountry.trim().toUpperCase();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1") {
      return {
        countryCode: code,
        countryName: getCountryNameFromCode(code)
      };
    }
  }
  if (clientIp && !isPrivateOrLocalIp(clientIp)) {
    const ipGeo = await lookupCountryFromIp(clientIp);
    if (ipGeo) {
      return ipGeo;
    }
  }
  const rawTz = req.headers["x-client-timezone"];
  const tzHeader = Array.isArray(rawTz) ? rawTz[0] : rawTz;
  if (typeof tzHeader === "string" && tzHeader.trim()) {
    const tz = tzHeader.trim().toLowerCase();
    if (tz.includes("jakarta") || tz.includes("pontianak") || tz.includes("makassar") || tz.includes("jayapura") || tz.includes("indonesia")) {
      return { countryCode: "ID", countryName: "Indonesia" };
    }
    if (tz.includes("singapore")) return { countryCode: "SG", countryName: "Singapura" };
    if (tz.includes("kuala_lumpur")) return { countryCode: "MY", countryName: "Malaysia" };
    if (tz.includes("tokyo")) return { countryCode: "JP", countryName: "Jepang" };
    if (tz.includes("bangkok")) return { countryCode: "TH", countryName: "Thailand" };
  }
  return null;
}

// src/shared/text-language-map.ts
var MAX_TEXT_PREVIEW_BYTES = 500 * 1024;
var EXTENSION_LANGUAGE_MAP = {
  // Web
  html: { language: "html", label: "HTML" },
  htm: { language: "html", label: "HTML" },
  css: { language: "css", label: "CSS" },
  scss: { language: "scss", label: "SCSS" },
  sass: { language: "sass", label: "Sass" },
  less: { language: "less", label: "Less" },
  // JavaScript / TypeScript (mapped for language hints)
  js: { language: "javascript", label: "JavaScript" },
  mjs: { language: "javascript", label: "JavaScript" },
  cjs: { language: "javascript", label: "JavaScript" },
  jsx: { language: "javascript", label: "JSX" },
  ts: { language: "typescript", label: "TypeScript" },
  tsx: { language: "typescript", label: "TSX" },
  // Data formats
  json: { language: "json", label: "JSON" },
  xml: { language: "xml", label: "XML" },
  svg: { language: "xml", label: "SVG" },
  yaml: { language: "yaml", label: "YAML" },
  yml: { language: "yaml", label: "YAML" },
  csv: { language: "plaintext", label: "CSV" },
  toml: { language: "ini", label: "TOML" },
  // Scripts & queries (mapped for language hints)
  py: { language: "python", label: "Python" },
  sh: { language: "bash", label: "Bash" },
  bash: { language: "bash", label: "Bash" },
  sql: { language: "sql", label: "SQL" },
  php: { language: "php", label: "PHP" },
  rb: { language: "ruby", label: "Ruby" },
  go: { language: "go", label: "Go" },
  // Documents & logs
  txt: { language: "plaintext", label: "Teks Polos" },
  log: { language: "plaintext", label: "Log" },
  md: { language: "markdown", label: "Markdown" },
  markdown: { language: "markdown", label: "Markdown" }
};
function getFileExtension(filename) {
  if (!filename || typeof filename !== "string") return "";
  const parts = filename.split(".");
  if (parts.length <= 1) return "";
  return parts.pop()?.trim().toLowerCase() || "";
}
function getTextLanguageInfo(filenameOrExt) {
  const ext = filenameOrExt.includes(".") ? getFileExtension(filenameOrExt) : filenameOrExt.toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || { language: "plaintext", label: (ext || "TEKS").toUpperCase() };
}
function getTextLanguageHint(filenameOrExt) {
  return getTextLanguageInfo(filenameOrExt).language;
}
var TEXT_MIME_TYPES = /* @__PURE__ */ new Set([
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/markdown",
  "text/x-markdown",
  "text/xml",
  "text/x-yaml",
  "text/yaml",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/javascript",
  "text/javascript",
  "application/x-javascript"
]);
function isTextPreviewableFile(filename, mimeType, sizeBytes) {
  if (sizeBytes !== void 0 && sizeBytes > MAX_TEXT_PREVIEW_BYTES) {
    return false;
  }
  const ext = getFileExtension(filename);
  const mime = (mimeType || "").toLowerCase();
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) {
    return true;
  }
  if (mime.startsWith("text/") || TEXT_MIME_TYPES.has(mime)) {
    return true;
  }
  return false;
}

// src/server/repository/audit-log-repository.ts
import crypto from "crypto";
var inMemoryLogs = [];
var MAX_LOG_ENTRIES = 500;
var AUDIT_LOG_TTL_SECONDS = 90 * 24 * 3600;
var auditLogRepository = {
  /**
   * Records an admin operational event into the audit log.
   */
  async recordAction(action) {
    const entry = {
      id: crypto.randomBytes(8).toString("hex"),
      type: action.type,
      detail: action.detail,
      ip: action.ip || "127.0.0.1",
      timestamp: action.timestamp || Date.now(),
      adminTokenPreview: action.adminTokenPreview
    };
    inMemoryLogs.unshift(entry);
    if (inMemoryLogs.length > MAX_LOG_ENTRIES) {
      inMemoryLogs.length = MAX_LOG_ENTRIES;
    }
    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const pipeline = redis.pipeline();
        pipeline.lpush("audit_log", JSON.stringify(entry));
        pipeline.ltrim("audit_log", 0, MAX_LOG_ENTRIES - 1);
        pipeline.expire("audit_log", AUDIT_LOG_TTL_SECONDS);
        await pipeline.exec();
      } catch (err) {
        console.warn("[AUDIT_LOG] Gagal menyimpan log aktivitas ke Redis:", err);
      }
    }
  },
  /**
   * Retrieves the most recent audit log entries.
   */
  async getRecentActions(limit = 50) {
    const safeLimit = Math.max(1, Math.min(MAX_LOG_ENTRIES, limit));
    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const rawItems = await redis.lrange("audit_log", 0, safeLimit - 1);
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          return rawItems.map((item) => {
            if (typeof item === "string") {
              try {
                return JSON.parse(item);
              } catch {
                return {
                  id: "unknown",
                  type: "PARSING_ERROR",
                  detail: item,
                  ip: "unknown",
                  timestamp: Date.now()
                };
              }
            }
            return item;
          });
        }
      } catch (err) {
        console.warn("[AUDIT_LOG] Gagal membaca log aktivitas dari Redis, menggunakan fallback in-memory:", err);
      }
    }
    return inMemoryLogs.slice(0, safeLimit);
  }
};

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
    limiter,
    getDynamicLimit
  } = options;
  return async (req, res, next) => {
    const activeLimiter = limiter || getRateLimiter();
    const clientIp = getClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    let effectiveLimit = limit;
    let effectiveWindow = windowMs;
    if (getDynamicLimit) {
      try {
        const dyn = await getDynamicLimit(req);
        if (dyn && dyn.limit > 0 && dyn.windowMs > 0) {
          effectiveLimit = dyn.limit;
          effectiveWindow = dyn.windowMs;
        }
      } catch (err) {
        console.warn("[RATE_LIMIT_DYNAMIC] Gagal memuat dynamic limit, fallback static:", err);
      }
    }
    try {
      const result = await activeLimiter.check(key, effectiveLimit, effectiveWindow);
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
var standardRateLimiter = rateLimitMiddleware({
  limit: 60,
  windowMs: 60 * 1e3,
  keyPrefix: "rl:std"
});

// src/server/telegram/telegram-auth.ts
function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const rawIds = process.env.TELEGRAM_ADMIN_USER_IDS || "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  const adminUserIds = rawIds.split(",").map((idStr) => parseInt(idStr.trim(), 10)).filter((id) => !isNaN(id) && id > 0);
  const enabled = Boolean(botToken.length > 0 && adminUserIds.length > 0);
  return {
    enabled,
    botToken,
    adminUserIds,
    webhookSecret
  };
}
function isAuthorizedTelegramUser(userId) {
  const { enabled, adminUserIds } = getTelegramConfig();
  if (!enabled) return false;
  return adminUserIds.includes(userId);
}
async function handleUnauthorizedAttempt(userId, username) {
  const userLabel = username ? `@${username} (ID: ${userId})` : `ID: ${userId}`;
  await auditLogRepository.recordAction({
    type: "telegram_unauthorized_attempt",
    detail: `Percobaan akses bot Telegram tidak sah oleh pengguna ${userLabel}. Pesan ditolak secara generik.`,
    ip: "telegram-api"
  });
}
async function checkTelegramRateLimit(userId) {
  const limiter = getRateLimiter();
  const key = `telegram_bot:${userId}`;
  const limit = 30;
  const windowMs = 60 * 1e3;
  try {
    const result = await limiter.check(key, limit, windowMs);
    return result.allowed;
  } catch (err) {
    console.warn("[TELEGRAM_RATE_LIMIT] Fail-open on rate limit check:", err);
    return true;
  }
}

// src/server/telegram/telegram-notifier.ts
var lastRedisAlertTime = 0;
var REDIS_ALERT_COOLDOWN_MS = 15 * 60 * 1e3;
function sanitizeForTelegramHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function sendTelegramMessage(chatId, htmlText) {
  const { enabled, botToken } = getTelegramConfig();
  if (!enabled || !botToken) return false;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7e3);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: "HTML",
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[TELEGRAM_NOTIFIER] Gagal mengirim pesan ke chat ${chatId}: HTTP ${res.status} - ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[TELEGRAM_NOTIFIER] Gagal mengirim pesan ke chat ${chatId}:`, err);
    return false;
  }
}
async function sendTelegramAlert(messageHtml) {
  const { enabled, adminUserIds } = getTelegramConfig();
  if (!enabled || adminUserIds.length === 0) return;
  try {
    await Promise.all(
      adminUserIds.map((userId) => sendTelegramMessage(userId, messageHtml))
    );
  } catch (err) {
    console.warn("[TELEGRAM_ALERT_WARN] Gagal broadcast alert ke admin:", err);
  }
}
var sessionUploadCounters = /* @__PURE__ */ new Map();
async function recordUploadAndCheckSpike(sessionId) {
  if (!sessionId) return;
  const now = Date.now();
  const windowMs = 5 * 60 * 1e3;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `spike_upload:${sessionId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 300);
      }
      if (count === 16) {
        await alertUploadSpike(sessionId, count);
      }
      return;
    } catch {
    }
  }
  let entry = sessionUploadCounters.get(sessionId);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 1, windowStart: now, alerted: false };
    sessionUploadCounters.set(sessionId, entry);
  } else {
    entry.count++;
  }
  if (entry.count > 15 && !entry.alerted) {
    entry.alerted = true;
    await alertUploadSpike(sessionId, entry.count);
  }
  if (sessionUploadCounters.size > 1e3) {
    for (const [id, e] of sessionUploadCounters.entries()) {
      if (now - e.windowStart > windowMs) {
        sessionUploadCounters.delete(id);
      }
    }
  }
}
async function alertUploadSpike(sessionId, count) {
  const maskedSession = sessionId && sessionId.length > 8 ? `${sessionId.substring(0, 4)}...${sessionId.substring(sessionId.length - 4)}` : "anon";
  const msg = [
    "\u26A0\uFE0F <b>Terdeteksi lonjakan upload dari satu sesi</b>",
    `Sesi: <code>${sanitizeForTelegramHtml(maskedSession)}</code>`,
    `Jumlah: <b>${count}</b> unggahan dalam 5 menit terakhir.`
  ].join("\n");
  await sendTelegramAlert(msg);
}
async function alertAdminLoginFailed(ip) {
  const cleanIp = sanitizeForTelegramHtml(ip || "127.0.0.1");
  const msg = [
    "\u{1F512} <b>Percobaan login admin gagal berulang terdeteksi</b>",
    `IP Sumber: <code>${cleanIp}</code>`,
    "Status: <b>Rate limiter telah aktif (5x percobaan gagal).</b>"
  ].join("\n");
  await sendTelegramAlert(msg);
}
async function alertMaintenanceModeChanged(active, channel, operatorInfo) {
  const statusText = active ? "\u{1F534} DIAKTIFKAN (Unggahan Ditutup)" : "\u{1F7E2} DINONAKTIFKAN (Layanan Normal)";
  const op = operatorInfo ? `
Operator: <code>${sanitizeForTelegramHtml(operatorInfo)}</code>` : "";
  const msg = [
    `\u{1F6E1}\uFE0F <b>Maintenance Mode Diperbarui</b>`,
    `Status Baru: <b>${statusText}</b>`,
    `Kanal Perubahan: <b>${channel.toUpperCase()}</b>${op}`
  ].join("\n");
  await sendTelegramAlert(msg);
}
async function alertRedisFailure(errorDetail) {
  const now = Date.now();
  if (now - lastRedisAlertTime < REDIS_ALERT_COOLDOWN_MS) {
    return;
  }
  lastRedisAlertTime = now;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const cooldownKey = "telegram_cooldown:redis_failure";
      const existing = await redis.get(cooldownKey);
      if (existing) return;
      await redis.set(cooldownKey, "1", { ex: 900 });
    } catch {
    }
  }
  const msg = [
    "\u26A0\uFE0F <b>Kegagalan Redis Terdeteksi</b>",
    "Sistem beralih ke penyimpanan cadangan in-memory secara darurat.",
    `Detail: <code>${sanitizeForTelegramHtml(errorDetail.slice(0, 200))}</code>`
  ].join("\n");
  await sendTelegramAlert(msg);
}

// src/server/api/media-controller.ts
var storageProvider = new CatboxStorageProvider();
function formatBytes3(bytes) {
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
    const currentMaxSize = await getMaxUploadSize();
    const currentRateLimit = await getUploadRateLimit();
    const response = {
      success: true,
      data: {
        maxUploadSize: currentMaxSize,
        formattedMaxSize: formatBytes3(currentMaxSize),
        provider: storageProvider.name,
        isDeleteSupported: storageProvider.isDeleteSupported(),
        rateLimitUploadsPerMinute: currentRateLimit.limit
      }
    };
    res.json(response);
  },
  /**
   * POST /api/media/upload
   * Receives uploaded file stream, validates strictly, uploads to Catbox, and persists metadata.
   */
  async uploadMedia(req, res) {
    if (await isMaintenanceModeActive()) {
      const err = {
        success: false,
        error: {
          code: "MAINTENANCE_MODE",
          message: "Layanan sedang dalam pemeliharaan. Silakan coba beberapa saat lagi."
        }
      };
      res.status(503).json(err);
      return;
    }
    const mediaRepository = getMediaRepository();
    try {
      const file = req.file;
      const currentMaxSize = await getMaxUploadSize();
      const validation = validateUploadedFile(file, currentMaxSize);
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
            if (mediaType === "image" && parsed.imageMeta) {
              imageMeta = {
                width: typeof parsed.imageMeta.width === "number" ? parsed.imageMeta.width : void 0,
                height: typeof parsed.imageMeta.height === "number" ? parsed.imageMeta.height : void 0
              };
            }
            if (mediaType === "video" && parsed.videoMeta) {
              videoMeta = {
                duration: typeof parsed.videoMeta.duration === "number" ? parsed.videoMeta.duration : void 0,
                width: typeof parsed.videoMeta.width === "number" ? parsed.videoMeta.width : void 0,
                height: typeof parsed.videoMeta.height === "number" ? parsed.videoMeta.height : void 0
              };
            }
            if (mediaType === "audio" && parsed.audioMeta) {
              audioMeta = {
                title: typeof parsed.audioMeta.title === "string" ? parsed.audioMeta.title.slice(0, 150) : void 0,
                artist: typeof parsed.audioMeta.artist === "string" ? parsed.audioMeta.artist.slice(0, 150) : void 0,
                album: typeof parsed.audioMeta.album === "string" ? parsed.audioMeta.album.slice(0, 150) : void 0,
                duration: typeof parsed.audioMeta.duration === "number" ? parsed.audioMeta.duration : void 0,
                coverWidth: typeof parsed.audioMeta.coverWidth === "number" && parsed.audioMeta.coverWidth > 0 ? parsed.audioMeta.coverWidth : void 0,
                coverHeight: typeof parsed.audioMeta.coverHeight === "number" && parsed.audioMeta.coverHeight > 0 ? parsed.audioMeta.coverHeight : void 0,
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
      const clientIp = getClientIp(req);
      const geo = await resolveCountryFromRequest(req, clientIp);
      const uploadResult = await storageProvider.upload(
        file.buffer,
        sanitizedName,
        mimeType
      );
      const isText = mediaType === "file" && isTextPreviewableFile(sanitizedName, mimeType, file.size);
      const textLanguageHint = isText ? getTextLanguageHint(sanitizedName) : void 0;
      const mediaObject = {
        id: uploadResult.id,
        name: sanitizedName,
        originalFileName: originalName.slice(0, 200),
        size: file.size,
        formattedSize: formatBytes3(file.size),
        type: mediaType,
        mimeType,
        shareUrl: uploadResult.url,
        provider: "catbox",
        createdAt: Date.now(),
        sessionId,
        uploaderCountryCode: geo?.countryCode,
        uploaderCountryName: geo?.countryName,
        imageMeta: mediaType === "image" ? imageMeta : void 0,
        videoMeta: mediaType === "video" ? videoMeta : void 0,
        audioMeta: mediaType === "audio" ? audioMeta : void 0,
        isTextPreviewable: isText,
        textLanguageHint
      };
      await mediaRepository.create(mediaObject);
      analyticsRepository.recordUpload(mediaObject).catch((statErr) => {
        console.warn("[ANALYTICS_WARN] Gagal mencatat upload analitik:", statErr);
      });
      recordUploadAndCheckSpike(sessionId).catch((spikeErr) => {
        console.warn("[SPIKE_ALERT_WARN] Gagal mengecek lonjakan sesi:", spikeErr);
      });
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
      res.status(isTimeout ? 504 : 502).json(err);
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
      deletedFilesRepository.recordDeleted({
        id: item.id,
        name: item.name || item.id,
        formattedSize: item.formattedSize || "-",
        type: item.type || "file",
        shareUrl: item.shareUrl || "#",
        deletedAt: Date.now(),
        deletedBy: "user",
        reason: "Dihapus oleh pengguna via sesi aplikasi"
      }).catch((err) => {
        console.warn("[DELETED_FILES_RECORD_WARN]:", err);
      });
      analyticsRepository.recordDeletion(1).catch((err) => {
        console.warn("[ANALYTICS_RECORD_DELETION_WARN] Gagal memperbarui analitik deletion:", err);
      });
      analyticsRepository.removeFileFromAllStats(id).catch((err) => {
        console.warn("[ANALYTICS_REMOVE_ALL_WARN] Gagal membersihkan jejak berkas:", err);
      });
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
      const existingItems = await mediaRepository.list(req.sessionId);
      const count = existingItems.length;
      await mediaRepository.clearAll(req.sessionId);
      if (count > 0) {
        analyticsRepository.recordDeletion(count).catch((err) => {
          console.warn("[ANALYTICS_RECORD_DELETION_WARN] Gagal memperbarui analitik clearAll:", err);
        });
        existingItems.forEach((item) => {
          deletedFilesRepository.recordDeleted({
            id: item.id,
            name: item.name || item.id,
            formattedSize: item.formattedSize || "-",
            type: item.type || "file",
            shareUrl: item.shareUrl || "#",
            deletedAt: Date.now(),
            deletedBy: "user",
            reason: "Pengguna membersihkan seluruh riwayat sesi"
          }).catch(() => {
          });
          analyticsRepository.removeFileFromAllStats(item.id).catch(() => {
          });
        });
      }
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

// src/server/api/routes.ts
var router = Router();
var MULTER_CEILING_SIZE = 500 * 1024 * 1024;
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MULTER_CEILING_SIZE,
    files: 1
    // Enforce single file per request
  }
});
async function handleMulterErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxSize = await getMaxUploadSize();
      const errorResp2 = {
        success: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: `Ukuran berkas melebihi batas maksimal ${(maxSize / (1024 * 1024)).toFixed(0)} MB.`
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
  keyPrefix: "upload_ip",
  getDynamicLimit: async () => getUploadRateLimit()
});
var standardRateLimiter2 = rateLimitMiddleware({
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
router.route("/config").get(standardRateLimiter2, mediaController.getConfig).all(methodNotAllowedHandler(["GET"]));
router.route("/upload").post(
  uploadRateLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      handleMulterErrors(err, req, res, next);
    });
  },
  mediaController.uploadMedia
).all(methodNotAllowedHandler(["POST"]));
router.route("/:id").get(standardRateLimiter2, mediaController.getMedia).delete(standardRateLimiter2, mediaController.deleteMedia).all(methodNotAllowedHandler(["GET", "DELETE"]));
router.route("/").get(standardRateLimiter2, mediaController.listMedia).delete(standardRateLimiter2, mediaController.clearAllMedia).all(methodNotAllowedHandler(["GET", "DELETE"]));

// src/server/api/share-controller.ts
import hljs from "highlight.js";

// src/server/storage/catbox-health-check.ts
var CACHE_TTL_MS = 30 * 1e3;
var cachedHealth = null;
var pendingCheckPromise = null;
var inMemoryLastSyncCheck = null;
async function checkCatboxHealth(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedHealth) {
    const age = now - new Date(cachedHealth.lastChecked).getTime();
    if (age < CACHE_TTL_MS) {
      return cachedHealth;
    }
  }
  if (pendingCheckPromise) {
    return pendingCheckPromise;
  }
  pendingCheckPromise = (async () => {
    const startTime = Date.now();
    try {
      const response = await fetch("https://catbox.moe", {
        method: "HEAD",
        signal: AbortSignal.timeout(3e3),
        headers: {
          "User-Agent": "AirSharePro-HealthCheck/1.0"
        }
      });
      const isUp = response.status < 500;
      const latency = Date.now() - startTime;
      cachedHealth = {
        available: isUp,
        latencyMs: isUp ? latency : null,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
      return cachedHealth;
    } catch (err) {
      cachedHealth = {
        available: false,
        latencyMs: null,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
      return cachedHealth;
    } finally {
      pendingCheckPromise = null;
    }
  })();
  return pendingCheckPromise;
}
var upstreamUrlCache = /* @__PURE__ */ new Map();
function getCachedUpstreamStatus(url) {
  const entry = upstreamUrlCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    upstreamUrlCache.delete(url);
    return null;
  }
  return entry.result;
}
function setCachedUpstreamStatus(url, result, ttlMs = 6e4) {
  if (upstreamUrlCache.size > 500) {
    const firstKey = upstreamUrlCache.keys().next().value;
    if (firstKey) upstreamUrlCache.delete(firstKey);
  }
  upstreamUrlCache.set(url, {
    result,
    expiresAt: Date.now() + ttlMs
  });
}
async function checkUpstreamFileStatus(shareUrl) {
  if (!shareUrl || typeof shareUrl !== "string" || !shareUrl.startsWith("http")) {
    return { exists: false, isPurged: true, status: 400, error: "INVALID_URL" };
  }
  const cached = getCachedUpstreamStatus(shareUrl);
  if (cached) {
    return cached;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(shareUrl, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "AirSharePro-ShareVerifier/1.0"
      }
    });
    clearTimeout(timeoutId);
    const status = response.status;
    const isPurged = status === 404 || status === 410;
    const exists = status >= 200 && status < 300;
    const result = {
      exists,
      isPurged,
      status
    };
    if (exists) {
      setCachedUpstreamStatus(shareUrl, result, 6e4);
    } else if (isPurged) {
      setCachedUpstreamStatus(shareUrl, result, 6e5);
    }
    return result;
  } catch (err) {
    return {
      exists: true,
      isPurged: false,
      status: 0,
      error: err instanceof Error ? err.message : "TIMEOUT_OR_NETWORK_ERROR"
    };
  }
}
async function verifyFileExistsOnCatbox(shareUrl) {
  if (!shareUrl || typeof shareUrl !== "string" || !shareUrl.startsWith("http")) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    const response = await fetch(shareUrl, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "AirSharePro-SyncChecker/1.0"
      }
    });
    clearTimeout(timeoutId);
    return response.status === 200;
  } catch {
    return false;
  }
}
async function verifyFilesBatch(items, concurrency = 10) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const exists = await verifyFileExistsOnCatbox(item.shareUrl);
        return { item, exists };
      })
    );
    results.push(...batchResults);
  }
  return results;
}
async function getLastSyncCheck() {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get("admin:last_sync_check");
        if (raw) {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch {
      }
    }
  }
  return inMemoryLastSyncCheck;
}
async function saveLastSyncCheck(summary) {
  inMemoryLastSyncCheck = summary;
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set("admin:last_sync_check", JSON.stringify(summary), {
          ex: 30 * 24 * 60 * 60
        });
      } catch {
      }
    }
  }
}
async function removeSyncCheckItem(id) {
  const current = await getLastSyncCheck();
  if (!current) return;
  const nextBroken = current.brokenItems.filter((item) => item.id !== id);
  const updated = {
    ...current,
    brokenCount: nextBroken.length,
    brokenItems: nextBroken
  };
  await saveLastSyncCheck(updated);
}

// src/shared/flags.ts
var SUPPORTED_FLAG_CODES = /* @__PURE__ */ new Set([
  "ID",
  "US",
  "SG",
  "MY",
  "JP",
  "GB",
  "DE",
  "FR",
  "NL",
  "AU",
  "CA",
  "BR",
  "IN",
  "KR",
  "CN",
  "RU",
  "IT",
  "ES",
  "PH",
  "TH",
  "VN",
  "SA",
  "AE",
  "TR",
  "MX",
  "AR",
  "PL",
  "SE",
  "NO",
  "CH",
  "NZ",
  "PK",
  "BD",
  "NG",
  "ZA",
  "CL",
  "CO",
  "TW",
  "HK"
]);
var DEFAULT_GLOBE_FLAG_PATH = "/flags/globe.svg";
function getFlagAssetPath(countryCode) {
  if (!countryCode || typeof countryCode !== "string") {
    return DEFAULT_GLOBE_FLAG_PATH;
  }
  const code = countryCode.trim().toUpperCase();
  if (SUPPORTED_FLAG_CODES.has(code)) {
    return `/flags/${code.toLowerCase()}.svg`;
  }
  return DEFAULT_GLOBE_FLAG_PATH;
}

// src/server/api/share-controller.ts
function splitHighlightedLines(html) {
  const lines = html.split("\n");
  const result = [];
  const openTags = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = openTags.join("");
    const tagRegex = /<span\s+class="([^"]+)">|<\/span>/g;
    let match;
    while ((match = tagRegex.exec(line)) !== null) {
      if (match[0].startsWith("</")) {
        openTags.pop();
      } else {
        openTags.push(match[0]);
      }
    }
    const suffix = "</span>".repeat(openTags.length);
    result.push(prefix + line + suffix);
  }
  return result;
}
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatExactDate(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "Baru saja";
  const d = new Date(timestamp);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatRelativeTime(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "Baru saja";
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1e3));
  if (diffSecs < 60) return "Baru saja";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} menit lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} hari lalu`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} bulan lalu`;
}
function getFileCategoryIcon(mimeType, filename) {
  const mime = mimeType.toLowerCase();
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("7z") || mime.includes("tar") || mime.includes("gzip") || ["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
      <path d="m7.5 4.5 9 5.2"/>
    </svg>`;
  }
  if (mime.includes("pdf") || ext === "pdf") {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10 12h-1v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/>
      <path d="M6 12v6"/>
      <path d="M6 15h2"/>
    </svg>`;
  }
  if (mime.includes("word") || mime.includes("document") || mime.includes("sheet") || mime.includes("excel") || mime.includes("presentation") || ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10 9H8"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
    </svg>`;
  }
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    <path d="M12 18v-6"/>
    <path d="m9 15 3 3 3-3"/>
  </svg>`;
}
var ShareController = class _ShareController {
  async renderShareLanding(req, res) {
    const rawId = req.params.id;
    const requestId = req.id || res.getHeader("X-Request-ID") || `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
      res.status(400).send(
        _ShareController.renderThemedErrorHtml({
          title: "Format Tautan Tidak Valid \u2014 AirShare Pro",
          heading: "Format Tautan Tidak Dikenali",
          message: "Tautan berkas yang Anda buka memiliki format yang salah, kosong, atau tidak lengkap.",
          errorCode: "ERR_INVALID_ID",
          httpStatus: 400,
          requestId
        })
      );
      return;
    }
    const cleanId = rawId.trim();
    try {
      const repo = getMediaRepository();
      const tombstone = await repo.getTombstone(cleanId);
      if (tombstone) {
        const isUpstream = tombstone.reason === "UPSTREAM_PURGED";
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.status(410).send(
          _ShareController.renderThemedErrorHtml({
            title: isUpstream ? "Berkas Telah Terhapus dari Upstream \u2014 AirShare Pro" : "Berkas Telah Dihapus \u2014 AirShare Pro",
            heading: isUpstream ? "Berkas Telah Dihapus dari Catbox" : "Berkas Telah Dihapus",
            message: isUpstream ? "Media fisik pada server penyimpanan Catbox telah terhapus atau kedaluwarsa, sehingga tautan ini tidak dapat lagi diakses." : "Berkas ini telah dihapus permanen oleh pemilik unggahan atau administrator sistem dan tidak lagi tersedia di jaringan.",
            errorCode: isUpstream ? "ERR_UPSTREAM_PURGED" : "ERR_MEDIA_DELETED",
            httpStatus: 410,
            itemId: cleanId,
            deletedAt: tombstone.deletedAt,
            reason: tombstone.reason,
            requestId
          })
        );
        return;
      }
      const item = await repo.getByIdPublic(cleanId);
      if (!item) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.status(404).send(
          _ShareController.renderThemedErrorHtml({
            title: "Berkas Tidak Ditemukan \u2014 AirShare Pro",
            heading: "Berkas Tidak Ditemukan",
            message: "Tautan berkas yang Anda akses tidak terdaftar di sistem atau masa berlakunya telah habis.",
            errorCode: "ERR_MEDIA_NOT_FOUND",
            httpStatus: 404,
            itemId: cleanId,
            requestId
          })
        );
        return;
      }
      if (item.shareUrl) {
        const upstreamStatus = await checkUpstreamFileStatus(item.shareUrl);
        if (upstreamStatus.isPurged) {
          repo.deleteForAdmin(item.id).catch(() => {
          });
          repo.recordTombstone(item.id, "UPSTREAM_PURGED").catch(() => {
          });
          analyticsRepository.removeRecentUpload(item.id).catch(() => {
          });
          console.warn(`[SHARE_SYNC] File ${item.id} detected as 404/410 on Catbox upstream. Tombstone recorded.`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, max-age=0");
          res.status(410).send(
            _ShareController.renderThemedErrorHtml({
              title: "Berkas Telah Terhapus dari Catbox \u2014 AirShare Pro",
              heading: "Berkas Telah Dihapus dari Catbox",
              message: "Berkas ini sebelumnya tersinkronisasi, namun media fisik pada server Catbox telah dihapus atau kedaluwarsa.",
              errorCode: "ERR_UPSTREAM_PURGED",
              httpStatus: 410,
              itemId: item.id,
              deletedAt: Date.now(),
              reason: "Media fisik telah terhapus dari server penyimpanan Catbox upstream (HTTP 404/410)",
              upstreamUrl: item.shareUrl,
              upstreamStatus: `HTTP ${upstreamStatus.status} (Purged Upstream)`,
              requestId
            })
          );
          return;
        }
      }
      const host = req.get("host") || "localhost:3000";
      const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const currentUrl = `${protocol}://${host}/s/${encodeURIComponent(item.id)}`;
      analyticsRepository.recordShareView(item.id).catch((statErr) => {
        console.warn("[ANALYTICS_WARN] Gagal mencatat share view:", statErr);
      });
      const html = await _ShareController.renderSuccessHtml(item, currentUrl, host, protocol);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, private");
      res.status(200).send(html);
    } catch (err) {
      console.error("[SHARE_CONTROLLER_ERROR]", err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(500).send(
        _ShareController.renderThemedErrorHtml({
          title: "Terjadi Kesalahan Sistem \u2014 AirShare Pro",
          heading: "Gagal Memuat Berkas",
          message: "Terjadi kendala saat memproses permintaan berkas. Silakan coba beberapa saat lagi.",
          errorCode: "ERR_INTERNAL_SERVER",
          httpStatus: 500,
          itemId: cleanId,
          requestId
        })
      );
    }
  }
  static renderNotFoundHtml(message) {
    return _ShareController.renderThemedErrorHtml({
      title: "Berkas Tidak Ditemukan \u2014 AirShare Pro",
      heading: "Berkas Tidak Ditemukan",
      message,
      errorCode: "ERR_MEDIA_NOT_FOUND",
      httpStatus: 404
    });
  }
  static renderThemedErrorHtml(options) {
    const {
      title,
      heading,
      message,
      errorCode,
      httpStatus,
      itemId,
      deletedAt,
      reason,
      upstreamUrl,
      upstreamStatus,
      requestId
    } = options;
    const isDeleted = httpStatus === 410 || errorCode.includes("DELETED") || errorCode.includes("PURGED");
    const isNotFound = httpStatus === 404;
    const statusBadgeLabel = isDeleted ? "410 GONE" : isNotFound ? "404 NOT FOUND" : `${httpStatus} ERROR`;
    const accentColor = isDeleted ? "#ef4444" : isNotFound ? "#f59e0b" : "#6366f1";
    const accentGlow = isDeleted ? "rgba(239, 68, 68, 0.15)" : isNotFound ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)";
    const heroIcon = isDeleted ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>` : isNotFound ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>` : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>`;
    const exactDeletedTime = deletedAt ? formatExactDate(deletedAt) : null;
    const relativeDeletedTime = deletedAt ? formatRelativeTime(deletedAt) : null;
    const safeRequestId = requestId || `req_${Date.now().toString(36)}`;
    const diagnosticPayload = {
      service: "AirShare Pro Edge Network",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      httpStatus,
      errorCode,
      message,
      itemId: itemId || null,
      deletedAt: exactDeletedTime ? `${exactDeletedTime} (${relativeDeletedTime})` : null,
      reason: reason || (isDeleted ? "User or system permanent removal" : "Resource missing"),
      upstreamStatus: upstreamStatus || "Checked / Synchronized",
      upstreamUrl: upstreamUrl || null,
      requestId: safeRequestId
    };
    const jsonString = JSON.stringify(diagnosticPayload, null, 2);
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121216;
      --card-inner: #181820;
      --border: #27272a;
      --border-subtle: #202025;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-dim: #71717a;
      --accent: ${accentColor};
      --accent-glow: ${accentGlow};
      --blue: #3b82f6;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      position: relative;
      overflow-x: hidden;
    }
    /* Subtle background grid */
    body::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 360px;
      background: radial-gradient(circle at 50% 10%, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .wrapper {
      position: relative;
      z-index: 1;
      max-width: 520px;
      width: 100%;
    }
    /* Header Brand */
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      margin-bottom: 1.5rem;
      text-decoration: none;
      color: var(--text);
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-weight: 500;
    }
    /* Card Container */
    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03);
    }
    .status-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background-color: var(--accent-glow);
      color: var(--accent);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 9999px;
      padding: 0.3rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--accent);
      box-shadow: 0 0 8px var(--accent);
    }
    .req-id {
      font-size: 0.72rem;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .hero-icon-container {
      width: 60px;
      height: 60px;
      border-radius: 1rem;
      background-color: var(--accent-glow);
      color: var(--accent);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.6rem;
      color: var(--text);
      line-height: 1.3;
    }
    .desc {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    /* Diagnostic Terminal Box */
    .diagnostic-box {
      background-color: var(--card-inner);
      border: 1px solid var(--border-subtle);
      border-radius: 0.85rem;
      overflow: hidden;
      margin-bottom: 1.75rem;
      text-align: left;
    }
    .diagnostic-header {
      background-color: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.6rem 0.9rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .diagnostic-dots {
      display: flex;
      gap: 0.35rem;
      align-items: center;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #f59e0b; }
    .dot-green { background: #10b981; }
    .diagnostic-title {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .btn-copy {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      color: var(--text-muted);
      font-size: 0.72rem;
      padding: 0.25rem 0.55rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }
    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      border-color: #3f3f46;
    }
    .diagnostic-body {
      padding: 0.85rem 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.76rem;
      line-height: 1.65;
    }
    .diag-row {
      display: flex;
      padding: 0.15rem 0;
    }
    .diag-label {
      color: var(--text-dim);
      width: 130px;
      flex-shrink: 0;
    }
    .diag-value {
      color: var(--text);
      word-break: break-all;
    }
    .diag-value.highlight-red { color: #f87171; font-weight: 600; }
    .diag-value.highlight-amber { color: #fbbf24; font-weight: 600; }
    .diag-value.highlight-blue { color: #60a5fa; }
    /* Action Buttons */
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 440px) {
      .actions { grid-template-columns: 1fr; }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary {
      background-color: var(--blue);
      color: #fff;
    }
    .btn-primary:hover {
      background-color: #2563eb;
    }
    .btn-secondary {
      background-color: var(--card-inner);
      color: var(--text-muted);
      border-color: var(--border);
    }
    .btn-secondary:hover {
      background-color: #202028;
      color: var(--text);
    }
    /* Footer */
    .footer-note {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.75rem;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <a href="/" class="brand" title="Beranda AirShare Pro">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
          <path d="m16 16-4-4-4 4"></path>
          <path d="M12 12v9"></path>
        </svg>
      </div>
      <span class="brand-title">AirShare Pro</span>
      <span class="brand-tag">Mesh Sync</span>
    </a>

    <div class="card">
      <div class="status-badge-row">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>${statusBadgeLabel}</span>
        </div>
        <span class="req-id">${escapeHtml(safeRequestId)}</span>
      </div>

      <div class="hero-icon-container">
        ${heroIcon}
      </div>

      <h1>${escapeHtml(heading)}</h1>
      <p class="desc">${escapeHtml(message)}</p>

      <div class="diagnostic-box">
        <div class="diagnostic-header">
          <div class="diagnostic-dots">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="diagnostic-title">Audit Log Diagnostik</span>
          <button type="button" class="btn-copy" id="btnCopyLog" onclick="copyDiagnosticLog()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span id="copyBtnText">Salin Log</span>
          </button>
        </div>
        <div class="diagnostic-body">
          <div class="diag-row">
            <span class="diag-label">STATUS_CODE:</span>
            <span class="diag-value ${isDeleted ? "highlight-red" : "highlight-amber"}">${httpStatus} (${isDeleted ? "Gone" : isNotFound ? "Not Found" : "Error"})</span>
          </div>
          <div class="diag-row">
            <span class="diag-label">ERROR_CODE:</span>
            <span class="diag-value highlight-blue">${escapeHtml(errorCode)}</span>
          </div>
          ${itemId ? `
          <div class="diag-row">
            <span class="diag-label">TARGET_ID:</span>
            <span class="diag-value">${escapeHtml(itemId)}</span>
          </div>
          ` : ""}
          ${exactDeletedTime ? `
          <div class="diag-row">
            <span class="diag-label">WAKTU_HAPUS:</span>
            <span class="diag-value">${escapeHtml(exactDeletedTime)} (${escapeHtml(relativeDeletedTime || "")})</span>
          </div>
          ` : ""}
          ${reason ? `
          <div class="diag-row">
            <span class="diag-label">ALASAN:</span>
            <span class="diag-value">${escapeHtml(reason)}</span>
          </div>
          ` : ""}
          <div class="diag-row">
            <span class="diag-label">UPSTREAM_SYNC:</span>
            <span class="diag-value">${escapeHtml(upstreamStatus || "Catbox Synchronized")}</span>
          </div>
          <div class="diag-row">
            <span class="diag-label">DIAGNOSIS:</span>
            <span class="diag-value">${isDeleted ? "Resource purged permanently from AirShare repository & upstream storage." : "Target resource does not exist or expired."}</span>
          </div>
        </div>
      </div>

      <div class="actions">
        <a href="/" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Unggah Berkas Baru
        </a>
        <a href="/api/health" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
          Periksa Status Server
        </a>
      </div>
    </div>

    <p class="footer-note">AirShare Pro Storage Network \u2022 Verifikasi Sinkronisasi Upstream Otomatis</p>
  </div>

  <textarea id="diagJson" style="display:none;">${escapeHtml(jsonString)}</textarea>

  <script>
    function copyDiagnosticLog() {
      var text = document.getElementById('diagJson').value;
      var btn = document.getElementById('btnCopyLog');
      var label = document.getElementById('copyBtnText');

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onCopied, fallbackCopy);
      } else {
        fallbackCopy();
      }

      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          onCopied();
        } catch(e) {
          label.innerText = 'Gagal';
        }
        document.body.removeChild(ta);
      }

      function onCopied() {
        label.innerText = 'Tersalin!';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#10b981';
        setTimeout(function() {
          label.innerText = 'Salin Log';
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 2500);
      }
    }
  </script>
</body>
</html>`;
  }
  static async renderSuccessHtml(item, currentUrl, host, protocol) {
    const safeTitle = escapeHtml(item.name);
    const safeShareUrl = escapeHtml(item.shareUrl);
    const safeCurrentUrl = escapeHtml(currentUrl);
    const safeSize = escapeHtml(item.formattedSize);
    const safeExactDate = escapeHtml(formatExactDate(item.createdAt));
    const safeRelativeTime = escapeHtml(formatRelativeTime(item.createdAt));
    const isFile = item.type === "file";
    const isImage = item.type === "image";
    const isVideo = item.type === "video";
    const isAudio = item.type === "audio";
    const isPdf = isFile && (item.mimeType === "application/pdf" || item.name.toLowerCase().endsWith(".pdf"));
    const isText = isFile && !isPdf && (item.isTextPreviewable || isTextPreviewableFile(item.name, item.mimeType, item.size));
    let hasCodePreview = false;
    let codePreviewHtml = "";
    let rawTextContent = "";
    let textLineCount = 0;
    const langInfo = getTextLanguageInfo(item.name);
    if (isText && item.size <= MAX_TEXT_PREVIEW_BYTES) {
      try {
        const resp = await fetch(item.shareUrl, {
          signal: AbortSignal.timeout(6e3)
        });
        if (resp.ok) {
          const text = await resp.text();
          if (text.length <= MAX_TEXT_PREVIEW_BYTES) {
            rawTextContent = text;
            const langHint = item.textLanguageHint || getTextLanguageHint(item.name);
            let highlighted = "";
            try {
              const isKnown = hljs.getLanguage(langHint);
              highlighted = isKnown ? hljs.highlight(text, { language: langHint, ignoreIllegals: true }).value : hljs.highlight(text, { language: "plaintext" }).value;
            } catch {
              highlighted = escapeHtml(text);
            }
            const lines = splitHighlightedLines(highlighted);
            textLineCount = lines.length;
            const linesHtml = lines.map(
              (lineHtml, idx) => `<div class="code-line"><span class="code-line-num">${idx + 1}</span><span class="code-line-text">${lineHtml || "&nbsp;"}</span></div>`
            ).join("");
            codePreviewHtml = `
            <div class="code-viewer-box">
              <div class="code-viewer-bar">
                <div class="code-viewer-left">
                  <span class="code-lang-badge">${escapeHtml(langInfo.label)}</span>
                  <span class="code-meta-count">${textLineCount} baris \u2022 ${safeSize}</span>
                </div>
                <div class="code-viewer-actions">
                  <button class="code-btn" id="copy-code-btn" onclick="copyCodeContent()" aria-label="Salin isi berkas" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="copy-code-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    <span id="copy-code-text">Salin Isi</span>
                  </button>
                  <a href="${safeShareUrl}" target="_blank" rel="noopener noreferrer" class="code-btn" title="Buka berkas mentah di tab baru">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span>Lihat Mentah</span>
                  </a>
                </div>
              </div>
              <div class="code-scroll-pane">
                <div class="code-table">
                  ${linesHtml}
                </div>
              </div>
            </div>
            <script type="application/json" id="raw-code-payload">${JSON.stringify(rawTextContent)}</script>`;
            hasCodePreview = true;
          }
        }
      } catch (fetchErr) {
        console.warn("[SHARE_TEXT_PREVIEW_WARN] Gagal mengambil teks untuk pratinjau:", fetchErr);
      }
    }
    const safeDesc = isPdf ? `Dokumen PDF (${safeSize}) \u2022 Pratinjau langsung via AirShare Pro` : hasCodePreview ? `Berkas teks/kode ${escapeHtml(langInfo.label)} (${safeSize}) \u2022 Pratinjau langsung via AirShare Pro` : isFile ? `${safeSize} \u2022 Diunggah ${safeExactDate} via AirShare Pro` : `Berkas ${escapeHtml(item.type)} (${safeSize}) dibagikan via AirShare Pro`;
    const flagPath = getFlagAssetPath(item.uploaderCountryCode);
    const countryName = item.uploaderCountryName || (item.uploaderCountryCode ? item.uploaderCountryCode.toUpperCase() : null);
    const countryHtml = countryName ? `<span class="meta-item country-badge" title="Lokasi Pengunggah"><img src="${escapeHtml(flagPath)}" alt="${escapeHtml(countryName)}" class="flag-img" onerror="this.src='/flags/globe.svg'" /><span>${escapeHtml(countryName)}</span></span>` : `<span class="meta-item country-badge" title="Lokasi Pengunggah"><img src="/flags/globe.svg" alt="Lokasi tidak diketahui" class="flag-img" /><span>Lokasi tidak diketahui</span></span>`;
    let ogType = "website";
    let ogMediaTag = "";
    let previewTag = "";
    if (isImage) {
      ogType = "website";
      ogMediaTag = `<meta property="og:image" content="${safeShareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${safeShareUrl}" />`;
      previewTag = `<div class="media-container"><img src="${safeShareUrl}" alt="${safeTitle}" /></div>`;
    } else if (isVideo) {
      ogType = "video.other";
      ogMediaTag = `<meta property="og:video" content="${safeShareUrl}" />
  <meta property="og:video:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary_large_image" />`;
      previewTag = `
      <div class="custom-player-wrapper custom-video-wrapper" id="video-wrapper">
        <video id="airshare-video" src="${safeShareUrl}" preload="metadata" playsinline></video>
        
        <!-- Big Center Play Button Overlay -->
        <button class="big-play-btn" id="big-play-btn" aria-label="Putar Video">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>

        <!-- Video Control Bar Overlay -->
        <div class="video-controls" id="video-controls">
          <!-- Scrubber Timeline -->
          <div class="timeline-bar" id="video-timeline" role="slider" aria-label="Posisi Video" tabindex="0">
            <div class="timeline-buffered" id="video-buffered"></div>
            <div class="timeline-progress" id="video-progress"></div>
            <div class="timeline-thumb" id="video-thumb"></div>
          </div>

          <!-- Controls Bottom Row -->
          <div class="controls-row">
            <div class="controls-left">
              <button class="ctrl-btn" id="vid-play-btn" aria-label="Putar atau jeda">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" id="vid-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button class="ctrl-btn" id="vid-rewind-btn" title="Mundur 10 detik" aria-label="Mundur 10 detik">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
              </button>
              <button class="ctrl-btn" id="vid-forward-btn" title="Maju 10 detik" aria-label="Maju 10 detik">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
              </button>
              <span class="time-display" id="video-time-display">0:00 / 0:00</span>
            </div>

            <div class="controls-right">
              <!-- Speed -->
              <button class="ctrl-btn speed-badge" id="vid-speed-btn" title="Kecepatan putar">1x</button>

              <!-- PiP -->
              <button class="ctrl-btn" id="vid-pip-btn" title="Picture in Picture" aria-label="Picture in Picture">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><rect width="7" height="5" x="12" y="12" rx="1"/></svg>
              </button>

              <!-- Fullscreen -->
              <button class="ctrl-btn" id="vid-fs-btn" title="Layar penuh" aria-label="Layar penuh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="vid-fs-icon"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    } else if (isAudio) {
      ogType = "music.song";
      ogMediaTag = `<meta property="og:audio" content="${safeShareUrl}" />
  <meta property="og:audio:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary" />`;
      const songTitle = item.audioMeta?.title || item.name.replace(/\.[^/.]+$/, "");
      const artist = item.audioMeta?.artist || "Artis Tidak Dikenal";
      const album = item.audioMeta?.album?.trim();
      const hasCover = !!item.audioMeta?.coverUrl;
      previewTag = `
      <div class="custom-player-wrapper custom-audio-wrapper" id="audio-wrapper">
        <audio id="airshare-audio" src="${safeShareUrl}" preload="metadata"></audio>
        
        <!-- Header Art & Metadata -->
        <div class="audio-header">
          <div class="audio-cover-box" id="audio-cover-box">
            ${hasCover ? `<img src="${escapeHtml(item.audioMeta.coverUrl)}" alt="Cover ${escapeHtml(songTitle)}" class="audio-cover-img" />` : `<div class="audio-vinyl-disc"><div class="vinyl-grooves"></div><div class="vinyl-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div></div>`}
          </div>
          <div class="audio-info">
            <h3 class="audio-title" title="${escapeHtml(songTitle)}">${escapeHtml(songTitle)}</h3>
            <p class="audio-artist" title="${escapeHtml(artist)}">${escapeHtml(artist)}</p>
            ${album ? `<p class="audio-album" title="${escapeHtml(album)}">${escapeHtml(album)}</p>` : ""}
          </div>
        </div>

        <!-- Audio Timeline Scrubber -->
        <div class="audio-timeline-wrap">
          <div class="timeline-bar" id="audio-timeline" role="slider" aria-label="Posisi Audio" tabindex="0">
            <div class="timeline-buffered" id="audio-buffered"></div>
            <div class="timeline-progress" id="audio-progress"></div>
            <div class="timeline-thumb" id="audio-thumb"></div>
          </div>
          <div class="audio-time-row">
            <span id="audio-cur-time">0:00</span>
            <span id="audio-dur-time">0:00</span>
          </div>
        </div>

        <!-- Audio Main Controls -->
        <div class="audio-controls-row">
          <button class="ctrl-btn speed-badge" id="aud-speed-btn" title="Kecepatan">1x</button>
          
          <div class="audio-playback-cluster">
            <button class="ctrl-btn" id="aud-rewind-btn" title="Mundur 10 detik" aria-label="Mundur 10 detik">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
            </button>
            <button class="audio-main-play-btn" id="aud-play-btn" aria-label="Putar atau jeda audio">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" id="aud-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button class="ctrl-btn" id="aud-forward-btn" title="Maju 10 detik" aria-label="Maju 10 detik">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    } else if (isPdf) {
      ogType = "website";
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      previewTag = `
      <div class="pdf-viewer-box">
        <div class="pdf-viewer-bar">
          <div class="pdf-viewer-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Pratinjau Dokumen PDF</span>
          </div>
          <div class="pdf-viewer-actions">
            <a href="${safeShareUrl}" target="_blank" rel="noopener noreferrer" class="pdf-ext-btn" title="Buka di tab penuh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Tab Baru</span>
            </a>
          </div>
        </div>
        <div class="pdf-frame-wrapper">
          <iframe src="${safeShareUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH" class="pdf-iframe" title="${safeTitle}"></iframe>
        </div>
      </div>`;
    } else if (hasCodePreview) {
      ogType = "website";
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      previewTag = codePreviewHtml;
    } else if (isFile) {
      ogType = "website";
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      const fileIcon = getFileCategoryIcon(item.mimeType, item.name);
      previewTag = `<div class="file-hero-box">
        <div class="file-icon-badge">${fileIcon}</div>
        <div class="file-hero-meta">
          <span class="file-format-tag">${escapeHtml((item.name.split(".").pop() || "FILE").toUpperCase())}</span>
        </div>
      </div>`;
    }
    const refreshMetaTag = isImage ? `
  <!-- 2-Second Meta Refresh Redirect to direct storage URL (images only) -->
  <meta http-equiv="refresh" content="2;url=${safeShareUrl}" />` : "";
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} \u2014 AirShare Pro</title>

  <!-- Open Graph Meta Tags -->
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${safeCurrentUrl}" />
  <meta property="og:site_name" content="AirShare Pro" />
  ${ogMediaTag}

  <!-- Twitter Meta Tags -->
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  ${refreshMetaTag}

  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --card-gradient: linear-gradient(180deg, rgba(24, 24, 27, 0.95) 0%, rgba(18, 18, 20, 0.98) 100%);
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --border-accent: rgba(59, 130, 246, 0.2);
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --surface: #27272a;
      --surface-subtle: #202023;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background: var(--card-gradient); border: 1px solid var(--border); border-radius: 1.5rem; padding: 1.75rem; max-width: 480px; width: 100%; box-shadow: 0 16px 40px -10px rgba(0,0,0,0.65); backdrop-filter: blur(16px); transition: max-width 0.2s ease; }
    .card-video { max-width: 640px; }
    .card-pdf { max-width: 860px; }
    .card-code { max-width: 920px; }
    .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
    .brand-title { font-size: 0.8125rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.5rem; }
    .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .badge { font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 9999px; background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    
    /* Media Containers */
    .media-container { width: 100%; max-height: 260px; overflow: hidden; border-radius: 1rem; margin-bottom: 1.25rem; background: #000; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); }
    .media-container img { width: 100%; max-height: 260px; object-fit: contain; }

    /* Custom Player Containers */
    .custom-player-wrapper {
      position: relative;
      width: 100%;
      border-radius: 1.25rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #000;
      user-select: none;
    }
    .custom-video-wrapper {
      aspect-ratio: 16 / 9;
      max-height: 400px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .custom-video-wrapper video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .big-play-btn {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.9);
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 5;
    }
    .big-play-btn:hover {
      transform: translate(-50%, -50%) scale(1.08);
      background: #3b82f6;
    }
    .big-play-btn.hidden {
      opacity: 0;
      pointer-events: none;
    }
    .video-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 65%, transparent 100%);
      padding: 1.25rem 0.85rem 0.65rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 6;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .video-controls.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(6px);
    }
    .timeline-bar {
      position: relative;
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
      cursor: pointer;
      touch-action: none;
      transition: height 0.15s ease;
    }
    .timeline-bar:hover { height: 8px; }
    .timeline-buffered {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 9999px;
      pointer-events: none;
    }
    .timeline-progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: var(--accent);
      border-radius: 9999px;
      pointer-events: none;
    }
    .timeline-thumb {
      position: absolute;
      top: 50%;
      left: 0%;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 8px rgba(0,0,0,0.6);
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.15s ease;
      pointer-events: none;
    }
    .timeline-bar:hover .timeline-thumb,
    .timeline-bar:active .timeline-thumb {
      transform: translate(-50%, -50%) scale(1);
    }
    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .controls-left, .controls-right {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .ctrl-btn {
      background: transparent;
      border: none;
      color: #f4f4f5;
      padding: 0.35rem;
      border-radius: 0.4rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
    }
    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .speed-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.2rem 0.45rem;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 0.375rem;
    }
    .time-display {
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      color: #d4d4d8;
      margin-left: 0.35rem;
    }


    /* Custom Audio Player */
    .custom-audio-wrapper {
      background: linear-gradient(180deg, #1b1b22 0%, #131317 100%);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .audio-header {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .audio-cover-box {
      width: 64px;
      height: 64px;
      border-radius: 0.85rem;
      overflow: hidden;
      flex-shrink: 0;
      background: #27272a;
      box-shadow: 0 6px 16px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .audio-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .audio-vinyl-disc {
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, #2d2d34 0%, #18181b 60%, #0d0d10 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .vinyl-center {
      width: 28px;
      height: 28px;
      background: #2563eb;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .spinning {
      animation: spinVinyl 6s linear infinite;
    }
    @keyframes spinVinyl {
      100% { transform: rotate(360deg); }
    }
    .audio-info {
      min-width: 0;
      flex: 1;
    }
    .audio-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .audio-artist {
      font-size: 0.8125rem;
      color: #a1a1aa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.15rem;
    }
    .audio-album {
      font-size: 0.6875rem;
      color: #71717a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.1rem;
    }
    .audio-timeline-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .audio-time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      color: #a1a1aa;
      font-variant-numeric: tabular-nums;
    }
    .audio-controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .audio-playback-cluster {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .audio-main-play-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }
    .audio-main-play-btn:hover {
      background: #3b82f6;
      transform: scale(1.05);
    }

    /* PDF Viewer Box */
    .pdf-viewer-box {
      width: 100%;
      border-radius: 1rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #141416;
      display: flex;
      flex-direction: column;
    }
    .pdf-viewer-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.85rem;
      background: #1e1e24;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
    }
    .pdf-viewer-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 600;
      color: #f87171;
    }
    .pdf-ext-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.55rem;
      border-radius: 0.45rem;
      background: rgba(255,255,255,0.08);
      color: var(--text);
      text-decoration: none;
      font-size: 0.75rem;
      font-weight: 600;
      transition: background 0.15s;
    }
    .pdf-ext-btn:hover { background: rgba(255,255,255,0.15); }
    .pdf-frame-wrapper {
      width: 100%;
      height: min(520px, 60vh);
      background: #0f0f12;
      position: relative;
    }
    .pdf-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    /* Clean Glass Code Viewer */
    .code-viewer-box {
      width: 100%;
      border-radius: 1rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #0c0c10;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 32px -8px rgba(0,0,0,0.5);
    }
    .code-viewer-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 0.95rem;
      background: #17171d;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .code-viewer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .code-lang-badge {
      display: inline-flex;
      align-items: center;
      font-weight: 700;
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.2rem 0.5rem;
      border-radius: 0.375rem;
      background: rgba(37, 99, 235, 0.2);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .code-meta-count {
      color: var(--muted);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }
    .code-viewer-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .code-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.65rem;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.75rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .code-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .code-btn.copied {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.4);
    }
    .code-scroll-pane {
      width: 100%;
      max-height: 520px;
      overflow: auto;
      background: #0a0a0d;
      padding: 0.75rem 0;
    }
    .code-table {
      display: flex;
      flex-direction: column;
      font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      width: 100%;
    }
    .code-line {
      display: flex;
      align-items: flex-start;
      min-width: 100%;
      padding: 0 0.75rem;
      transition: background 0.1s;
    }
    .code-line:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .code-line-num {
      user-select: none;
      -webkit-user-select: none;
      color: #52525b;
      text-align: right;
      min-width: 2.75rem;
      padding-right: 1rem;
      flex-shrink: 0;
      font-size: 12px;
      opacity: 0.75;
    }
    .code-line:hover .code-line-num {
      color: #a1a1aa;
      opacity: 1;
    }
    .code-line-text {
      flex: 1;
      white-space: pre;
      word-break: normal;
      color: #e4e4e7;
    }

    /* Clean Glass Syntax Tokens */
    .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #60a5fa; font-weight: 600; }
    .hljs-string, .hljs-attribute { color: #34d399; }
    .hljs-number, .hljs-literal { color: #c084fc; }
    .hljs-title, .hljs-title.function_, .hljs-name { color: #f472b6; }
    .hljs-tag { color: #93c5fd; }
    .hljs-attr { color: #38bdf8; }
    .hljs-comment, .hljs-quote { color: #71717a; font-style: italic; }
    .hljs-variable, .hljs-template-variable { color: #fbbf24; }
    .hljs-type, .hljs-class .hljs-title { color: #38bdf8; font-weight: 600; }
    .hljs-symbol, .hljs-bullet { color: #a78bfa; }
    .hljs-section { color: #f87171; font-weight: 700; }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: 700; }
    
    /* MediaFire-style File Box */
    .file-hero-box {
      width: 100%;
      padding: 2.25rem 1.5rem;
      margin-bottom: 1.25rem;
      background: radial-gradient(circle at 50% 30%, rgba(37, 99, 235, 0.08) 0%, rgba(32, 32, 35, 0.6) 100%);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }
    .file-icon-badge {
      width: 76px;
      height: 76px;
      border-radius: 1.25rem;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60a5fa;
      box-shadow: 0 8px 20px -4px rgba(0,0,0,0.4);
    }
    .file-hero-meta { display: flex; align-items: center; gap: 0.5rem; }
    .file-format-tag { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.06em; padding: 0.2rem 0.5rem; border-radius: 0.375rem; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.25); }

    h1 { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; word-break: break-word; line-height: 1.4; }
    
    /* Metadata Strip */
    .metadata-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--muted);
    }
    .meta-divider {
      color: var(--border);
      font-size: 0.75rem;
    }
    .flag-img {
      width: 18px;
      height: 13px;
      object-fit: cover;
      border-radius: 2px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      display: inline-block;
      vertical-align: middle;
    }
    .country-badge {
      background: var(--surface-subtle);
      padding: 0.2rem 0.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 500;
    }

    .progress-bar-wrap { width: 100%; height: 4px; background: var(--border); border-radius: 9999px; overflow: hidden; margin-bottom: 1.25rem; }
    .progress-bar-fill { height: 100%; background: var(--accent); width: 0%; animation: fillProgress 2s linear forwards; }
    @keyframes fillProgress { 0% { width: 0%; } 100% { width: 100%; } }
    .redirect-text { font-size: 0.75rem; color: var(--muted); text-align: center; margin-bottom: 1.25rem; }
    
    /* Buttons */
    .btn-group { display: flex; flex-direction: column; gap: 0.625rem; }
    .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8125rem 1.25rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.875rem; text-decoration: none; cursor: pointer; transition: all 0.15s ease; border: none; }
    .btn-primary {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
      transform: translateY(-1px);
    }
    .btn-secondary { background-color: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background-color: #323238; border-color: #3f3f46; }

    /* Mobile Responsive Breakpoints */
    @media (max-width: 480px) {
      body { padding: 0.75rem; }
      .card { padding: 1.1rem; border-radius: 1.25rem; }
      .brand { margin-bottom: 1rem; }
      .metadata-strip { gap: 0.5rem; font-size: 0.75rem; margin-bottom: 1rem; padding-bottom: 0.85rem; }
      .custom-player-wrapper { margin-bottom: 1rem; border-radius: 1rem; }
      .video-controls { padding: 1rem 0.65rem 0.5rem 0.65rem; }
      .controls-left, .controls-right { gap: 0.25rem; }
      .ctrl-btn { padding: 0.3rem; }
      .speed-badge { font-size: 0.625rem; padding: 0.15rem 0.35rem; }
      .time-display { font-size: 0.6875rem; margin-left: 0.15rem; }
      .custom-audio-wrapper { padding: 1rem; gap: 0.85rem; }
      .audio-cover-box { width: 54px; height: 54px; border-radius: 0.75rem; }
      .audio-title { font-size: 0.875rem; }
      .audio-artist { font-size: 0.75rem; }
      .audio-album { font-size: 0.625rem; }
      .audio-playback-cluster { gap: 0.5rem; }
      .audio-main-play-btn { width: 40px; height: 40px; }
      .btn { padding: 0.75rem 1rem; font-size: 0.8125rem; }
      .file-hero-box { padding: 1.75rem 1rem; }
      .file-icon-badge { width: 64px; height: 64px; }
    }

    @media (max-width: 380px) {
      .controls-row {
        flex-direction: column;
        gap: 0.45rem;
      }
      .controls-left, .controls-right {
        width: 100%;
        justify-content: center;
      }
      .audio-controls-row {
        gap: 0.35rem;
      }
      .audio-playback-cluster {
        gap: 0.35rem;
      }
    }
  </style>
</head>
<body>
  <div class="card ${isPdf ? "card-pdf" : ""} ${isVideo ? "card-video" : ""} ${hasCodePreview ? "card-code" : ""}">
    <div class="brand">
      <span class="brand-title"><span class="brand-dot"></span>AirShare Pro</span>
      <span class="badge">${escapeHtml(item.type.toUpperCase())}</span>
    </div>

    ${previewTag}

    <h1>${safeTitle}</h1>

    <div class="metadata-strip">
      <span class="meta-item" title="Ukuran Berkas">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${safeSize}
      </span>
      <span class="meta-divider">\u2022</span>
      <span class="meta-item" id="upload-time-wrap" title="Waktu Unggah: ${safeExactDate}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span id="upload-time-text" data-timestamp="${item.createdAt || ""}">${safeExactDate} \u2022 ${safeRelativeTime}</span>
      </span>
      <span class="meta-divider">\u2022</span>
      ${countryHtml}
    </div>

    ${isImage ? `<div class="progress-bar-wrap">
      <div class="progress-bar-fill"></div>
    </div>
    <div class="redirect-text">Mengarahkan ke berkas asli dalam 2 detik...</div>` : !isFile ? `<div class="redirect-text">Putar langsung di halaman ini, atau buka berkas asli dengan tombol di bawah.</div>` : ""}

    <div class="btn-group">
      ${isFile ? `<a href="${safeShareUrl}" class="btn btn-primary" id="download-btn" target="_blank" rel="noopener noreferrer" download>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Unduh Berkas (${safeSize})
            </a>
            <button class="btn btn-secondary" id="copy-btn" onclick="copyLink()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              Salin Tautan
            </button>` : `<div class="btn-row">
              <a href="${safeShareUrl}" class="btn btn-primary" id="open-btn">Buka Berkas</a>
              <button class="btn btn-secondary" id="copy-btn" onclick="copyLink()">Salin Tautan</button>
            </div>`}
    </div>
  </div>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(function() {
        const btn = document.getElementById('copy-btn');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerText = 'Tersalin!';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      });
    }

    function copyCodeContent() {
      var payloadEl = document.getElementById('raw-code-payload');
      var btn = document.getElementById('copy-code-btn');
      var textEl = document.getElementById('copy-code-text');
      var iconEl = document.getElementById('copy-code-icon');
      if (!payloadEl || !btn) return;
      try {
        var rawText = JSON.parse(payloadEl.textContent || '""');
        navigator.clipboard.writeText(rawText).then(function() {
          btn.classList.add('copied');
          if (textEl) textEl.textContent = 'Tersalin!';
          if (iconEl) iconEl.innerHTML = '<polyline points="20 6 9 17 4 12" stroke-width="2.5"/>';
          setTimeout(function() {
            btn.classList.remove('copied');
            if (textEl) textEl.textContent = 'Salin Isi';
            if (iconEl) iconEl.innerHTML = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
          }, 2000);
        });
      } catch (e) {
        console.error('Gagal menyalin isi kode:', e);
      }
    }

    function formatTime(secs) {
      if (!secs || isNaN(secs) || secs < 0) return '0:00';
      var m = Math.floor(secs / 60);
      var s = Math.floor(secs % 60);
      return m + ':' + (s < 10 ? '0' + s : s);
    }

    // --- VIDEO PLAYER CONTROLS ---
    (function initVideoPlayer() {
      var video = document.getElementById('airshare-video');
      if (!video) return;

      var wrap = document.getElementById('video-wrapper');
      var controls = document.getElementById('video-controls');
      var bigPlayBtn = document.getElementById('big-play-btn');
      var playBtn = document.getElementById('vid-play-btn');
      var playIcon = document.getElementById('vid-play-icon');
      var rewindBtn = document.getElementById('vid-rewind-btn');
      var forwardBtn = document.getElementById('vid-forward-btn');
      var timeDisplay = document.getElementById('video-time-display');
      var timeline = document.getElementById('video-timeline');
      var progress = document.getElementById('video-progress');
      var buffered = document.getElementById('video-buffered');
      var thumb = document.getElementById('video-thumb');
      var speedBtn = document.getElementById('vid-speed-btn');
      var pipBtn = document.getElementById('vid-pip-btn');
      var fsBtn = document.getElementById('vid-fs-btn');

      var speeds = [1, 1.25, 1.5, 2];
      var speedIdx = 0;
      var hideTimer = null;

      function updatePlayState(playing) {
        if (playing) {
          playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          if (bigPlayBtn) bigPlayBtn.classList.add('hidden');
          scheduleControlsHide();
        } else {
          playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
          if (bigPlayBtn) bigPlayBtn.classList.remove('hidden');
          if (controls) controls.classList.remove('hidden');
        }
      }

      function togglePlay() {
        if (video.paused || video.ended) {
          video.play().catch(function() {});
        } else {
          video.pause();
        }
      }

      if (bigPlayBtn) bigPlayBtn.addEventListener('click', togglePlay);
      if (playBtn) playBtn.addEventListener('click', togglePlay);
      video.addEventListener('click', function() {
        if (controls && controls.classList.contains('hidden')) {
          controls.classList.remove('hidden');
          scheduleControlsHide();
          return;
        }
        togglePlay();
      });

      video.addEventListener('play', function() { updatePlayState(true); });
      video.addEventListener('pause', function() { updatePlayState(false); });
      video.addEventListener('ended', function() { updatePlayState(false); });

      if (rewindBtn) rewindBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 10);
      });
      if (forwardBtn) forwardBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      });

      // Time & Progress update
      video.addEventListener('timeupdate', function() {
        var cur = video.currentTime || 0;
        var dur = video.duration || 0;
        if (timeDisplay) timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);
        if (dur > 0 && !isSeeking) {
          var pct = (cur / dur) * 100;
          if (progress) progress.style.width = pct + '%';
          if (thumb) thumb.style.left = pct + '%';
        }
      });

      // Buffered update
      video.addEventListener('progress', function() {
        if (video.buffered.length > 0 && video.duration) {
          var bufEnd = video.buffered.end(video.buffered.length - 1);
          var pct = (bufEnd / video.duration) * 100;
          if (buffered) buffered.style.width = pct + '%';
        }
      });

      // Seeking
      var isSeeking = false;
      function seek(e) {
        if (!timeline || !video.duration) return;
        var rect = timeline.getBoundingClientRect();
        var clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
        var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (progress) progress.style.width = (pos * 100) + '%';
        if (thumb) thumb.style.left = (pos * 100) + '%';
        video.currentTime = pos * video.duration;
      }

      if (timeline) {
        timeline.addEventListener('pointerdown', function(e) {
          isSeeking = true;
          seek(e);
          function onPointerMove(ev) { if (isSeeking) seek(ev); }
          function onPointerUp() {
            isSeeking = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          }
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        });
      }

      // Speed
      if (speedBtn) {
        speedBtn.addEventListener('click', function() {
          speedIdx = (speedIdx + 1) % speeds.length;
          var s = speeds[speedIdx];
          video.playbackRate = s;
          speedBtn.textContent = s + 'x';
        });
      }

      // PiP
      if (pipBtn) {
        if ('pictureInPictureEnabled' in document) {
          pipBtn.addEventListener('click', function() {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture();
            } else {
              video.requestPictureInPicture().catch(function() {});
            }
          });
        } else {
          pipBtn.style.display = 'none';
        }
      }

      // Fullscreen
      if (fsBtn) {
        fsBtn.addEventListener('click', function() {
          if (!document.fullscreenElement) {
            wrap.requestFullscreen().catch(function() {});
          } else {
            document.exitFullscreen().catch(function() {});
          }
        });
      }

      // Inactivity autohide
      function scheduleControlsHide() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(function() {
          if (!video.paused && controls) {
            controls.classList.add('hidden');
          }
        }, 2500);
      }
      if (wrap) {
        wrap.addEventListener('mousemove', function() {
          if (controls) controls.classList.remove('hidden');
          scheduleControlsHide();
        });
        wrap.addEventListener('touchstart', function() {
          if (controls) controls.classList.remove('hidden');
          scheduleControlsHide();
        }, { passive: true });
      }
    })();

    // --- AUDIO PLAYER CONTROLS ---
    (function initAudioPlayer() {
      var audio = document.getElementById('airshare-audio');
      if (!audio) return;

      var playBtn = document.getElementById('aud-play-btn');
      var playIcon = document.getElementById('aud-play-icon');
      var rewindBtn = document.getElementById('aud-rewind-btn');
      var forwardBtn = document.getElementById('aud-forward-btn');
      var curTime = document.getElementById('audio-cur-time');
      var durTime = document.getElementById('audio-dur-time');
      var timeline = document.getElementById('audio-timeline');
      var progress = document.getElementById('audio-progress');
      var buffered = document.getElementById('audio-buffered');
      var thumb = document.getElementById('audio-thumb');
      var speedBtn = document.getElementById('aud-speed-btn');
      var coverBox = document.getElementById('audio-cover-box');

      var speeds = [1, 1.25, 1.5, 2];
      var speedIdx = 0;

      function updatePlayState(playing) {
        if (playing) {
          playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          if (coverBox) coverBox.classList.add('spinning');
        } else {
          playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
          if (coverBox) coverBox.classList.remove('spinning');
        }
      }

      function togglePlay() {
        if (audio.paused || audio.ended) {
          audio.play().catch(function() {});
        } else {
          audio.pause();
        }
      }

      if (playBtn) playBtn.addEventListener('click', togglePlay);
      audio.addEventListener('play', function() { updatePlayState(true); });
      audio.addEventListener('pause', function() { updatePlayState(false); });
      audio.addEventListener('ended', function() { updatePlayState(false); });

      if (rewindBtn) rewindBtn.addEventListener('click', function() {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      });
      if (forwardBtn) forwardBtn.addEventListener('click', function() {
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
      });

      audio.addEventListener('timeupdate', function() {
        var cur = audio.currentTime || 0;
        var dur = audio.duration || 0;
        if (curTime) curTime.textContent = formatTime(cur);
        if (durTime) durTime.textContent = formatTime(dur);
        if (dur > 0 && !isSeeking) {
          var pct = (cur / dur) * 100;
          if (progress) progress.style.width = pct + '%';
          if (thumb) thumb.style.left = pct + '%';
        }
      });

      audio.addEventListener('loadedmetadata', function() {
        if (durTime && audio.duration) {
          durTime.textContent = formatTime(audio.duration);
        }
      });

      audio.addEventListener('progress', function() {
        if (audio.buffered.length > 0 && audio.duration) {
          var bufEnd = audio.buffered.end(audio.buffered.length - 1);
          var pct = (bufEnd / audio.duration) * 100;
          if (buffered) buffered.style.width = pct + '%';
        }
      });

      var isSeeking = false;
      function seek(e) {
        if (!timeline || !audio.duration) return;
        var rect = timeline.getBoundingClientRect();
        var clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
        var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (progress) progress.style.width = (pos * 100) + '%';
        if (thumb) thumb.style.left = (pos * 100) + '%';
        audio.currentTime = pos * audio.duration;
      }

      if (timeline) {
        timeline.addEventListener('pointerdown', function(e) {
          isSeeking = true;
          seek(e);
          function onPointerMove(ev) { if (isSeeking) seek(ev); }
          function onPointerUp() {
            isSeeking = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          }
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        });
      }

      if (speedBtn) {
        speedBtn.addEventListener('click', function() {
          speedIdx = (speedIdx + 1) % speeds.length;
          var s = speeds[speedIdx];
          audio.playbackRate = s;
          speedBtn.textContent = s + 'x';
        });
      }
    })();

    try {
      var timeEl = document.getElementById('upload-time-text');
      if (timeEl && timeEl.dataset.timestamp) {
        var ts = parseInt(timeEl.dataset.timestamp, 10);
        if (!isNaN(ts) && ts > 0) {
          var uploadDate = new Date(ts);
          var now = Date.now();
          var diffMs = now - ts;
          var diffSecs = Math.max(0, Math.floor(diffMs / 1000));
          var rel = 'Baru saja';
          if (diffSecs >= 60) {
            var diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) rel = diffMins + ' menit lalu';
            else {
              var diffHours = Math.floor(diffMins / 60);
              if (diffHours < 24) rel = diffHours + ' jam lalu';
              else {
                var diffDays = Math.floor(diffHours / 24);
                if (diffDays < 30) rel = diffDays + ' hari lalu';
                else rel = Math.floor(diffDays / 30) + ' bulan lalu';
              }
            }
          }
          var formattedLocale = uploadDate.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          timeEl.textContent = formattedLocale + ' \u2022 ' + rel;
          var wrap = document.getElementById('upload-time-wrap');
          if (wrap) {
            wrap.title = 'Waktu Unggah: ' + uploadDate.toLocaleString();
          }
        }
      }
    } catch (e) {}
  </script>
</body>
</html>`;
  }
};
var shareController = new ShareController();

// src/server/security/admin-auth.ts
import bcrypt from "bcryptjs";
import crypto2 from "crypto";
var ADMIN_COOKIE_NAME = "admin_auth_token";
var ADMIN_SESSION_TTL_SECONDS = 3600;
var inMemoryAdminSessions = /* @__PURE__ */ new Map();
function cleanupMemorySessions() {
  const now = Date.now();
  for (const [token, session] of inMemoryAdminSessions.entries()) {
    if (session.expiresAt <= now) {
      inMemoryAdminSessions.delete(token);
    }
  }
}
var ADMIN_PANEL_PATH = "admin";
var cachedAdminSecretKey = null;
var cachedAdminSecretHash = null;
function getAdminConfig() {
  const rawSecret = process.env.ADMIN_SECRET_KEY?.trim() || "";
  const isSecretValid = rawSecret.length >= 16;
  if (!isSecretValid) {
    return {
      enabled: false,
      panelPath: ADMIN_PANEL_PATH,
      secretKey: ""
    };
  }
  return {
    enabled: true,
    panelPath: ADMIN_PANEL_PATH,
    secretKey: rawSecret
  };
}
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
async function verifyAdminPassword(inputPassword) {
  const { enabled, secretKey } = getAdminConfig();
  if (!enabled || !secretKey || !inputPassword) {
    return false;
  }
  if (!cachedAdminSecretHash || cachedAdminSecretKey !== secretKey) {
    cachedAdminSecretHash = await hashPassword(secretKey);
    cachedAdminSecretKey = secretKey;
  }
  return verifyPassword(inputPassword, cachedAdminSecretHash);
}
async function createAdminSession(req) {
  const token = crypto2.randomBytes(32).toString("hex");
  const now = Date.now();
  const clientIp = req ? getClientIp(req) : "127.0.0.1";
  const userAgent = req?.headers["user-agent"] || "Unknown Client";
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.set(`admin_session:${token}`, "valid", { ex: ADMIN_SESSION_TTL_SECONDS });
      pipeline.set(
        `admin_session_meta:${token}`,
        JSON.stringify({ token, loginAt: now, ip: clientIp, userAgent }),
        { ex: ADMIN_SESSION_TTL_SECONDS }
      );
      pipeline.sadd("admin_active_sessions", token);
      await pipeline.exec();
      return token;
    } catch (err) {
      console.warn("[ADMIN_SESSION_REDIS_ERROR] Gagal menyimpan sesi admin di Redis, fallback memory:", err);
    }
  }
  cleanupMemorySessions();
  inMemoryAdminSessions.set(token, {
    expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1e3,
    loginAt: now,
    ip: clientIp,
    userAgent
  });
  return token;
}
async function verifyAdminSession(token) {
  if (!token || typeof token !== "string" || token.length < 32) {
    return false;
  }
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get(`admin_session:${token}`);
      return val === "valid";
    } catch (err) {
      console.warn("[ADMIN_SESSION_REDIS_ERROR] Gagal memverifikasi sesi admin di Redis, fallback memory:", err);
    }
  }
  cleanupMemorySessions();
  const session = inMemoryAdminSessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    inMemoryAdminSessions.delete(token);
    return false;
  }
  return true;
}
async function destroyAdminSession(token) {
  if (!token) return;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.del(`admin_session:${token}`);
      pipeline.del(`admin_session_meta:${token}`);
      pipeline.srem("admin_active_sessions", token);
      await pipeline.exec();
    } catch (err) {
      console.warn("[ADMIN_SESSION_REDIS_ERROR] Gagal menghapus sesi admin dari Redis:", err);
    }
  }
  inMemoryAdminSessions.delete(token);
}
async function getAllActiveSessions(currentToken) {
  const sessions = [];
  const now = Date.now();
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const rawTokens = await redis.smembers("admin_active_sessions");
      if (Array.isArray(rawTokens) && rawTokens.length > 0) {
        const tokensToPurge = [];
        for (const t of rawTokens) {
          if (typeof t !== "string") continue;
          const status = await redis.get(`admin_session:${t}`);
          if (status !== "valid") {
            tokensToPurge.push(t);
            continue;
          }
          const rawMeta = await redis.get(
            `admin_session_meta:${t}`
          );
          let meta = { token: t, loginAt: now, ip: "127.0.0.1", userAgent: "Browser Client" };
          if (rawMeta) {
            meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
          }
          sessions.push({
            token: t,
            tokenPreview: `${t.substring(0, 8)}...`,
            loginAt: meta.loginAt || now,
            ip: meta.ip || "127.0.0.1",
            userAgent: meta.userAgent || "Browser Client",
            isCurrent: Boolean(currentToken && currentToken === t)
          });
        }
        if (tokensToPurge.length > 0) {
          const pipeline = redis.pipeline();
          for (const deadToken of tokensToPurge) {
            pipeline.srem("admin_active_sessions", deadToken);
            pipeline.del(`admin_session:${deadToken}`);
            pipeline.del(`admin_session_meta:${deadToken}`);
          }
          await pipeline.exec();
        }
        return sessions.sort((a, b) => b.loginAt - a.loginAt);
      }
    } catch (err) {
      console.warn("[ADMIN_ACTIVE_SESSIONS] Gagal membaca sesi dari Redis, fallback memory:", err);
    }
  }
  cleanupMemorySessions();
  for (const [t, s] of inMemoryAdminSessions.entries()) {
    sessions.push({
      token: t,
      tokenPreview: `${t.substring(0, 8)}...`,
      loginAt: s.loginAt || now,
      ip: s.ip || "127.0.0.1",
      userAgent: s.userAgent || "Browser Client",
      isCurrent: Boolean(currentToken && currentToken === t)
    });
  }
  return sessions.sort((a, b) => b.loginAt - a.loginAt);
}
async function revokeAdminSession(token) {
  if (!token || typeof token !== "string") return false;
  await destroyAdminSession(token);
  return true;
}
async function revokeAllAdminSessions(preserveToken) {
  const allSessions = await getAllActiveSessions();
  let revokedCount = 0;
  for (const session of allSessions) {
    if (preserveToken && session.token === preserveToken) {
      continue;
    }
    await destroyAdminSession(session.token);
    revokedCount++;
  }
  return revokedCount;
}
async function checkAdminLoginRateLimit(req) {
  const limiter = getRateLimiter();
  const clientIp = getClientIp(req);
  const key = `admin_login:${clientIp}`;
  const limit = 5;
  const windowMs = 15 * 60 * 1e3;
  const result = await limiter.check(key, limit, windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetTimeMs - Date.now()) / 1e3));
  return {
    allowed: result.allowed,
    retryAfterSeconds
  };
}
async function requireAdminAuth(req, res, next) {
  const { enabled, panelPath } = getAdminConfig();
  if (!enabled) {
    res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
    return;
  }
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  const isValid = token ? await verifyAdminSession(token) : false;
  if (!isValid) {
    const isApiRequest = req.path.includes("/api/") || req.xhr || req.headers.accept?.includes("application/json");
    if (!isApiRequest && req.accepts("html")) {
      res.redirect(`/${panelPath}/login`);
      return;
    }
    res.status(401).json({
      success: false,
      error: {
        code: "ADMIN_UNAUTHORIZED",
        message: "Akses ditolak. Sesi admin diperlukan."
      }
    });
    return;
  }
  next();
}

// src/server/api/admin-operational-panel.ts
function escapeHtml2(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatRelativeTime2(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "Baru saja";
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1e3));
  if (diffSecs < 60) return "Baru saja";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} menit lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}
function formatAbsoluteTime(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "-";
  const d = new Date(timestamp);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function renderOperationalControlsHtml(config2) {
  const isMaintenance = config2.maintenanceMode;
  const announcement = config2.announcement || { message: "", type: "info", enabled: false, updatedAt: 0 };
  const maxMb = Math.round(config2.maxUploadSize / (1024 * 1024));
  return `
  <!-- Kontrol Operasional & Konfigurasi Dinamis Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="operational-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        Kontrol Operasional &amp; Konfigurasi Dinamis (Redis-Backed)
      </h2>
      <span class="panel-badge">Tanpa Redeploy</span>
    </div>

    <!-- Kill Switch Section -->
    <div style="background: ${isMaintenance ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.08)"}; border: 1px solid ${isMaintenance ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.25)"}; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <span class="status-indicator ${isMaintenance ? "status-err pulsing" : "status-ok"}"></span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: ${isMaintenance ? "#f87171" : "#34d399"};">
            ${isMaintenance ? "KILL SWITCH AKTIF \u2014 Unggahan Dinonaktifkan (503)" : "Layanan Normal \u2014 Unggahan Terbuka"}
          </div>
          <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem;">
            ${isMaintenance ? "Pengguna yang mencoba mengunggah akan menerima respon HTTP 503 Maintenance Mode." : "Semua pengguna dapat mengunggah berkas sesuai kapasitas yang ditentukan."}
          </div>
        </div>
      </div>
      <button type="button" id="btn-toggle-maintenance" class="${isMaintenance ? "btn-maint-disable" : "btn-maint-enable"}" data-active="${isMaintenance ? "true" : "false"}">
        ${isMaintenance ? "Nonaktifkan Maintenance Mode" : "Aktifkan Kill Switch (Tutup Unggah)"}
      </button>
    </div>

    <!-- 2 Column Config Forms -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
      <!-- Announcement Banner Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
          Banner Pengumuman Sistem
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Teks Pengumuman</label>
            <textarea id="announcement-message" rows="3" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.6rem 0.75rem; font-size: 0.825rem; resize: vertical;" placeholder="Contoh: Pemeliharaan server dijadwalkan pukul 23:00 WIB...">${escapeHtml2(announcement.message || "")}</textarea>
          </div>

          <div class="config-form-grid">
            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Tipe Tampilan</label>
              <select id="announcement-type" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;">
                <option value="info" ${announcement.type === "info" ? "selected" : ""}>Info (Biru)</option>
                <option value="warning" ${announcement.type === "warning" ? "selected" : ""}>Peringatan (Kuning/Oranye)</option>
                <option value="success" ${announcement.type === "success" ? "selected" : ""}>Sukses (Hijau)</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Status Banner</label>
              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.825rem; font-weight: 600; height: 36px; cursor: pointer;">
                <input type="checkbox" id="announcement-enabled" ${announcement.enabled ? "checked" : ""} style="width: 16px; height: 16px; accent-color: var(--accent);" />
                <span>Tampilkan Banner</span>
              </label>
            </div>
          </div>

          <button type="button" id="btn-save-announcement" class="btn-primary-config" style="margin-top: 0.5rem;">
            Simpan Pengumuman
          </button>
        </div>
      </div>

      <!-- Limit & Feature Flags Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Batas Unggah &amp; Feature Flags
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div class="config-form-grid">
            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Maksimal Ukuran (MB)</label>
              <input type="number" id="cfg-max-upload" min="1" max="500" value="${maxMb}" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
              <span style="font-size: 0.7rem; color: var(--muted);">Catbox max: 200-500 MB</span>
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Rate Limit (Upload/menit)</label>
              <input type="number" id="cfg-rate-limit" min="1" max="200" value="${config2.rateLimit.limit}" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
              <span style="font-size: 0.7rem; color: var(--muted);">Per IP klien per menit</span>
            </div>
          </div>

          <div style="padding-top: 0.5rem; border-top: 1px solid var(--border);">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--muted); margin-bottom: 0.5rem;">Feature Toggles Frontend:</div>
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-paste" ${config2.featureFlags.pasteToUpload ? "checked" : ""} style="accent-color: var(--accent);" />
                <span>Paste-to-Upload (Ctrl+V di halaman)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-qrcode" ${config2.featureFlags.qrCode ? "checked" : ""} style="accent-color: var(--accent);" />
                <span>Tombol &amp; Modal Kode QR Publik</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-pwa" ${config2.featureFlags.pwaInstallPrompt ? "checked" : ""} style="accent-color: var(--accent);" />
                <span>Prompt Instalasi PWA di Header</span>
              </label>
            </div>
          </div>

          <button type="button" id="btn-save-limits-flags" class="btn-primary-config" style="margin-top: 0.5rem;">
            Simpan Konfigurasi Dinamis
          </button>
        </div>
      </div>
    </div>
  </section>`;
}
function renderActiveSessionsHtml(sessions) {
  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;
  return `
  <!-- Manajemen Sesi Admin Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="sessions-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Sesi Admin Aktif (${sessions.length} Sesi Terbuka)
      </h2>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span class="panel-badge">TTL: 1 Jam</span>
        ${otherSessionsCount > 0 ? `<button type="button" id="btn-revoke-all-sessions" class="btn-revoke-all" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">Cabut Semua Sesi Lain (${otherSessionsCount})</button>` : ""}
      </div>
    </div>

    <div class="table-container">
      <table style="min-width: 660px;">
        <thead>
          <tr>
            <th style="width: 120px;">Token Sesi</th>
            <th style="width: 140px;">Waktu Login</th>
            <th style="width: 130px;">IP Klien</th>
            <th style="min-width: 160px;">User Agent</th>
            <th style="width: 100px;">Status</th>
            <th style="width: 80px; text-align: center;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.length === 0 ? `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2rem;">Tidak ada sesi aktif.</td></tr>` : sessions.map((s) => `
            <tr id="session-row-${escapeHtml2(s.token)}">
              <td>
                <code style="background: rgba(255,255,255,0.06); padding: 0.25rem 0.45rem; border-radius: 4px; font-size: 0.75rem; color: #a5b4fc; font-weight: 600; white-space: nowrap;">
                  ${escapeHtml2(s.tokenPreview)}
                </code>
              </td>
              <td>
                <div style="font-weight: 600; font-size: 0.8rem; white-space: nowrap;">${formatRelativeTime2(s.loginAt)}</div>
                <div style="font-size: 0.7rem; color: var(--muted); white-space: nowrap;">${formatAbsoluteTime(s.loginAt)}</div>
              </td>
              <td style="font-weight: 600; font-size: 0.8rem; white-space: nowrap;">${escapeHtml2(s.ip)}</td>
              <td>
                <div style="font-size: 0.75rem; color: var(--muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml2(s.userAgent)}">
                  ${escapeHtml2(s.userAgent)}
                </div>
              </td>
              <td>
                ${s.isCurrent ? `<span style="display: inline-block; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; white-space: nowrap;">Sesi Ini</span>` : `<span style="display: inline-block; background: rgba(255, 255, 255, 0.08); color: var(--muted); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; white-space: nowrap;">Perangkat Lain</span>`}
              </td>
              <td style="text-align: center;">
                ${s.isCurrent ? `<span style="font-size: 0.75rem; color: var(--muted);">-</span>` : `<button type="button" class="btn-revoke-single" data-token="${escapeHtml2(s.token)}" style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.25rem 0.55rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">Cabut</button>`}
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}
function renderBulkCleanupHtml() {
  return `
  <!-- Pembersihan Massal (Bulk Cleanup) Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="bulk-cleanup-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        Pembersihan Massal Berkas (Bulk Cleanup Berdasarkan Kriteria)
      </h2>
      <span class="panel-badge">Two-Phase Safe Execution</span>
    </div>

    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
      <p style="font-size: 0.8rem; color: var(--muted); margin-bottom: 1rem;">
        Bersihkan berkas lama yang tidak aktif dalam jumlah banyak sekaligus. Setiap eksekusi wajib melalui tahap <strong>Pratinjau Dampak</strong> dan <strong>Ketik Konfirmasi Teks</strong> sebelum penghapusan permanen dijalankan.
      </p>

      <!-- Filter Controls -->
      <div style="display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
        <div style="flex: 1; min-width: 160px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Usia Berkas (Diunggah Sebelum)</label>
          <select id="cleanup-older-than" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;">
            <option value="7">Lebih dari 7 Hari Lalu</option>
            <option value="30" selected>Lebih dari 30 Hari Lalu</option>
            <option value="60">Lebih dari 60 Hari Lalu</option>
            <option value="90">Lebih dari 90 Hari Lalu</option>
            <option value="0">Semua Usia Berkas</option>
          </select>
        </div>

        <div style="flex: 1; min-width: 160px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Maksimal Jumlah Tayangan (Views)</label>
          <input type="number" id="cleanup-max-views" min="0" value="0" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
          <span style="font-size: 0.7rem; color: var(--muted);">0 = tidak pernah dilihat siapapun</span>
        </div>

        <button type="button" id="btn-preview-cleanup" style="background: var(--accent); color: var(--accent-text, #fff); border: none; padding: 0.55rem 1.25rem; border-radius: 6px; font-size: 0.825rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; height: 38px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Pratinjau Berkas Terdampak
        </button>
      </div>

      <!-- Preview Results Container (Hidden initially) -->
      <div id="cleanup-preview-container" style="display: none; border-top: 1px solid var(--border); padding-top: 1.25rem;">
        <div id="cleanup-preview-summary" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 1rem; margin-bottom: 1rem; font-size: 0.85rem; color: #fbbf24;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Matched Items List (Collapsible) -->
        <div id="cleanup-preview-items" style="max-height: 220px; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 1rem; padding: 0.5rem;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Safety Confirmation Input & Execute Button -->
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: #f87171;">
            PERINGATAN: Penghapusan bersifat ireversibel dari server Catbox &amp; database AirShare!
          </div>
          <div style="font-size: 0.75rem; color: var(--muted);">
            Ketik teks berikut persis untuk mengaktifkan tombol eksekusi: <code style="color: #fff; background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: 800;">KONFIRMASI HAPUS MASSAL</code>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <input type="text" id="cleanup-confirm-text" placeholder="KONFIRMASI HAPUS MASSAL" style="flex: 1; min-width: 240px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.75rem; font-size: 0.825rem;" />
            <button type="button" id="btn-execute-cleanup" disabled style="background: #ef4444; color: #fff; border: none; padding: 0.55rem 1.25rem; border-radius: 6px; font-size: 0.825rem; font-weight: 700; cursor: not-allowed; opacity: 0.5;">
              Jalankan Hapus Massal Permanen
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}
function renderAuditLogsHtml(logs) {
  return `
  <!-- Log Aktivitas Admin (Audit Log) Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="audit-log-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Log Aktivitas Keamanan &amp; Audit Admin (50 Tindakan Terakhir)
      </h2>
      <span class="panel-badge">Retensi 90 Hari</span>
    </div>

    <div class="table-container" style="max-height: 420px; overflow-y: auto;">
      <table style="min-width: 680px;">
        <thead>
          <tr>
            <th style="width: 140px; position: sticky; top: 0; background: var(--card); z-index: 2;">Waktu</th>
            <th style="width: 150px; position: sticky; top: 0; background: var(--card); z-index: 2;">Jenis Tindakan</th>
            <th style="min-width: 260px; position: sticky; top: 0; background: var(--card); z-index: 2;">Detail &amp; Dampak</th>
            <th style="width: 120px; position: sticky; top: 0; background: var(--card); z-index: 2;">IP Admin</th>
          </tr>
        </thead>
        <tbody>
          ${logs.length === 0 ? `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 2rem;">Belum ada log aktivitas yang tercatat.</td></tr>` : logs.map((log) => {
    let badgeColor = "#60a5fa";
    let badgeBg = "rgba(96, 165, 250, 0.15)";
    if (log.type.includes("FAIL") || log.type.includes("REVOKE") || log.type.includes("DELETE") || log.type.includes("CLEANUP")) {
      badgeColor = "#f87171";
      badgeBg = "rgba(239, 68, 68, 0.15)";
    } else if (log.type.includes("MAINTENANCE")) {
      badgeColor = "#fbbf24";
      badgeBg = "rgba(245, 158, 11, 0.15)";
    } else if (log.type.includes("LOGIN") || log.type.includes("SYNC")) {
      badgeColor = "#34d399";
      badgeBg = "rgba(16, 185, 129, 0.15)";
    }
    return `
            <tr>
              <td style="white-space: nowrap;">
                <div style="font-weight: 600; font-size: 0.78rem;">${formatRelativeTime2(log.timestamp)}</div>
                <div style="font-size: 0.68rem; color: var(--muted);">${formatAbsoluteTime(log.timestamp)}</div>
              </td>
              <td>
                <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; white-space: nowrap;">
                  ${escapeHtml2(log.type)}
                </span>
              </td>
              <td style="font-size: 0.8rem; line-height: 1.45; word-break: break-word;">
                ${escapeHtml2(log.detail)}
              </td>
              <td style="font-size: 0.78rem; font-weight: 600; color: var(--muted); white-space: nowrap;">
                ${escapeHtml2(log.ip || "-")}
              </td>
            </tr>`;
  }).join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}
function getOperationalPanelStyles() {
  return `
    .config-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 640px) {
      .config-form-grid {
        grid-template-columns: 1fr;
      }
    }
    .btn-maint-enable {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
      padding: 0.45rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-maint-enable:hover {
      background: rgba(239, 68, 68, 0.35);
    }
    .btn-maint-disable {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 0.45rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-maint-disable:hover {
      background: rgba(16, 185, 129, 0.35);
    }
    .btn-primary-config {
      background: var(--accent);
      color: var(--accent-text, #fff);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn-primary-config:hover {
      opacity: 0.9;
    }
    .pulsing {
      animation: pulse-dot 1.5s infinite;
    }
    @keyframes pulse-dot {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
}
function getOperationalPanelScripts(panelPath) {
  return `
    // Operational Controls JS Handler
    (function() {
      const pPath = ${JSON.stringify(panelPath)};

      // Helper function for alerts/confirms (falls back to native if custom not ready)
      async function alertIos(title, message, icon) {
        if (typeof window.showIosAlert === 'function') {
          return await window.showIosAlert({ title, message, icon: icon || 'info' });
        } else {
          alert(title + '\\n\\n' + message);
        }
      }

      async function confirmIos(title, message, isDestructive, confirmText) {
        if (typeof window.showIosConfirm === 'function') {
          return await window.showIosConfirm({
            title,
            message,
            isDestructive: isDestructive !== false,
            confirmText: confirmText || (isDestructive ? 'Ya, Lanjutkan' : 'Konfirmasi')
          });
        } else {
          return confirm(title + '\\n\\n' + message);
        }
      }

      // 1. Toggle Maintenance Kill Switch
      const btnMaint = document.getElementById('btn-toggle-maintenance');
      if (btnMaint) {
        btnMaint.addEventListener('click', async function() {
          const currentlyActive = btnMaint.getAttribute('data-active') === 'true';
          const newTarget = !currentlyActive;
          
          const confirmed = await confirmIos(
            newTarget ? 'Aktifkan Kill Switch?' : 'Nonaktifkan Maintenance?',
            newTarget
              ? 'PERINGATAN: Mengaktifkan Kill Switch akan menutup seluruh akses upload publik (HTTP 503 Maintenance). Halaman admin tetap dapat diakses.'
              : 'Layanan upload publik akan kembali dibuka secara normal untuk semua pengguna.',
            newTarget,
            newTarget ? 'Aktifkan Kill Switch' : 'Buka Layanan Normal'
          );
          if (!confirmed) return;

          try {
            btnMaint.disabled = true;
            btnMaint.textContent = 'Memproses...';
            const res = await fetch('/' + pPath + '/api/maintenance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: newTarget }),
            });
            const data = await res.json();
            if (data.success) {
              window.location.reload();
            } else {
              await alertIos('Gagal Mengubah Mode', data.error?.message || 'Terjadi kesalahan sistem.', 'danger');
              window.location.reload();
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            window.location.reload();
          }
        });
      }

      // 2. Save Announcement Banner
      const btnSaveAnnounce = document.getElementById('btn-save-announcement');
      if (btnSaveAnnounce) {
        btnSaveAnnounce.addEventListener('click', async function() {
          const message = document.getElementById('announcement-message').value.trim();
          const type = document.getElementById('announcement-type').value;
          const enabled = document.getElementById('announcement-enabled').checked;

          try {
            btnSaveAnnounce.disabled = true;
            btnSaveAnnounce.textContent = 'Menyimpan...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                announcement: { message, type, enabled }
              }),
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Pengumuman Disimpan', 'Banner pengumuman publik berhasil diperbarui.', 'success');
            } else {
              await alertIos('Gagal Menyimpan', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnSaveAnnounce.disabled = false;
            btnSaveAnnounce.textContent = 'Simpan Pengumuman';
          }
        });
      }

      // 3. Save Limits and Feature Flags
      const btnSaveLimits = document.getElementById('btn-save-limits-flags');
      if (btnSaveLimits) {
        btnSaveLimits.addEventListener('click', async function() {
          const maxUploadMb = parseInt(document.getElementById('cfg-max-upload').value, 10);
          const rateLimit = parseInt(document.getElementById('cfg-rate-limit').value, 10);
          const pasteToUpload = document.getElementById('flag-paste').checked;
          const qrCode = document.getElementById('flag-qrcode').checked;
          const pwaInstallPrompt = document.getElementById('flag-pwa').checked;

          if (isNaN(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 500) {
            await alertIos('Ukuran Berkas Tidak Valid', 'Batas ukuran berkas harus bernilai antara 1 sampai 500 MB.', 'warning');
            return;
          }
          if (isNaN(rateLimit) || rateLimit < 1 || rateLimit > 200) {
            await alertIos('Rate Limit Tidak Valid', 'Rate limit harus bernilai antara 1 sampai 200 upload/menit.', 'warning');
            return;
          }

          try {
            btnSaveLimits.disabled = true;
            btnSaveLimits.textContent = 'Menyimpan...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                maxUploadSize: maxUploadMb * 1024 * 1024,
                rateLimit: { limit: rateLimit, windowMs: 60000 },
                featureFlags: { pasteToUpload, qrCode, pwaInstallPrompt }
              }),
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Konfigurasi Disimpan', 'Konfigurasi batas dinamis & feature flags berhasil diperbarui.', 'success');
            } else {
              await alertIos('Gagal Menyimpan', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnSaveLimits.disabled = false;
            btnSaveLimits.textContent = 'Simpan Konfigurasi Dinamis';
          }
        });
      }

      // 4. Revoke Sessions
      document.querySelectorAll('.btn-revoke-single').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          const token = btn.getAttribute('data-token');
          const confirmed = await confirmIos(
            'Cabut Sesi Admin Ini?',
            'Sesi pada perangkat tersebut akan langsung ditutup dan dipaksa logout.',
            true,
            'Cabut Sesi'
          );
          if (!confirmed) return;

          try {
            btn.disabled = true;
            btn.textContent = 'Mencabut...';
            const res = await fetch('/' + pPath + '/api/revoke-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokenToRevoke: token }),
            });
            const data = await res.json();
            if (data.success) {
              const row = document.getElementById('session-row-' + token);
              if (row) row.remove();
              await alertIos('Sesi Dicabut', 'Sesi admin tersebut telah berhasil dinonaktifkan.', 'success');
            } else {
              await alertIos('Gagal Mencabut Sesi', data.error?.message || 'Gagal mencabut sesi.', 'danger');
              btn.disabled = false;
              btn.textContent = 'Cabut';
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            btn.disabled = false;
            btn.textContent = 'Cabut';
          }
        });
      });

      const btnRevokeAll = document.getElementById('btn-revoke-all-sessions');
      if (btnRevokeAll) {
        btnRevokeAll.addEventListener('click', async function() {
          const confirmed = await confirmIos(
            'Cabut Semua Sesi Lain?',
            'Seluruh sesi admin pada perangkat lain akan langsung logout. Hanya sesi Anda saat ini yang akan tetap aktif.',
            true,
            'Cabut Semua Sesi Lain'
          );
          if (!confirmed) return;

          try {
            btnRevokeAll.disabled = true;
            btnRevokeAll.textContent = 'Memproses...';
            const res = await fetch('/' + pPath + '/api/revoke-all-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Berhasil', 'Berhasil mencabut ' + data.revokedCount + ' sesi admin lainnya.', 'success');
              window.location.reload();
            } else {
              await alertIos('Gagal', 'Gagal mencabut sesi admin lainnya.', 'danger');
              btnRevokeAll.disabled = false;
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            btnRevokeAll.disabled = false;
          }
        });
      }

      // 5. Bulk Cleanup Two-Phase Handler
      let cachedCandidates = [];
      const btnPreviewCleanup = document.getElementById('btn-preview-cleanup');
      const previewContainer = document.getElementById('cleanup-preview-container');
      const previewSummary = document.getElementById('cleanup-preview-summary');
      const previewItems = document.getElementById('cleanup-preview-items');
      const confirmInput = document.getElementById('cleanup-confirm-text');
      const btnExecuteCleanup = document.getElementById('btn-execute-cleanup');

      if (btnPreviewCleanup) {
        btnPreviewCleanup.addEventListener('click', async function() {
          const olderThanDays = parseInt(document.getElementById('cleanup-older-than').value, 10);
          const maxViews = parseInt(document.getElementById('cleanup-max-views').value, 10);

          try {
            btnPreviewCleanup.disabled = true;
            btnPreviewCleanup.textContent = 'Memindai Database...';
            const res = await fetch('/' + pPath + '/api/bulk-cleanup/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ olderThanDays, maxViews }),
            });
            const data = await res.json();
            if (data.success) {
              cachedCandidates = data.data.items || [];
              previewContainer.style.display = 'block';
              previewSummary.innerHTML = '<strong>' + data.data.total + ' berkas</strong> memenuhi kriteria. Estimasi kapasitas storage yang akan dibebaskan: <strong>' + data.data.formattedTotalBytes + '</strong>.';

              if (cachedCandidates.length === 0) {
                previewItems.innerHTML = '<div style="color: var(--muted); font-size: 0.8rem; text-align: center; padding: 1rem;">Tidak ada berkas yang cocok dengan kriteria.</div>';
                confirmInput.disabled = true;
                btnExecuteCleanup.disabled = true;
              } else {
                confirmInput.disabled = false;
                confirmInput.value = '';
                btnExecuteCleanup.disabled = true;
                btnExecuteCleanup.style.opacity = '0.5';
                btnExecuteCleanup.style.cursor = 'not-allowed';

                previewItems.innerHTML = cachedCandidates.map(function(item) {
                  return '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">' +
                    '<span style="font-weight: 600; max-width: clamp(120px, 40vw, 250px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (item.name || item.id) + '</span>' +
                    '<span style="color: var(--muted);">' + (item.formattedSize || '0 B') + ' | ' + (item.views || 0) + ' views</span>' +
                  '</div>';
                }).join('');
              }
            } else {
              await alertIos('Gagal Memuat Pratinjau', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnPreviewCleanup.disabled = false;
            btnPreviewCleanup.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> Pratinjau Berkas Terdampak';
          }
        });
      }

      if (confirmInput && btnExecuteCleanup) {
        confirmInput.addEventListener('input', function() {
          const val = confirmInput.value.trim();
          if (val === 'KONFIRMASI HAPUS MASSAL' && cachedCandidates.length > 0) {
            btnExecuteCleanup.disabled = false;
            btnExecuteCleanup.style.opacity = '1';
            btnExecuteCleanup.style.cursor = 'pointer';
          } else {
            btnExecuteCleanup.disabled = true;
            btnExecuteCleanup.style.opacity = '0.5';
            btnExecuteCleanup.style.cursor = 'not-allowed';
          }
        });

        btnExecuteCleanup.addEventListener('click', async function() {
          if (confirmInput.value.trim() !== 'KONFIRMASI HAPUS MASSAL') return;
          
          const confirmed = await confirmIos(
            'Hapus ' + cachedCandidates.length + ' Berkas Massal?',
            'PERINGATAN: Tindakan ini bersifat PERMANEN dan akan menghapus seluruh berkas terpilih dari server penyimpanan Catbox.',
            true,
            'Hapus Massal Sekarang'
          );
          if (!confirmed) return;

          const olderThanDays = parseInt(document.getElementById('cleanup-older-than').value, 10);
          const maxViews = parseInt(document.getElementById('cleanup-max-views').value, 10);

          try {
            btnExecuteCleanup.disabled = true;
            btnExecuteCleanup.textContent = 'Menghapus Berkas...';
            const res = await fetch('/' + pPath + '/api/bulk-cleanup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ olderThanDays, maxViews, confirm: true }),
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Pembersihan Selesai', data.data.succeeded + ' berkas berhasil dihapus permanen. Total storage dibebaskan: ' + data.data.formattedFreedBytes, 'success');
              window.location.reload();
            } else {
              await alertIos('Gagal Eksekusi', data.error?.message || 'Error', 'danger');
              btnExecuteCleanup.disabled = false;
              btnExecuteCleanup.textContent = 'Jalankan Hapus Massal Permanen';
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            btnExecuteCleanup.disabled = false;
          }
        });
      }

      // 6. Search files in Recent Uploads table & full database
      const searchInput = document.getElementById('search-files-input');
      const btnSearchDb = document.getElementById('btn-search-db');
      const btnResetSearch = document.getElementById('btn-reset-search');
      const searchCountLabel = document.getElementById('search-count-label');

      function filterTableLocally(term) {
        const rows = document.querySelectorAll('tr[id^="upload-row-"]');
        let matched = 0;
        rows.forEach(function(row) {
          const text = row.textContent.toLowerCase();
          if (!term || text.includes(term.toLowerCase())) {
            row.style.display = '';
            matched++;
          } else {
            row.style.display = 'none';
          }
        });
        if (searchCountLabel) {
          searchCountLabel.textContent = term ? ('Menampilkan ' + matched + ' hasil lokal') : '';
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          filterTableLocally(searchInput.value.trim());
        });
      }

      if (btnResetSearch) {
        btnResetSearch.addEventListener('click', function() {
          if (searchInput) searchInput.value = '';
          filterTableLocally('');
        });
      }

      if (btnSearchDb && searchInput) {
        btnSearchDb.addEventListener('click', async function() {
          const q = searchInput.value.trim();
          if (!q) {
            await alertIos('Pencarian', 'Masukkan kata kunci pencarian terlebih dahulu.', 'warning');
            return;
          }
          try {
            btnSearchDb.disabled = true;
            btnSearchDb.textContent = 'Mencari...';
            const res = await fetch('/' + pPath + '/api/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (data.success) {
              const items = data.data.items || [];
              await alertIos('Hasil Pencarian', 'Ditemukan ' + items.length + ' berkas di database yang cocok dengan "' + q + '".', 'info');
              filterTableLocally(q);
            } else {
              await alertIos('Pencarian Gagal', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnSearchDb.disabled = false;
            btnSearchDb.textContent = 'Cari di Seluruh DB';
          }
        });
      }
    })();
  `;
}

// src/server/api/admin-controller.ts
var storageProvider2 = new CatboxStorageProvider();
function escapeHtml3(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatBytes4(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function formatRelativeTime3(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "Baru saja";
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1e3));
  if (diffSecs < 60) return "Baru saja";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}j lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}h lalu`;
}
function formatAbsoluteTime2(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "-";
  const d = new Date(timestamp);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function renderSyncSummaryHtml(check) {
  if (!check) {
    return `
      <div class="sync-banner sync-banner-idle">
        <div>
          <strong>Status Sinkronisasi: Belum Pernah Diperiksa</strong>
          <div style="font-size: 0.8rem; margin-top: 0.25rem; color: var(--muted);">Klik tombol &quot;Jalankan Pemeriksaan Sinkronisasi&quot; di atas untuk memverifikasi apakah berkas yang tercatat di Redis masih benar-benar aktif di server Catbox.</div>
        </div>
      </div>`;
  }
  if (check.brokenCount === 0) {
    return `
      <div class="sync-banner sync-banner-ok">
        <div>
          <strong>Semua Berkas Tersinkronisasi Aktif!</strong>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">${check.totalChecked} dari ${check.totalChecked} berkas terbaru berhasil diverifikasi aktif di server Catbox (HTTP 200 OK). Tidak ada berkas yatim/rusak yang terdeteksi.</div>
        </div>
      </div>`;
  }
  return `
    <div class="sync-banner sync-banner-warn" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
      <div>
        <strong>Ditemukan Berkas Bermasalah: ${check.brokenCount} Berkas Rusak / Yatim!</strong>
        <div style="font-size: 0.8rem; margin-top: 0.25rem;">${check.healthyCount} dari ${check.totalChecked} berkas aktif. Terdapat <strong>${check.brokenCount} tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error). Anda dapat membersihkannya dari riwayat di bawah.</div>
      </div>
      <button type="button" id="btn-purge-all-broken" style="background: #ef4444; color: #fff; border: none; padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
        Bersihkan Semua ${check.brokenCount} Berkas Rusak (404)
      </button>
    </div>
    <div class="table-container" style="margin-top: 1rem;">
      <table>
        <thead>
          <tr>
            <th>Berkas Bermasalah</th>
            <th>Ukuran</th>
            <th>Tautan Catbox Asli</th>
            <th>Waktu Unggah</th>
            <th>Aksi Perbaikan</th>
          </tr>
        </thead>
        <tbody id="sync-broken-tbody">
          ${check.brokenItems.map(
    (item) => `
            <tr id="sync-row-${escapeHtml3(item.id)}">
              <td>
                <div style="font-weight: 700; color: #f87171; max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml3(
      item.name
    )}">
                  ${escapeHtml3(item.name)}
                </div>
                <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml3(item.id)}</div>
              </td>
              <td style="font-weight: 600;">${escapeHtml3(item.formattedSize)}</td>
              <td>
                <a href="${escapeHtml3(
      item.shareUrl
    )}" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted); max-width: clamp(120px, 40vw, 220px); display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml3(item.shareUrl)}
                </a>
              </td>
              <td>
                <div style="font-size: 0.8rem; font-weight: 600;">${formatRelativeTime3(
      item.createdAt
    )}</div>
              </td>
              <td>
                <button type="button" class="btn-delete-history" data-id="${escapeHtml3(
      item.id
    )}" data-name="${escapeHtml3(item.name)}">Hapus dari Riwayat</button>
              </td>
            </tr>`
  ).join("")}
        </tbody>
      </table>
    </div>`;
}
function generateRecommendations(stats, weeklyTrend, topFiles, maxUploadSize = 209715200) {
  const recommendations = [];
  if (stats.uploads > 0 && stats.averageFileSize > maxUploadSize * 0.5) {
    recommendations.push(
      `Rata-rata ukuran file hari ini (${stats.formattedAverageSize}) mendekati ambang batas kapasitas 200 MB. Pertimbangkan menaikkan batas upload atau mengoptimalkan kompresi sisi klien pada format video/audio.`
    );
  }
  if (topFiles.length > 0 && topFiles[0].views > 50) {
    const top = topFiles[0];
    const totalViews = stats.totalViews || 1;
    if (top.views > totalViews * 0.4 || top.views >= 100) {
      recommendations.push(
        `Berkas "${escapeHtml3(top.name || top.id)}" sangat populer dengan ${top.views} tayangan. Pertimbangkan integrasi CDN edge caching tambahan atau rate limit tayangan yang lebih ketat guna mencegah lonjakan pemakaian bandwidth Catbox.`
      );
    }
  }
  const totalCountryUploads = Object.values(stats.byCountry).reduce((sum, count) => sum + count, 0);
  if (totalCountryUploads >= 5) {
    for (const [code, count] of Object.entries(stats.byCountry)) {
      if (code !== "UNKNOWN" && count / totalCountryUploads > 0.7) {
        recommendations.push(
          `Lebih dari 70% (${Math.round(count / totalCountryUploads * 100)}%) unggahan hari ini berasal dari negara ${code}. Pertimbangkan menambahkan CDN atau server edge region yang lebih dekat dengan basis pengguna utama Anda.`
        );
        break;
      }
    }
  }
  if (weeklyTrend.length >= 4) {
    const pastDays = weeklyTrend.slice(0, weeklyTrend.length - 1);
    const pastUploadsSum = pastDays.reduce((sum, d) => sum + d.uploads, 0);
    const avgPastUploads = pastDays.length > 0 ? pastUploadsSum / pastDays.length : 0;
    if (avgPastUploads >= 5 && stats.uploads < avgPastUploads * 0.4) {
      recommendations.push(
        `Aktivitas unggahan hari ini (${stats.uploads}) terpantau menurun signifikan dibanding rata-rata 7 hari terakhir (${Math.round(avgPastUploads)} unggahan/hari). Pertimbangkan meninjau kanal distribusi atau promosi platform.`
      );
    }
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Semua metrik sistem berjalan dalam batas normal. Rasio ukuran berkas dan lalu lintas tayangan dalam kondisi sehat."
    );
    recommendations.push(
      "Koneksi penyimpanan Catbox dan basis data analitik beroperasi dengan latensi optimal."
    );
  }
  return recommendations;
}
var adminController = {
  /**
   * GET /{ADMIN_PANEL_PATH}/login
   */
  async renderLoginPage(req, res) {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
      return;
    }
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token && await verifyAdminSession(token)) {
      res.redirect(`/${fullAdminPath}/dashboard`);
      return;
    }
    const errorParam = req.query.error;
    const retryAfter = req.query.retryAfter;
    let errorMessage = "";
    if (errorParam === "invalid") {
      errorMessage = "Kredensial tidak valid. Silakan coba kembali.";
    } else if (errorParam === "rate_limited") {
      errorMessage = `Terlalu banyak percobaan login gagal. Silakan tunggu ${retryAfter ? `${retryAfter} detik` : "beberapa saat"} sebelum mencoba kembali.`;
    }
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Authentication \u2014 AirShare Pro</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --card-inner: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: rgba(255, 255, 255, 0.1);
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --error-bg: rgba(239, 68, 68, 0.15);
      --error-text: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .glass-card {
      background: rgba(24, 24, 27, 0.85);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 2.25rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.7);
    }
    .header { text-align: center; margin-bottom: 2rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(37, 99, 235, 0.15);
      color: #60a5fa;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
      border: 1px solid rgba(96, 165, 250, 0.2);
    }
    h1 { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.35rem; }
    p.subtitle { color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
    .error-banner {
      background: var(--error-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--error-text);
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.825rem;
      margin-bottom: 1.25rem;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.8rem 1rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
    }
    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .btn-submit:hover { background: var(--accent-hover); }
    .footer-note {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.725rem;
      color: var(--muted);
      opacity: 0.75;
    }
  </style>
</head>
<body>
  <div class="glass-card">
    <div class="header">
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Panel Terenkripsi
      </div>
      <h1>AirShare Pro Admin</h1>
      <p class="subtitle">Masukkan kunci otorisasi rahasia untuk memuat analitik sistem.</p>
    </div>

    ${errorMessage ? `<div class="error-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${escapeHtml3(errorMessage)}</span>
          </div>` : ""}

    <form method="POST" action="/${escapeHtml3(fullAdminPath)}/login">
      <div class="form-group">
        <label for="password">Kunci Sandi Admin (ADMIN_SECRET_KEY)</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autofocus />
      </div>
      <button type="submit" class="btn-submit">Buka Dashboard</button>
    </form>

    <div class="footer-note">
      Bcrypt Salting Cost 12 \u2022 Strict Session TTL 1 Jam \u2022 IP Rate Limited
    </div>
  </div>
</body>
</html>`;
    res.status(200).send(html);
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/login
   */
  async handleLogin(req, res) {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
      return;
    }
    const clientIp = getClientIp(req);
    const rateLimit = await checkAdminLoginRateLimit(req);
    if (!rateLimit.allowed) {
      console.warn(`[ADMIN_LOGIN_RATE_LIMITED] IP ${clientIp} exceeded login attempts`);
      await auditLogRepository.recordAction({
        type: "ADMIN_LOGIN_RATE_LIMITED",
        detail: `IP ${clientIp} terkena batasan rate limit login admin`,
        ip: clientIp
      });
      alertAdminLoginFailed(clientIp).catch((alertErr) => {
        console.warn("[TELEGRAM_ALERT_WARN] Gagal mengirim alert login admin gagal:", alertErr);
      });
      res.redirect(`/${fullAdminPath}/login?error=rate_limited&retryAfter=${rateLimit.retryAfterSeconds}`);
      return;
    }
    const password = req.body?.password;
    if (!password || typeof password !== "string") {
      res.redirect(`/${fullAdminPath}/login?error=invalid`);
      return;
    }
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
      console.warn(`[ADMIN_LOGIN_FAILED] Percobaan login admin gagal pada ${(/* @__PURE__ */ new Date()).toISOString()}`);
      await auditLogRepository.recordAction({
        type: "ADMIN_LOGIN_FAILED",
        detail: "Percobaan login admin gagal dengan sandi tidak valid",
        ip: clientIp
      });
      res.redirect(`/${fullAdminPath}/login?error=invalid`);
      return;
    }
    const sessionToken = await createAdminSession(req);
    console.info(`[ADMIN_LOGIN_SUCCESS] Sesi admin berhasil dibuat pada ${(/* @__PURE__ */ new Date()).toISOString()}`);
    await auditLogRepository.recordAction({
      type: "ADMIN_LOGIN",
      detail: "Login berhasil ke panel kontrol admin",
      ip: clientIp,
      adminTokenPreview: `${sessionToken.substring(0, 8)}...`
    });
    res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600 * 1e3,
      // 1 hour
      path: "/"
    });
    res.redirect(`/${fullAdminPath}/dashboard`);
  },
  /**
   * POST / GET /{ADMIN_PANEL_PATH}/logout
   */
  async handleLogout(req, res) {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
      return;
    }
    const clientIp = getClientIp(req);
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token) {
      await destroyAdminSession(token);
    }
    await auditLogRepository.recordAction({
      type: "ADMIN_LOGOUT",
      detail: "Admin keluar dari sesi",
      ip: clientIp,
      adminTokenPreview: token ? `${token.substring(0, 8)}...` : void 0
    });
    res.clearCookie(ADMIN_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "strict"
    });
    res.redirect(`/${fullAdminPath}/login`);
  },
  /**
   * GET /{ADMIN_PANEL_PATH}/dashboard
   */
  async renderDashboard(req, res) {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
      return;
    }
    const todayStr = getTodayDateString();
    const currentToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const [
      todayStats,
      weeklyTrend,
      rawTopFiles,
      recentUploads,
      totalItemsInRepo,
      catboxHealth,
      redisHealth,
      lastSyncCheck,
      systemConfig,
      activeSessions,
      auditLogs,
      deletedFiles
    ] = await Promise.all([
      analyticsRepository.getDailySummary(todayStr),
      analyticsRepository.getWeeklyTrend(),
      analyticsRepository.getTopFiles(10),
      analyticsRepository.getRecentUploads(50),
      analyticsRepository.getTotalItemsEver(),
      checkCatboxHealth(),
      checkRedisHealth(),
      getLastSyncCheck(),
      getAllSystemConfig(),
      getAllActiveSessions(currentToken),
      auditLogRepository.getRecentActions(50),
      deletedFilesRepository.getDeletedFiles(100)
    ]);
    const mediaRepo = getMediaRepository();
    const topFiles = await Promise.all(
      rawTopFiles.map(async (tf) => {
        const item = await mediaRepo.getByIdPublic(tf.id);
        return {
          id: tf.id,
          name: item?.name || tf.id,
          views: tf.views,
          formattedSize: item?.formattedSize || "-",
          type: item?.type || "file",
          shareUrl: item?.shareUrl || "#"
        };
      })
    );
    const enhancedRecentUploads = await Promise.all(
      recentUploads.map(async (u) => {
        const views = await analyticsRepository.getViewCount(u.id);
        return {
          ...u,
          views
        };
      })
    );
    const redisConnected = redisHealth.connected;
    const storageMode = isUpstashConfigured() ? redisConnected ? "Upstash Redis (Terdistribusi)" : "Upstash Redis (Terputus / Gangguan)" : "In-Memory (Fallback)";
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}j ${Math.floor(
      uptimeSeconds % 3600 / 60
    )}m ${uptimeSeconds % 60}d`;
    const initialDate = /* @__PURE__ */ new Date();
    const initialTimeFormatted = `${String(initialDate.getHours()).padStart(2, "0")}:${String(
      initialDate.getMinutes()
    ).padStart(2, "0")}:${String(initialDate.getSeconds()).padStart(2, "0")}`;
    const recommendations = generateRecommendations(todayStats, weeklyTrend, topFiles);
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const totalUploadedToday = todayStats.uploads || 0;
    const typeCounts = {
      image: todayStats.byType["image"] || 0,
      video: todayStats.byType["video"] || 0,
      audio: todayStats.byType["audio"] || 0,
      file: todayStats.byType["file"] || 0
    };
    const sortedCountries = Object.entries(todayStats.byCountry).sort((a, b) => b[1] - a[1]);
    const maxDailyUploads = Math.max(1, ...weeklyTrend.map((d) => d.uploads));
    const maxDailyBytes = Math.max(1, ...weeklyTrend.map((d) => d.bytes));
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AirShare Pro \u2014 Analytics &amp; Admin Dashboard</title>
  <style>
    :root {
      --bg: #0e0e11;
      --surface-primary: rgba(22, 22, 26, 0.94);
      --card: #16161a;
      --card-elevated: #1e1e24;
      --border: rgba(255, 255, 255, 0.08);
      --border-subtle: rgba(255, 255, 255, 0.06);
      --border-hover: rgba(255, 255, 255, 0.16);
      --border-accent: rgba(59, 130, 246, 0.35);
      --text: #f5f5f7;
      --fg: #f5f5f7;
      --muted: #94949b;
      --accent: #3b82f6;
      --accent-dark: #1d4ed8;
      --accent-soft: rgba(59, 130, 246, 0.12);
      --accent-soft-hover: rgba(59, 130, 246, 0.2);
      --success: #10b981;
      --success-soft: rgba(16, 185, 129, 0.12);
      --warning: #f59e0b;
      --warning-soft: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --danger-soft: rgba(239, 68, 68, 0.15);
      --surface-glass: rgba(22, 22, 26, 0.85);
      --shadow-subtle: 0 4px 16px -2px rgba(0, 0, 0, 0.35);
      --shadow-elevated: 0 16px 36px -4px rgba(0, 0, 0, 0.55);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 1.25rem; min-height: 100vh; }
    .container { max-width: 1280px; margin: 0 auto; }

    /* Header & Navigation */
    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--surface-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-logo {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .brand-text h1 { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
    .brand-text p { font-size: 0.75rem; color: var(--muted); }
    .nav-actions { display: flex; align-items: center; gap: 0.75rem; }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      background: rgba(16, 185, 129, 0.12);
      color: var(--success);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); flex-shrink: 0; }
    .live-sync-texts { display: flex; flex-direction: column; text-align: left; }
    .live-sync-title { font-size: 0.75rem; font-weight: 700; line-height: 1.2; }
    .live-sync-time { font-size: 0.65rem; color: var(--muted); font-weight: 500; }
    .btn-logout {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.2s, color 0.2s;
    }
    .btn-logout:hover { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }

    /* Layout & Sidebar Nav */
    .admin-layout {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    .admin-sidebar {
      width: 240px;
      flex-shrink: 0;
      position: sticky;
      top: 1.25rem;
      max-height: calc(100vh - 2.5rem);
      overflow-y: auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 0.85rem;
      box-shadow: var(--shadow-subtle);
    }
    .sidebar-title {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      padding: 0.45rem 0.65rem 0.65rem;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.5rem;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .admin-sidebar-btn {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      text-align: left;
      padding: 0.65rem 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .admin-sidebar-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
    }
    .admin-sidebar-btn.active {
      background: var(--accent-soft);
      border-color: var(--border-accent);
      color: #60a5fa;
    }
    .admin-sidebar-btn.active .sidebar-btn-title {
      color: #60a5fa;
    }
    .sidebar-btn-icon {
      width: 32px;
      height: 32px;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.04);
      flex-shrink: 0;
      color: inherit;
      transition: background 0.15s ease;
    }
    .admin-sidebar-btn.active .sidebar-btn-icon {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }
    .sidebar-btn-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .sidebar-btn-title {
      font-size: 0.825rem;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-btn-desc {
      font-size: 0.675rem;
      color: var(--muted);
      line-height: 1.2;
      margin-top: 0.15rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-main {
      flex: 1;
      min-width: 0;
    }

    /* Mobile Category Tabs */
    .admin-mobile-tabs {
      display: none;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.75rem;
      margin-bottom: 1rem;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x;
      scrollbar-width: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .admin-mobile-tabs::-webkit-scrollbar {
      display: none;
    }
    .admin-tab-btn {
      flex-shrink: 0;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 0.95rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    .admin-tab-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
    }
    .admin-tab-btn:active {
      transform: scale(0.96);
      background: rgba(255, 255, 255, 0.1);
    }
    .admin-tab-btn.active {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
    }
    .admin-sidebar-btn {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    }
    .admin-sidebar-btn:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.08);
    }

    /* Category Panel Toggle */
    .category-panel {
      display: none;
    }
    .category-panel.active {
      display: block;
      animation: fadeIn 0.2s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Summary Metric Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem 1.5rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-subtle);
    }
    .metric-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .metric-label { font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .metric-icon { width: 32px; height: 32px; border-radius: 0.6rem; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.05); color: var(--accent); }
    .metric-value { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.25rem; }
    .metric-sub { font-size: 0.75rem; color: var(--muted); }

    /* Split Section Layout */
    .section-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.85rem;
    }
    .panel-title { font-size: 1rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; }
    .panel-badge { font-size: 0.75rem; color: var(--muted); }

    /* SVG Chart */
    .chart-container { width: 100%; height: 180px; position: relative; margin-top: 1rem; }
    .chart-bars { display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .chart-bar { width: 100%; max-width: 32px; background: linear-gradient(180deg, var(--accent), var(--accent-dark)); border-radius: 6px 6px 0 0; min-height: 4px; transition: height 0.3s; }
    .chart-date { font-size: 0.65rem; color: var(--muted); margin-top: 0.4rem; text-align: center; }
    .chart-tooltip-label { font-size: 0.7rem; font-weight: 700; color: var(--text); margin-bottom: 0.2rem; }

    /* Distribution Progress */
    .dist-item { margin-bottom: 1rem; }
    .dist-header { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; }
    .dist-bar-track { width: 100%; height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 9999px; overflow: hidden; }
    .dist-bar-fill { height: 100%; border-radius: 9999px; }

    /* Country List */
    .country-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.85rem; }
    .country-info { display: flex; align-items: center; gap: 0.6rem; }
    .country-flag { width: 20px; height: 14px; object-fit: cover; border-radius: 2px; }

    /* Gemini AI Recommendations & Real-Time Summary Box */
    .ai-rec-box {
      background: linear-gradient(180deg, rgba(37, 99, 235, 0.1) 0%, rgba(30, 58, 138, 0.04) 100%);
      border: 1px solid rgba(59, 130, 246, 0.28);
      border-radius: 1.25rem;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.08);
      position: relative;
      overflow: hidden;
    }
    .ai-rec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(59, 130, 246, 0.15);
    }
    .ai-rec-title-group {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .ai-rec-sparkle-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
      flex-shrink: 0;
    }
    .ai-rec-title {
      font-size: 0.975rem;
      font-weight: 800;
      color: #e0f2fe;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .ai-rec-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .ai-badge-model {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.35);
      color: #93c5fd;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      letter-spacing: 0.02em;
    }
    .ai-badge-pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #60a5fa;
      box-shadow: 0 0 6px #60a5fa;
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    .btn-ai-refresh {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      border-radius: 8px;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .btn-ai-refresh:hover {
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.4);
      color: #ffffff;
    }
    .btn-ai-refresh:active {
      transform: scale(0.95);
    }
    .btn-ai-refresh:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* AI Executive Summary Card */
    .ai-summary-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-left: 3px solid #3b82f6;
      border-radius: 10px;
      padding: 0.95rem 1.15rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #f1f5f9;
    }
    .ai-summary-label {
      font-size: 0.725rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #60a5fa;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    /* Recommendations List */
    .ai-recs-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 0;
      margin: 0;
    }
    .ai-list-item {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      font-size: 0.85rem;
      line-height: 1.55;
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
    }
    .ai-bullet {
      color: #60a5fa;
      flex-shrink: 0;
      font-size: 0.85rem;
      margin-top: 0.15rem;
    }
    .ai-num-badge {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.2);
      color: #93c5fd;
      font-size: 0.7rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }
    .ai-item-body {
      flex: 1;
      min-width: 0;
    }
    .ai-bold {
      font-weight: 700;
      color: #ffffff;
    }
    .ai-italic {
      font-style: italic;
      color: #93c5fd;
    }
    .ai-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      color: #fde047;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .ai-heading-3 {
      font-size: 0.9rem;
      font-weight: 700;
      color: #93c5fd;
      margin: 0.5rem 0 0.25rem;
    }
    .ai-meta-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.725rem;
      color: var(--muted);
    }

    /* Custom Loading Skeleton */
    .ai-skeleton-container {
      display: none;
      flex-direction: column;
      gap: 0.85rem;
    }
    .ai-skeleton-status {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.8rem;
      color: #93c5fd;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .ai-skeleton-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      box-shadow: 0 0 8px #3b82f6;
      animation: pulseDot 1.2s infinite ease-in-out;
    }
    .skeleton-shimmer {
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.03) 25%, rgba(255, 255, 255, 0.09) 50%, rgba(255, 255, 255, 0.03) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite linear;
      border-radius: 6px;
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .skeleton-card {
      height: 74px;
      border-radius: 10px;
      width: 100%;
    }
    .skeleton-row {
      height: 44px;
      border-radius: 8px;
      width: 100%;
    }

    /* Error Notification Container */
    .ai-error-box {
      display: none;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.28);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
    }
    .ai-error-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f87171;
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }
    .ai-error-desc {
      font-size: 0.8rem;
      color: #fca5a5;
      line-height: 1.5;
      margin-bottom: 0.85rem;
    }
    .ai-error-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .btn-ai-retry {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      touch-action: manipulation;
    }
    .btn-ai-fallback {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }

    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-top: 0.5rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.18);
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    .table-container::-webkit-scrollbar {
      height: 6px;
      width: 6px;
    }
    .table-container::-webkit-scrollbar-track {
      background: transparent;
    }
    .table-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
    }
    table {
      width: 100%;
      min-width: 600px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    th {
      padding: 0.75rem 0.9rem;
      font-size: 0.725rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .badge-type { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .badge-image { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-video { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .badge-audio { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .badge-file { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .session-tag { font-family: monospace; font-size: 0.75rem; color: var(--muted); background: rgba(255, 255, 255, 0.05); padding: 0.15rem 0.4rem; border-radius: 4px; }
    .link-view { color: var(--accent); text-decoration: none; font-weight: 600; }
    .link-view:hover { text-decoration: underline; }

    /* iOS Alert & Confirmation Modal (Super Lightweight, No Backdrop-Blur) */
    .ios-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      opacity: 0;
      visibility: hidden;
      pointer-events: none; /* CRITICAL FIX: prevents touch blocking when modal is not active */
      transition: opacity 0.18s ease, visibility 0.18s ease;
    }
    .ios-modal-overlay.active {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .ios-modal-box {
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      width: 100%;
      max-width: 320px;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
      text-align: center;
      overflow: hidden;
      transform: scale(0.92);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ios-modal-overlay.active .ios-modal-box {
      transform: scale(1);
    }
    .ios-modal-body-content {
      padding: 1.35rem 1.15rem 1.15rem;
    }
    .ios-modal-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      margin: 0 auto 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ios-modal-icon-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .ios-modal-icon-warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .ios-modal-icon-info {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .ios-modal-icon-success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .ios-modal-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.3;
      margin-bottom: 0.45rem;
    }
    .ios-modal-desc {
      font-size: 0.825rem;
      color: #a1a1aa;
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-line;
    }
    .ios-modal-actions-row {
      display: flex;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ios-modal-btn {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 0.95rem;
      padding: 0.85rem 0.5rem;
      cursor: pointer;
      transition: background 0.15s ease;
      outline: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      font-family: inherit;
    }
    .ios-modal-btn:active, .ios-modal-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .ios-modal-btn-cancel {
      color: #94a3b8;
      font-weight: 500;
      border-right: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ios-modal-btn-danger {
      color: #f87171;
      font-weight: 700;
    }
    .ios-modal-btn-primary {
      color: #60a5fa;
      font-weight: 700;
    }

    /* Action buttons & Sync UI */
    .btn-delete-perm {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-perm:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.4);
      color: #ffffff;
    }
    .btn-delete-perm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-sync-action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--accent);
      color: #ffffff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.45rem 0.95rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .btn-sync-action:hover {
      background: #1d4ed8;
    }
    .btn-sync-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sync-banner {
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      font-size: 0.85rem;
      line-height: 1.5;
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .sync-banner-ok {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
    }
    .sync-banner-warn {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #f87171;
    }
    .sync-banner-idle {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .btn-delete-history {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-history:hover {
      background: rgba(245, 158, 11, 0.25);
      color: #ffffff;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Health footer */
    .health-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      font-size: 0.775rem;
      color: var(--muted);
      margin-top: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .health-item { display: flex; align-items: center; gap: 0.5rem; }
    .status-indicator { width: 8px; height: 8px; border-radius: 50%; }
    .status-ok { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-warn { background: var(--warning); box-shadow: 0 0 6px var(--warning); }

    /* Media Queries */
    @media (max-width: 900px) {
      .admin-layout {
        display: block;
      }
      .admin-sidebar {
        display: none;
      }
      .admin-mobile-tabs {
        display: flex;
      }
      .section-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      body {
        padding: 0.75rem;
      }
      .top-nav {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
        margin-bottom: 1rem;
      }
      .panel {
        padding: 1rem;
        border-radius: 1rem;
      }
      .metric-card {
        padding: 1rem 1.1rem;
        border-radius: 1rem;
      }
      .rec-box {
        padding: 1rem;
        border-radius: 1rem;
      }
      .health-bar {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
      }
    }

    ${getOperationalPanelStyles()}
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Nav -->
    <header class="top-nav">
      <div class="brand">
        <div class="brand-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m12 12 4 4"/><path d="m16 12-4 4"/></svg>
        </div>
        <div class="brand-text">
          <h1>AirShare Pro Admin</h1>
          <p>Sistem Analitik &amp; Monitoring Pemilik Proyek</p>
        </div>
      </div>
      <div class="nav-actions">
        <div class="live-badge" id="live-sync-badge">
          <span class="live-dot" id="live-sync-dot"></span>
          <div class="live-sync-texts">
            <span class="live-sync-title" id="live-sync-title">Diperbarui otomatis setiap 20 detik</span>
            <span class="live-sync-time" id="live-sync-time">Terakhir sinkron: ${escapeHtml3(initialTimeFormatted)}</span>
          </div>
        </div>
        <form id="form-logout" method="POST" action="/${escapeHtml3(fullAdminPath)}/logout" style="margin:0;">
          <button type="submit" class="btn-logout">Keluar (Logout)</button>
        </form>
      </div>
    </header>

    <!-- Admin Notification Toast / Banner -->
    <div id="admin-toast-banner" style="display:none; margin-bottom: 1.5rem; padding: 0.85rem 1.25rem; border-radius: 0.75rem; font-size: 0.85rem; font-weight: 600; align-items: center; justify-content: space-between;"></div>

    <!-- Mobile Category Tabs -->
    <nav class="admin-mobile-tabs" aria-label="Kategori Panel Mobile">
      <button type="button" class="admin-tab-btn active" data-category="ringkasan">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        <span>Ringkasan</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="analitik">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Analitik</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="kontrol">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Kontrol Sistem</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="keamanan">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Keamanan &amp; Sesi</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="data">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Pengelolaan Data</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="terhapus" id="tab-btn-terhapus">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        <span>Berkas Terhapus (${deletedFiles.length})</span>
      </button>
    </nav>

    <!-- Main Layout with Desktop Sidebar -->
    <div class="admin-layout">
      <!-- Desktop Sidebar Sticky Nav -->
      <aside class="admin-sidebar" aria-label="Navigasi Kategori Admin">
        <div class="sidebar-title">Menu Utama</div>
        <nav class="sidebar-nav">
          <button type="button" class="admin-sidebar-btn active" data-category="ringkasan">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Ringkasan</span>
              <span class="sidebar-btn-desc">Metrik &amp; Rekomendasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="analitik">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Analitik</span>
              <span class="sidebar-btn-desc">Tren, Media &amp; Geolokasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="kontrol">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Kontrol Sistem</span>
              <span class="sidebar-btn-desc">Kill Switch &amp; Sinkronisasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="keamanan">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Keamanan &amp; Sesi</span>
              <span class="sidebar-btn-desc">Sesi Aktif &amp; Log Audit</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="data">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Pengelolaan Data</span>
              <span class="sidebar-btn-desc">Riwayat Unggahan &amp; Cleanup</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="terhapus" id="sidebar-btn-terhapus">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Berkas Terhapus</span>
              <span class="sidebar-btn-desc">Arsip Terhapus (${deletedFiles.length})</span>
            </div>
          </button>
        </nav>
      </aside>

      <!-- Main Categorized Content Panels -->
      <main class="admin-main">
        <!-- 1. Kategori: Ringkasan -->
        <div class="category-panel active" data-category-panel="ringkasan">
          <!-- 4 Big Number Summaries for Today -->
          <section class="metrics-grid">
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Unggahan Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-uploads">${todayStats.uploads.toLocaleString("id-ID")}</div>
              <div class="metric-sub">Total berkas baru diproses</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Volume Data Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h12"/><path d="M6 14h12"/><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-bytes">${escapeHtml3(todayStats.formattedBytes)}</div>
              <div class="metric-sub">Total throughput data unggahan</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Kunjungan Berkas Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-views">${todayStats.totalViews.toLocaleString("id-ID")}</div>
              <div class="metric-sub">Akses laman share publik (/s/:id)</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Rata-rata Ukuran Berkas</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-avg">${escapeHtml3(todayStats.formattedAverageSize)}</div>
              <div class="metric-sub">Ukuran rata-rata per berkas</div>
            </div>
          </section>

          <!-- Automated Recommendations & Gemini AI Real-Time Analysis Section -->
          <section class="ai-rec-box" id="ai-rec-section">
            <div class="ai-rec-header">
              <div class="ai-rec-title-group">
                <div class="ai-rec-sparkle-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </div>
                <div>
                  <div class="ai-rec-title">
                    Rekomendasi Sistem Otomatis &amp; Analisis Real-Time
                  </div>
                  <div style="font-size: 0.725rem; color: var(--muted); margin-top: 0.15rem;">
                    Insight prediktif kapasitas &amp; arsitektur bertenaga Google Gemini
                  </div>
                </div>
              </div>

              <div class="ai-rec-actions">
                <span class="ai-badge-model" id="ai-rec-model-badge">
                  <span class="ai-badge-pulse"></span>
                  <span id="ai-rec-model-label">Gemini 3.8 Flash</span>
                </span>
                <button type="button" class="btn-ai-refresh" id="btn-refresh-ai-rec" title="Minta Gemini AI menganalisis data metrik sistem terkini">
                  <svg id="ai-refresh-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span id="ai-refresh-text">Analisis AI</span>
                </button>
              </div>
            </div>

            <!-- Custom Loading Skeleton (Shown during Gemini AI generation) -->
            <div class="ai-skeleton-container" id="ai-rec-skeleton">
              <div class="ai-skeleton-status">
                <span class="ai-skeleton-pulse-dot"></span>
                <span>Gemini sedang memproses data metrik sistem dan tren berkas secara real-time...</span>
              </div>
              <div class="skeleton-shimmer skeleton-card"></div>
              <div class="skeleton-shimmer skeleton-row"></div>
              <div class="skeleton-shimmer skeleton-row"></div>
              <div class="skeleton-shimmer skeleton-row" style="width: 85%;"></div>
            </div>

            <!-- AI Content Container -->
            <div id="ai-rec-content">
              <!-- Executive Summary -->
              <div class="ai-summary-card" id="ai-rec-summary-card">
                <div class="ai-summary-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  Ringkasan Eksekutif Real-Time
                </div>
                <div id="ai-rec-summary-text">
                  Infrastruktur AirShare Pro beroperasi pada mode ${escapeHtml3(storageMode)} dengan ${todayStats.uploads} unggahan (${escapeHtml3(todayStats.formattedBytes)}) dan ${todayStats.totalViews} tayangan hari ini.
                </div>
              </div>

              <!-- Recommendation List -->
              <ul class="ai-recs-list" id="ai-rec-list">
                ${recommendations.map(
      (r) => `<li class="ai-list-item"><span class="ai-bullet">\u2726</span><div class="ai-item-body">${escapeHtml3(
        r
      )}</div></li>`
    ).join("")}
              </ul>

              <div class="ai-meta-footer">
                <span id="ai-rec-timestamp">Status data terkini: ${initialTimeFormatted}</span>
                <span style="color: var(--muted);">Dianalisis langsung dari metrik analitik &amp; penyimpanan hulu</span>
              </div>
            </div>

            <!-- Error Notification Container -->
            <div class="ai-error-box" id="ai-rec-error">
              <div class="ai-error-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Gagal Memuat Analisis Gemini AI</span>
              </div>
              <div class="ai-error-desc" id="ai-rec-error-msg">
                Terjadi kendala saat menghubungi Gemini AI.
              </div>
              <div class="ai-error-actions">
                <button type="button" class="btn-ai-retry" id="btn-ai-retry">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  Coba Lagi
                </button>
                <button type="button" class="btn-ai-fallback" id="btn-ai-use-fallback">
                  Gunakan Rekomendasi Heuristik
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- 2. Kategori: Analitik -->
        <div class="category-panel" data-category-panel="analitik">
          <!-- 7-Day Trend & Media Type Distribution -->
          <div class="section-grid">
            <!-- 7-Day Trend Chart -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Tren Unggahan 7 Hari Terakhir
                </h2>
                <span class="panel-badge">Aktivitas Harian</span>
              </div>
              <div class="chart-container">
                <div class="chart-bars">
                  ${weeklyTrend.map((d) => {
      const heightPercent = Math.max(8, Math.round(d.uploads / maxDailyUploads * 100));
      return `
                      <div class="chart-col">
                        <div class="chart-tooltip-label">${d.uploads}</div>
                        <div class="chart-bar" style="height: ${heightPercent}%;" title="${d.date}: ${d.uploads} uploads (${d.formattedBytes})"></div>
                        <div class="chart-date">${d.date.slice(5)}</div>
                      </div>`;
    }).join("")}
                </div>
              </div>
            </section>

            <!-- Distribution by Media Type -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                  Distribusi Media Hari Ini
                </h2>
                <span class="panel-badge">${totalUploadedToday} berkas</span>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Foto / Gambar</span>
                  <span>${typeCounts.image} (${totalUploadedToday > 0 ? Math.round(typeCounts.image / totalUploadedToday * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? typeCounts.image / totalUploadedToday * 100 : 0}%; background: #10b981;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Video</span>
                  <span>${typeCounts.video} (${totalUploadedToday > 0 ? Math.round(typeCounts.video / totalUploadedToday * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? typeCounts.video / totalUploadedToday * 100 : 0}%; background: #8b5cf6;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Audio / Musik</span>
                  <span>${typeCounts.audio} (${totalUploadedToday > 0 ? Math.round(typeCounts.audio / totalUploadedToday * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? typeCounts.audio / totalUploadedToday * 100 : 0}%; background: #ec4899;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Dokumen &amp; Arsip</span>
                  <span>${typeCounts.file} (${totalUploadedToday > 0 ? Math.round(typeCounts.file / totalUploadedToday * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? typeCounts.file / totalUploadedToday * 100 : 0}%; background: #f59e0b;"></div>
                </div>
              </div>
            </section>
          </div>

          <!-- Country Geolocation & Top Files Grid -->
          <div class="section-grid">
            <!-- Country Distribution -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  Asal Negara Pengunggah Hari Ini
                </h2>
                <span class="panel-badge">IP Geolocation</span>
              </div>

              ${sortedCountries.length === 0 ? `<p style="color: var(--muted); font-size: 0.85rem; padding: 1rem 0;">Belum ada data geolokasi hari ini.</p>` : sortedCountries.slice(0, 8).map(([code, count]) => {
      const flagPath = getFlagAssetPath(code);
      return `
                  <div class="country-row">
                    <div class="country-info">
                      <img src="${escapeHtml3(flagPath)}" alt="${escapeHtml3(code)}" class="country-flag" onerror="this.src='/flags/globe.svg';" />
                      <span style="font-weight: 600;">${escapeHtml3(code)}</span>
                    </div>
                    <span style="font-weight: 700; color: var(--accent);">${count} unggahan</span>
                  </div>`;
    }).join("")}
            </section>

            <!-- Top 10 Popular Files -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Berkas Terpopuler
                </h2>
                <span class="panel-badge">Total Views</span>
              </div>

              ${topFiles.length === 0 ? `<p style="color: var(--muted); font-size: 0.85rem; padding: 1rem 0;">Belum ada riwayat tayangan berkas.</p>` : topFiles.map(
      (f, idx) => `
                  <div class="country-row">
                    <div class="country-info" style="min-width: 0; flex: 1;">
                      <span style="font-size: 0.75rem; font-weight: 800; color: var(--muted); width: 18px;">#${idx + 1}</span>
                      <a href="/s/${encodeURIComponent(
        f.id
      )}" target="_blank" class="link-view" style="max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.825rem;" title="${escapeHtml3(
        f.name
      )}">
                        ${escapeHtml3(f.name)}
                      </a>
                    </div>
                    <span style="font-weight: 700; color: #60a5fa; font-size: 0.85rem;">${f.views} tayangan</span>
                  </div>`
    ).join("")}
            </section>
          </div>
        </div>

        <!-- 3. Kategori: Kontrol Sistem -->
        <div class="category-panel" data-category-panel="kontrol">
          <!-- Kontrol Operasional & Konfigurasi Dinamis (Kill Switch & Dynamic Config) -->
          ${renderOperationalControlsHtml(systemConfig)}

          <!-- Sinkronisasi Data Catbox & Redis Panel -->
          <section class="panel" style="margin-bottom: 1.5rem;" id="sync-panel">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                Sinkronisasi Data (Redis &harr; Catbox)
              </h2>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span class="panel-badge" id="sync-last-checked-label">
                  ${lastSyncCheck ? `Terakhir diperiksa: ${formatRelativeTime3(lastSyncCheck.timestamp)} (${formatAbsoluteTime2(lastSyncCheck.timestamp)})` : "Belum pernah diperiksa"}
                </span>
                <button type="button" id="btn-run-sync" class="btn-sync-action">
                  <svg id="sync-spinner-icon" style="display:none; width: 14px; height: 14px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  <span id="sync-btn-text">Jalankan Pemeriksaan Sinkronisasi</span>
                </button>
              </div>
            </div>

            <div id="sync-summary-container">
              ${renderSyncSummaryHtml(lastSyncCheck)}
            </div>
          </section>
        </div>

        <!-- 4. Kategori: Keamanan & Sesi -->
        <div class="category-panel" data-category-panel="keamanan">
          <!-- Manajemen Sesi Admin Aktif -->
          ${renderActiveSessionsHtml(activeSessions)}

          <!-- Log Aktivitas Keamanan & Audit Admin -->
          ${renderAuditLogsHtml(auditLogs)}
        </div>

        <!-- 5. Kategori: Pengelolaan Data -->
        <div class="category-panel" data-category-panel="data">
          <!-- 50 Most Recent Uploads Across All Sessions -->
          <section class="panel" style="margin-bottom: 1.5rem;">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                50 Unggahan Terakhir (Lintas Semua Sesi)
              </h2>
              <span class="panel-badge" id="stat-total-stored">Total Tersimpan: ${totalItemsInRepo.toLocaleString("id-ID")} item (${enhancedRecentUploads.length} termonitor)</span>
            </div>

            <!-- Search & Quick Filter Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.25rem 0;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 260px;">
                <input type="text" id="search-files-input" placeholder="Filter nama berkas atau ID di bawah..." style="flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.45rem 0.75rem; font-size: 0.825rem;" />
                <button type="button" id="btn-search-db" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--fg); padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap;">Cari di Seluruh DB</button>
                <button type="button" id="btn-reset-search" style="background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">Reset</button>
              </div>
              <span id="search-count-label" style="font-size: 0.75rem; color: #60a5fa; font-weight: 600;"></span>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Berkas</th>
                    <th>Tipe</th>
                    <th>Ukuran</th>
                    <th>Negara</th>
                    <th>Waktu Unggah</th>
                    <th>Tayangan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${enhancedRecentUploads.length === 0 ? `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 2rem;">Belum ada unggahan yang tercatat di repositori.</td></tr>` : enhancedRecentUploads.map((item) => {
      const flagPath = getFlagAssetPath(item.uploaderCountryCode);
      return `
                    <tr id="upload-row-${escapeHtml3(item.id)}">
                      <td>
                        <div style="font-weight: 700; max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml3(
        item.name
      )}">
                          ${escapeHtml3(item.name)}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml3(
        item.id
      )}</div>
                      </td>
                      <td>
                        <span class="badge-type badge-${escapeHtml3(item.type)}">${escapeHtml3(
        item.type
      )}</span>
                      </td>
                      <td style="font-weight: 600;">${escapeHtml3(item.formattedSize)}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                          <img src="${escapeHtml3(
        flagPath
      )}" alt="${escapeHtml3(item.uploaderCountryCode || "Globe")}" class="country-flag" onerror="this.src='/flags/globe.svg';" />
                          <span style="font-size: 0.8rem;">${escapeHtml3(
        item.uploaderCountryCode || "-"
      )}</span>
                        </div>
                      </td>
                      <td>
                        <div style="font-weight: 600;">${formatRelativeTime3(item.createdAt)}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${formatAbsoluteTime2(
        item.createdAt
      )}</div>
                      </td>
                      <td style="font-weight: 700; color: #60a5fa;">${item.views}</td>
                      <td>
                        <div style="display: inline-flex; align-items: center; gap: 0.6rem;">
                          <a href="/s/${encodeURIComponent(
        item.id
      )}" target="_blank" class="link-view">Buka</a>
                          <button type="button" class="btn-delete-perm" data-id="${escapeHtml3(
        item.id
      )}" data-name="${escapeHtml3(item.name)}">Hapus Permanen</button>
                        </div>
                      </td>
                    </tr>`;
    }).join("")}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Pembersihan Massal (Bulk Cleanup Berdasarkan Kriteria) -->
          ${renderBulkCleanupHtml()}
        </div>

        <!-- 6. Kategori: Berkas Terhapus -->
        <div class="category-panel" data-category-panel="terhapus">
          <section class="panel" style="margin-bottom: 1.5rem;">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Arsip &amp; Riwayat Berkas Terhapus
              </h2>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span class="panel-badge" id="deleted-count-badge">${deletedFiles.length} Berkas Tercatat</span>
                ${deletedFiles.length > 0 ? `<button type="button" id="btn-clear-deleted-history" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">Bersihkan Seluruh Riwayat Terhapus</button>` : ""}
              </div>
            </div>

            <!-- Search Deleted Files Filter -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.25rem 0;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 260px;">
                <input type="text" id="search-deleted-input" placeholder="Filter berkas terhapus berdasarkan nama, ID, atau alasan..." style="flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.45rem 0.75rem; font-size: 0.825rem;" />
                <button type="button" id="btn-reset-deleted-search" style="background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">Reset</button>
              </div>
              <span id="deleted-search-count-label" style="font-size: 0.75rem; color: #f87171; font-weight: 600;"></span>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Berkas Terhapus</th>
                    <th>Tipe &amp; Ukuran</th>
                    <th>Tautan Catbox Asal</th>
                    <th>Waktu Dihapus</th>
                    <th>Dihapus Oleh</th>
                    <th>Alasan / Keterangan</th>
                  </tr>
                </thead>
                <tbody id="deleted-files-tbody">
                  ${deletedFiles.length === 0 ? `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2.5rem 1rem;">
                          <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text);">Tidak ada riwayat berkas terhapus</div>
                          <div style="font-size: 0.8rem;">Ketika berkas dihapus oleh pengguna atau admin, riwayat auditnya akan dipisahkan secara aman ke dalam tab ini.</div>
                        </td></tr>` : deletedFiles.map((df) => {
      let byBadge = "";
      if (df.deletedBy === "admin") {
        byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Admin</span>';
      } else if (df.deletedBy === "user") {
        byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);">Pengguna</span>';
      } else if (df.deletedBy === "sync_purge") {
        byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">Sync Purge (404)</span>';
      } else if (df.deletedBy === "bulk_cleanup") {
        byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">Bulk Cleanup</span>';
      } else {
        byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(255, 255, 255, 0.1); color: var(--muted);">' + escapeHtml3(df.deletedBy || "System") + "</span>";
      }
      return `
                    <tr id="deleted-row-${escapeHtml3(df.id)}">
                      <td>
                        <div style="font-weight: 700; color: #f87171; max-width: clamp(140px, 20vw, 240px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml3(
        df.name
      )}">
                          ${escapeHtml3(df.name)}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml3(df.id)}</div>
                      </td>
                      <td>
                        <div style="font-size: 0.8rem; font-weight: 600;">${escapeHtml3(df.formattedSize || "-")}</div>
                        <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">${escapeHtml3(df.type || "file")}</div>
                      </td>
                      <td>
                        <a href="${escapeHtml3(
        df.shareUrl
      )}" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted); max-width: clamp(120px, 20vw, 200px); display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${escapeHtml3(df.shareUrl)}
                        </a>
                      </td>
                      <td>
                        <div style="font-size: 0.8rem; font-weight: 600;">${formatRelativeTime3(
        df.deletedAt
      )}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${formatAbsoluteTime2(
        df.deletedAt
      )}</div>
                      </td>
                      <td>${byBadge}</td>
                      <td>
                        <div style="font-size: 0.775rem; color: var(--muted); max-width: 240px; line-height: 1.3;">
                          ${escapeHtml3(df.reason || "Dihapus dari penyimpanan")}
                        </div>
                      </td>
                    </tr>`;
    }).join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>

    <!-- System Health Status Bar -->
    <footer class="health-bar">
      <div class="health-item" id="health-storage">
        <span class="status-indicator ${redisConnected || !isUpstashConfigured() ? "status-ok" : "status-warn"}"></span>
        <span>Storage Backend: <strong>${escapeHtml3(storageMode)}</strong></span>
      </div>
      <div class="health-item" id="health-catbox">
        <span class="status-indicator ${catboxHealth.available ? "status-ok" : "status-warn"}"></span>
        <span>Catbox Upstream: <strong>${catboxHealth.available ? `Tersedia (${catboxHealth.latencyMs}ms)` : "Tidak Tersedia \u2014 Periksa Status Catbox"}</strong></span>
      </div>
      <div class="health-item">
        <span>Server Uptime: <strong>${escapeHtml3(uptimeFormatted)}</strong></span>
      </div>
      <div class="health-item">
        <span>Kerahasiaan: <strong>No-Index / No-Follow Active</strong></span>
      </div>
    </footer>
  </div>

  <!-- Global iOS-Style Alert/Confirm Modal Dialog -->
  <div id="ios-modal-container" class="ios-modal-overlay" role="dialog" aria-modal="true" aria-hidden="true">
    <div class="ios-modal-box">
      <div class="ios-modal-body-content">
        <div id="ios-modal-icon" class="ios-modal-icon-badge" style="display:none;"></div>
        <div id="ios-modal-title" class="ios-modal-title"></div>
        <div id="ios-modal-message" class="ios-modal-desc"></div>
      </div>
      <div id="ios-modal-actions" class="ios-modal-actions-row"></div>
    </div>
  </div>

  <script>
    // Global iOS-style confirmation modal handler
    window.showIosConfirm = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          resolve(confirm((options.title ? options.title + '\\n\\n' : '') + (options.message || '')));
          return;
        }

        titleEl.textContent = options.title || 'Konfirmasi Tindakan';
        msgEl.textContent = options.message || '';

        const isDestructive = options.isDestructive !== false;
        const iconType = options.icon || (isDestructive ? 'danger' : 'warning');
        
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-cancel" id="ios-btn-cancel">' + (options.cancelText || 'Batal') + '</button>' +
          '<button type="button" class="ios-modal-btn ' + (isDestructive ? 'ios-modal-btn-danger' : 'ios-modal-btn-primary') + '" id="ios-btn-confirm">' + (options.confirmText || (isDestructive ? 'Ya, Lanjutkan' : 'Konfirmasi')) + '</button>';

        function cleanup(result) {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve(result);
        }

        function handleKey(e) {
          if (e.key === 'Escape') cleanup(false);
        }

        const btnCancel = document.getElementById('ios-btn-cancel');
        const btnConfirm = document.getElementById('ios-btn-confirm');
        if (btnCancel) btnCancel.onclick = function() { cleanup(false); };
        if (btnConfirm) btnConfirm.onclick = function() { cleanup(true); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    // Global iOS-style statement/alert modal handler
    window.showIosAlert = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          alert((options.title ? options.title + '\\n\\n' : '') + (options.message || ''));
          resolve();
          return;
        }

        titleEl.textContent = options.title || 'Pemberitahuan';
        msgEl.textContent = options.message || '';

        const iconType = options.icon || 'info';
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-primary" id="ios-btn-ok">' + (options.buttonText || 'Mengerti') + '</button>';

        function cleanup() {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve();
        }

        function handleKey(e) {
          if (e.key === 'Escape' || e.key === 'Enter') cleanup();
        }

        const btnOk = document.getElementById('ios-btn-ok');
        if (btnOk) btnOk.onclick = function() { cleanup(); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    (function() {
      const panelPath = ${JSON.stringify(fullAdminPath)};
      const badgeDot = document.getElementById('live-sync-dot');
      const badgeTitle = document.getElementById('live-sync-title');
      const badgeTime = document.getElementById('live-sync-time');

      // Intercept Logout Form with iOS Modal Confirmation
      const formLogout = document.getElementById('form-logout');
      if (formLogout) {
        formLogout.addEventListener('submit', async function(e) {
          e.preventDefault();
          const confirmed = await window.showIosConfirm({
            title: 'Keluar dari Panel Admin?',
            message: 'Sesi administrasi Anda akan diakhiri dan Anda harus memasukkan PIN kembali untuk masuk.',
            confirmText: 'Keluar',
            cancelText: 'Batal',
            isDestructive: true,
            icon: 'warning'
          });
          if (confirmed) {
            formLogout.submit();
          }
        });
      }

      function showToast(msg, isError, isWarn) {
        const toast = document.getElementById('admin-toast-banner');
        if (!toast) return;
        toast.style.display = 'flex';
        if (isError) {
          toast.style.background = 'rgba(239, 68, 68, 0.15)';
          toast.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          toast.style.color = '#f87171';
        } else if (isWarn) {
          toast.style.background = 'rgba(245, 158, 11, 0.15)';
          toast.style.border = '1px solid rgba(245, 158, 11, 0.3)';
          toast.style.color = '#fbbf24';
        } else {
          toast.style.background = 'rgba(16, 185, 129, 0.15)';
          toast.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          toast.style.color = '#34d399';
        }
        toast.innerHTML = '<span>' + msg + '</span><button type="button" onclick="this.parentElement.style.display=\\'none\\'" style="background:none; border:none; color:inherit; font-size:1.1rem; cursor:pointer; padding:0 0.5rem;">&times;</button>';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // 0. Category Switching & High-Performance Touch Navigation Handler
      const categoryPanels = document.querySelectorAll('.category-panel');
      const sidebarBtns = document.querySelectorAll('.admin-sidebar-btn');
      const tabBtns = document.querySelectorAll('.admin-tab-btn');

      function switchCategory(catName) {
        if (!catName) return;
        categoryPanels.forEach(function(panel) {
          if (panel.getAttribute('data-category-panel') === catName) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });

        sidebarBtns.forEach(function(btn) {
          if (btn.getAttribute('data-category') === catName) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });

        tabBtns.forEach(function(btn) {
          if (btn.getAttribute('data-category') === catName) {
            btn.classList.add('active');
            // Smoothly scroll active tab into view in mobile tabs container
            try {
              btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } catch (e) {}
          } else {
            btn.classList.remove('active');
          }
        });

        try {
          localStorage.setItem('airshare_admin_active_cat', catName);
        } catch (e) {}
      }

      // High-precision touch event handling for mobile devices (eliminates tap lag & accidental scroll clicks)
      function initTouchNavigation() {
        const allNavTriggers = document.querySelectorAll('.admin-sidebar-btn, .admin-tab-btn');
        allNavTriggers.forEach(function(btn) {
          let touchStartX = 0;
          let touchStartY = 0;
          let hasMoved = false;

          btn.addEventListener('touchstart', function(e) {
            if (e.touches && e.touches[0]) {
              touchStartX = e.touches[0].clientX;
              touchStartY = e.touches[0].clientY;
              hasMoved = false;
            }
          }, { passive: true });

          btn.addEventListener('touchmove', function(e) {
            if (e.touches && e.touches[0]) {
              const dx = Math.abs(e.touches[0].clientX - touchStartX);
              const dy = Math.abs(e.touches[0].clientY - touchStartY);
              if (dx > 8 || dy > 8) {
                hasMoved = true;
              }
            }
          }, { passive: true });

          btn.addEventListener('touchend', function(e) {
            if (!hasMoved) {
              const cat = btn.getAttribute('data-category');
              if (cat) {
                e.preventDefault();
                switchCategory(cat);
              }
            }
          });

          btn.addEventListener('click', function(e) {
            const cat = btn.getAttribute('data-category');
            if (cat) {
              e.preventDefault();
              switchCategory(cat);
            }
          });
        });

        // Global fallback delegation for any dynamically inserted buttons
        document.addEventListener('click', function(e) {
          const navBtn = e.target.closest('.admin-sidebar-btn, .admin-tab-btn');
          if (navBtn) {
            const cat = navBtn.getAttribute('data-category');
            if (cat) switchCategory(cat);
          }
        });
      }
      initTouchNavigation();

      // Restore category from localStorage if available
      try {
        const savedCat = localStorage.getItem('airshare_admin_active_cat');
        if (savedCat && document.querySelector('[data-category-panel="' + savedCat + '"]')) {
          switchCategory(savedCat);
        }
      } catch (e) {}

      // 0.0 Gemini AI Real-Time System Recommendations Engine
      function renderGeminiMarkup(raw) {
        if (!raw) return '';
        // 1. Escape HTML special characters for strict XSS prevention
        let str = String(raw)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        // 2. Headings
        str = str.replace(/^### (.*?)$/gm, '<h4 class="ai-heading-3">$1</h4>');
        str = str.replace(/^## (.*?)$/gm, '<h3 class="ai-heading-3">$1</h3>');

        // 3. Bold text
        str = str.replace(/**(.*?)**/g, '<strong class="ai-bold">$1</strong>');
        str = str.replace(/__(.*?)__/g, '<strong class="ai-bold">$1</strong>');

        // 4. Italic text
        str = str.replace(/(^|[^*])*([^*]+)*([^*]|$)/g, '$1<em class="ai-italic">$2</em>$3');

        // 5. Code blocks / inline code (using safe char code to prevent template backtick clash)
        const tick = String.fromCharCode(96);
        str = str.split(tick).map(function(part, idx) {
          return idx % 2 === 1 ? '<code class="ai-code">' + part + '</code>' : part;
        }).join('');

        return str;
      }

      const recSkeleton = document.getElementById('ai-rec-skeleton');
      const recContent = document.getElementById('ai-rec-content');
      const recError = document.getElementById('ai-rec-error');
      const recErrorMsg = document.getElementById('ai-rec-error-msg');
      const recSummaryText = document.getElementById('ai-rec-summary-text');
      const recList = document.getElementById('ai-rec-list');
      const recModelLabel = document.getElementById('ai-rec-model-label');
      const recTimestamp = document.getElementById('ai-rec-timestamp');
      const btnRefreshAi = document.getElementById('btn-refresh-ai-rec');
      const aiRefreshIcon = document.getElementById('ai-refresh-icon');
      const aiRefreshText = document.getElementById('ai-refresh-text');
      const btnAiRetry = document.getElementById('btn-ai-retry');
      const btnAiFallback = document.getElementById('btn-ai-use-fallback');

      function setAiLoading(isLoading) {
        if (isLoading) {
          if (recSkeleton) recSkeleton.style.display = 'flex';
          if (recContent) recContent.style.display = 'none';
          if (recError) recError.style.display = 'none';
          if (btnRefreshAi) btnRefreshAi.disabled = true;
          if (aiRefreshIcon) aiRefreshIcon.style.animation = 'spin 1s infinite linear';
          if (aiRefreshText) aiRefreshText.textContent = 'Menganalisis...';
        } else {
          if (recSkeleton) recSkeleton.style.display = 'none';
          if (btnRefreshAi) btnRefreshAi.disabled = false;
          if (aiRefreshIcon) aiRefreshIcon.style.animation = '';
          if (aiRefreshText) aiRefreshText.textContent = 'Analisis AI';
        }
      }

      async function fetchAiRecommendations() {
        setAiLoading(true);
        try {
          const res = await fetch('/${fullAdminPath}/api/ai-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!res.ok) {
            throw new Error('Server mengembalikan HTTP ' + res.status);
          }

          const data = await res.json();

          if (!data || (!data.summary && (!data.recommendations || data.recommendations.length === 0))) {
            throw new Error(data && data.error ? data.error : 'Respon rekomendasi kosong.');
          }

          // Render Executive Summary
          if (recSummaryText && data.summary) {
            recSummaryText.innerHTML = renderGeminiMarkup(data.summary);
          }

          // Render Recommendations List
          if (recList && Array.isArray(data.recommendations)) {
            recList.innerHTML = data.recommendations
              .map(function(item) {
                const formatted = renderGeminiMarkup(item);
                return '<li class="ai-list-item"><span class="ai-bullet">\u2726</span><div class="ai-item-body">' + formatted + '</div></li>';
              })
              .join('');
          }

          // Update Model Badge
          if (recModelLabel) {
            recModelLabel.textContent = data.isAi ? 'Gemini 3.8 Flash \u2022 Real-Time AI' : 'Mesin Heuristik Sistem';
          }

          // Update Timestamp
          if (recTimestamp) {
            const now = new Date();
            const timeFormatted = String(now.getHours()).padStart(2, '0') + ':' +
                                  String(now.getMinutes()).padStart(2, '0') + ':' +
                                  String(now.getSeconds()).padStart(2, '0');
            recTimestamp.textContent = (data.isAi ? 'Dianalisis secara real-time oleh Gemini: ' : 'Status heuristik lokal: ') + timeFormatted;
          }

          if (recContent) recContent.style.display = 'block';
          if (recError) recError.style.display = 'none';

          if (data.error && !data.isAi) {
            showToast(data.error, false, true);
          }
        } catch (err) {
          console.error('[AI_RECOMMENDATION_ERROR]', err);
          if (recContent) recContent.style.display = 'none';
          if (recError) {
            recError.style.display = 'block';
            if (recErrorMsg) {
              recErrorMsg.textContent = 'Kendala: ' + (err.message || 'Gagal terhubung ke layanan AI Gemini.');
            }
          }
        } finally {
          setAiLoading(false);
        }
      }

      if (btnRefreshAi) {
        btnRefreshAi.addEventListener('click', function() {
          fetchAiRecommendations();
        });
      }

      if (btnAiRetry) {
        btnAiRetry.addEventListener('click', function() {
          fetchAiRecommendations();
        });
      }

      if (btnAiFallback) {
        btnAiFallback.addEventListener('click', function() {
          if (recError) recError.style.display = 'none';
          if (recContent) recContent.style.display = 'block';
          if (recModelLabel) recModelLabel.textContent = 'Mesin Heuristik Bawaan';
        });
      }

      // Automatically trigger initial AI analysis in background on page load
      setTimeout(function() {
        fetchAiRecommendations();
      }, 400);

      // 0.1 Quick Table Search & Filter for Uploads
      const searchInput = document.getElementById('search-files-input');
      const btnResetSearch = document.getElementById('btn-reset-search');
      const searchCountLabel = document.getElementById('search-count-label');
      const btnSearchDb = document.getElementById('btn-search-db');

      function filterUploadRows() {
        if (!searchInput) return;
        const query = searchInput.value.toLowerCase().trim();
        const rows = document.querySelectorAll('tr[id^="upload-row-"]');
        let visibleCount = 0;

        rows.forEach(function(row) {
          if (!query) {
            row.style.display = '';
            visibleCount++;
          } else {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.style.display = '';
              visibleCount++;
            } else {
              row.style.display = 'none';
            }
          }
        });

        if (searchCountLabel) {
          if (query) {
            searchCountLabel.textContent = visibleCount + ' berkas cocok';
          } else {
            searchCountLabel.textContent = '';
          }
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', filterUploadRows);
      }

      if (btnResetSearch) {
        btnResetSearch.addEventListener('click', function() {
          if (searchInput) {
            searchInput.value = '';
            filterUploadRows();
            searchInput.focus();
          }
        });
      }

      if (btnSearchDb) {
        btnSearchDb.addEventListener('click', function() {
          const q = searchInput ? searchInput.value.trim() : '';
          if (!q) {
            showToast('Silakan masukkan kata kunci pencarian.', false, true);
            return;
          }
          filterUploadRows();
        });
      }

      // 1. Permanent Deletion handler (with iOS confirm dialog)
      document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-delete-perm');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || id;

        const confirmed = await window.showIosConfirm({
          title: 'Hapus Permanen dari Catbox?',
          message: 'Penghapusan dari server Catbox bersifat PERMANEN dan TIDAK DAPAT DIBATALKAN.

Berkas "' + name + '" (' + id + ') akan dihapus selamanya dan tautan tidak akan bisa diakses lagi oleh siapapun.',
          confirmText: 'Hapus Permanen',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'danger'
        });

        if (!confirmed) {
          return;
        }

        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menghapus...';

        try {
          const res = await fetch('/' + panelPath + '/api/delete-permanent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ id })
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast(data.message, false, data.warning);
            const row = document.getElementById('upload-row-' + id);
            if (row) {
              row.style.opacity = '0.35';
              const actionCell = row.querySelector('td:last-child');
              if (actionCell) {
                actionCell.innerHTML = '<span style="font-size:0.75rem; color:#ef4444; font-weight:700;">Dihapus Permanen</span>';
              }
            }
            fetchLiveStats();
          } else {
            showToast(data.error?.message || 'Gagal menghapus berkas permanen.', true);
            btn.disabled = false;
            btn.textContent = origText;
          }
        } catch (err) {
          showToast('Terjadi kesalahan jaringan saat mencoba menghapus permanen.', true);
          btn.disabled = false;
          btn.textContent = origText;
        }
      });

      // 2. Health-Check Synchronization handler
      const btnSync = document.getElementById('btn-run-sync');
      const syncSpinner = document.getElementById('sync-spinner-icon');
      const syncText = document.getElementById('sync-btn-text');
      const syncSummaryContainer = document.getElementById('sync-summary-container');
      const syncLastLabel = document.getElementById('sync-last-checked-label');

      if (btnSync) {
        btnSync.addEventListener('click', async function() {
          btnSync.disabled = true;
          if (syncSpinner) syncSpinner.style.display = 'inline-block';
          if (syncText) syncText.textContent = 'Memeriksa ke Catbox...';

          try {
            const res = await fetch('/' + panelPath + '/api/sync-check', {
              method: 'POST',
              headers: { 'Accept': 'application/json' }
            });

            if (res.status === 401) {
              window.location.href = '/' + panelPath + '/login';
              return;
            }

            const data = await res.json();
            if (data.success) {
              if (syncLastLabel) {
                syncLastLabel.textContent = 'Terakhir diperiksa: Baru saja (' + new Date().toLocaleTimeString('id-ID') + ')';
              }

              if (data.brokenCount === 0) {
                syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.totalChecked + ' dari ' + data.totalChecked + ' berkas terbaru berhasil diverifikasi aktif di server Catbox (HTTP 200 OK). Tidak ada berkas yatim yang terdeteksi.</div></div></div>';
                showToast('Pemeriksaan selesai: Seluruh ' + data.totalChecked + ' berkas terverifikasi aktif di Catbox.', false);
              } else {
                let html = '<div class="sync-banner sync-banner-warn"><div><strong>Ditemukan Berkas Bermasalah: ' + data.brokenCount + ' Berkas Rusak / Yatim!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.healthyCount + ' dari ' + data.totalChecked + ' berkas aktif. Terdapat <strong>' + data.brokenCount + ' tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error).</div></div></div>';
                html += '<div class="table-container" style="margin-top: 1rem;"><table><thead><tr><th>Berkas Bermasalah</th><th>Ukuran</th><th>Tautan Catbox Asli</th><th>Waktu Unggah</th><th>Aksi Perbaikan</th></tr></thead><tbody id="sync-broken-tbody">';
                data.brokenItems.forEach(function(item) {
                  html += '<tr id="sync-row-' + item.id + '"><td><div style="font-weight: 700; color: #f87171;">' + (item.name || item.id) + '</div><div style="font-size: 0.7rem; color: var(--muted);">' + item.id + '</div></td><td>' + (item.formattedSize || '-') + '</td><td><a href="' + item.shareUrl + '" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted);">' + item.shareUrl + '</a></td><td>Baru saja</td><td><button type="button" class="btn-delete-history" data-id="' + item.id + '" data-name="' + (item.name || item.id) + '">Hapus dari Riwayat</button></td></tr>';
                });
                html += '</tbody></table></div>';
                syncSummaryContainer.innerHTML = html;
                showToast('Pemeriksaan selesai: Ditemukan ' + data.brokenCount + ' berkas yatim/rusak yang tidak ada di Catbox.', false, true);
              }
            } else {
              showToast(data.error?.message || 'Gagal menjalankan pemeriksaan sinkronisasi.', true);
            }
          } catch (err) {
            showToast('Terjadi kesalahan koneksi saat menjalankan pemeriksaan sinkronisasi.', true);
          } finally {
            btnSync.disabled = false;
            if (syncSpinner) syncSpinner.style.display = 'none';
            if (syncText) syncText.textContent = 'Jalankan Pemeriksaan Sinkronisasi';
          }
        });
      }

      // 3. Delete History Only handler (without calling Catbox API)
      document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-delete-history');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || id;

        const confirmed = await window.showIosConfirm({
          title: 'Bersihkan dari Riwayat?',
          message: 'Hapus entri berkas "' + name + '" (' + id + ') dari riwayat repositori AirShare?

File ini memang sudah tidak ada di Catbox, aksi ini hanya membersihkan sisa riwayat di database.',
          confirmText: 'Bersihkan Entri',
          cancelText: 'Batal',
          isDestructive: false,
          icon: 'warning'
        });

        if (!confirmed) {
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Membersihkan...';

        try {
          const res = await fetch('/' + panelPath + '/api/delete-history-only', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ id })
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast(data.message, false);
            const syncRow = document.getElementById('sync-row-' + id);
            if (syncRow) {
              syncRow.remove();
            }
            const mainRow = document.getElementById('upload-row-' + id);
            if (mainRow) {
              mainRow.style.opacity = '0.35';
              const actionCell = mainRow.querySelector('td:last-child');
              if (actionCell) {
                actionCell.innerHTML = '<span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">Dibersihkan dari Riwayat</span>';
              }
            }
            fetchLiveStats();
          } else {
            showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
            btn.disabled = false;
            btn.textContent = 'Hapus dari Riwayat';
          }
        } catch (err) {
          showToast('Terjadi kesalahan jaringan saat membersihkan riwayat.', true);
          btn.disabled = false;
          btn.textContent = 'Hapus dari Riwayat';
        }
      });

      // 4. Purge All Broken 404 files handler
      document.addEventListener('click', async function(e) {
        const btnPurgeAll = e.target.closest('#btn-purge-all-broken');
        if (!btnPurgeAll) return;

        const confirmed = await window.showIosConfirm({
          title: 'Bersihkan Seluruh Berkas Rusak (404)?',
          message: 'Bersihkan SEMUA berkas rusak (404) dan sisa data uji dari riwayat database & analitik?

Berkas aktif yang valid akan tetap aman tersimpan.',
          confirmText: 'Bersihkan Semua (404)',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'danger'
        });

        if (!confirmed) {
          return;
        }

        btnPurgeAll.disabled = true;
        btnPurgeAll.textContent = 'Membersihkan Semua...';

        try {
          const res = await fetch('/' + panelPath + '/api/purge-broken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast('Pembersihan selesai: ' + data.data.purgedCount + ' berkas 404/orphan dibersihkan.', false);
            syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">Pembersihan selesai. ' + data.data.healthyCount + ' berkas valid dipertahankan dan ' + data.data.purgedCount + ' berkas 404 dibersihkan.</div></div></div>';
            setTimeout(function() { window.location.reload(); }, 1200);
          } else {
            showToast(data.error?.message || 'Gagal membersihkan berkas rusak.', true);
            btnPurgeAll.disabled = false;
            btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
          }
        } catch (err) {
          showToast('Terjadi kesalahan koneksi saat membersihkan berkas rusak.', true);
          btnPurgeAll.disabled = false;
          btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
        }
      });

      // 5. Deleted Files Tab Handlers (Filter & Clear History)
      const searchDeletedInput = document.getElementById('search-deleted-input');
      const btnResetDeletedSearch = document.getElementById('btn-reset-deleted-search');
      const deletedSearchCountLabel = document.getElementById('deleted-search-count-label');
      const btnClearDeleted = document.getElementById('btn-clear-deleted-history');

      function filterDeletedRows() {
        if (!searchDeletedInput) return;
        const query = searchDeletedInput.value.toLowerCase().trim();
        const rows = document.querySelectorAll('tr[id^="deleted-row-"]');
        let visibleCount = 0;

        rows.forEach(function(row) {
          if (!query) {
            row.style.display = '';
            visibleCount++;
          } else {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.style.display = '';
              visibleCount++;
            } else {
              row.style.display = 'none';
            }
          }
        });

        if (deletedSearchCountLabel) {
          if (query) {
            deletedSearchCountLabel.textContent = visibleCount + ' berkas cocok';
          } else {
            deletedSearchCountLabel.textContent = '';
          }
        }
      }

      if (searchDeletedInput) {
        searchDeletedInput.addEventListener('input', filterDeletedRows);
      }

      if (btnResetDeletedSearch) {
        btnResetDeletedSearch.addEventListener('click', function() {
          if (searchDeletedInput) {
            searchDeletedInput.value = '';
            filterDeletedRows();
            searchDeletedInput.focus();
          }
        });
      }

      if (btnClearDeleted) {
        btnClearDeleted.addEventListener('click', async function() {
          const confirmed = await window.showIosConfirm({
            title: 'Bersihkan Seluruh Riwayat Terhapus?',
            message: 'Seluruh arsip riwayat berkas terhapus akan dibersihkan dari database admin.',
            confirmText: 'Bersihkan Riwayat',
            cancelText: 'Batal',
            isDestructive: true,
            icon: 'danger'
          });

          if (!confirmed) {
            return;
          }

          btnClearDeleted.disabled = true;
          btnClearDeleted.textContent = 'Membersihkan...';

          try {
            const res = await fetch('/' + panelPath + '/api/clear-deleted-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });

            if (res.status === 401) {
              window.location.href = '/' + panelPath + '/login';
              return;
            }

            const data = await res.json();
            if (data.success) {
              showToast(data.message, false);
              const tbody = document.getElementById('deleted-files-tbody');
              if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2.5rem 1rem;"><div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text);">Tidak ada riwayat berkas terhapus</div><div style="font-size: 0.8rem;">Riwayat arsip berkas terhapus telah dibersihkan secara penuh.</div></td></tr>';
              }
              const countBadge = document.getElementById('deleted-count-badge');
              if (countBadge) countBadge.textContent = '0 Berkas Tercatat';
              btnClearDeleted.style.display = 'none';
              const tabBtn = document.getElementById('tab-btn-terhapus');
              if (tabBtn) tabBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>Berkas Terhapus (0)</span>';
              const sidebarBtnDesc = document.querySelector('#sidebar-btn-terhapus .sidebar-btn-desc');
              if (sidebarBtnDesc) sidebarBtnDesc.textContent = 'Arsip Terhapus (0)';
            } else {
              showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
              btnClearDeleted.disabled = false;
              btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
            }
          } catch (err) {
            showToast('Terjadi kesalahan koneksi saat membersihkan riwayat.', true);
            btnClearDeleted.disabled = false;
            btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
          }
        });
      }

      async function fetchLiveStats() {
        try {
          const res = await fetch('/' + panelPath + '/api/live-stats', {
            headers: { 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }

          const json = await res.json();
          if (!json || !json.today) return;

          // Update metric numbers
          const elUploads = document.getElementById('stat-uploads');
          if (elUploads && json.today.uploads !== undefined) {
            elUploads.textContent = Number(json.today.uploads).toLocaleString('id-ID');
          }

          const elBytes = document.getElementById('stat-bytes');
          if (elBytes && json.today.formattedBytes) {
            elBytes.textContent = json.today.formattedBytes;
          }

          const elViews = document.getElementById('stat-views');
          if (elViews && json.today.totalViews !== undefined) {
            elViews.textContent = Number(json.today.totalViews).toLocaleString('id-ID');
          }

          const elAvg = document.getElementById('stat-avg');
          if (elAvg && json.today.formattedAverageSize) {
            elAvg.textContent = json.today.formattedAverageSize;
          }

          const elTotalStored = document.getElementById('stat-total-stored');
          if (elTotalStored && json.totalItemsInRepo !== undefined) {
            const monitoredCount = (json.recentUploads && json.recentUploads.length) || 0;
            elTotalStored.textContent = 'Total Tersimpan: ' + Number(json.totalItemsInRepo).toLocaleString('id-ID') + ' item (' + monitoredCount + ' termonitor)';
          }

          // Update footer health status
          const elCatbox = document.getElementById('health-catbox');
          if (elCatbox && json.catbox) {
            if (json.catbox.available) {
              elCatbox.innerHTML = '<span class="status-indicator status-ok"></span><span>Catbox Upstream: <strong>Tersedia (' + (json.catbox.latencyMs || 0) + 'ms)</strong></span>';
            } else {
              elCatbox.innerHTML = '<span class="status-indicator status-warn"></span><span>Catbox Upstream: <strong style="color: #f87171;">Tidak Tersedia \u2014 Periksa Status Catbox</strong></span>';
            }
          }

          const elStorage = document.getElementById('health-storage');
          if (elStorage && json.redis) {
            const isOk = json.redis.connected || (!json.redis.configured);
            const dotClass = isOk ? 'status-ok' : 'status-warn';
            elStorage.innerHTML = '<span class="status-indicator ' + dotClass + '"></span><span>Storage Backend: <strong>' + (json.redis.mode || 'In-Memory (Fallback)') + '</strong></span>';
          }

          // Update sync badge to success
          if (badgeDot) {
            badgeDot.style.background = 'var(--success)';
            badgeDot.style.boxShadow = '0 0 8px var(--success)';
          }
          if (badgeTitle) badgeTitle.textContent = 'Diperbarui otomatis setiap 20 detik';
          if (badgeTime) {
            const now = new Date();
            const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                            String(now.getMinutes()).padStart(2, '0') + ':' +
                            String(now.getSeconds()).padStart(2, '0');
            badgeTime.textContent = 'Terakhir sinkron: ' + timeStr;
          }
        } catch (err) {
          if (badgeDot) {
            badgeDot.style.background = '#ef4444';
            badgeDot.style.boxShadow = '0 0 8px #ef4444';
          }
          if (badgeTitle) badgeTitle.textContent = 'Gagal memperbarui \u2014 periksa koneksi';
        }
      }

      setInterval(fetchLiveStats, 20000);
    })();

    ${getOperationalPanelScripts(fullAdminPath)}
  </script>
</body>
</html>`;
    res.status(200).send(html);
  },
  /**
   * GET /{ADMIN_PANEL_PATH}/api/live-stats
   * Returns fresh real-time dashboard stats for polling updates.
   * Strictly protected by requireAdminAuth.
   */
  async getLiveStats(req, res) {
    const { enabled } = getAdminConfig();
    if (!enabled) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" }
      });
      return;
    }
    const todayStr = getTodayDateString();
    const [
      todayStats,
      totalItemsInRepo,
      redisHealth,
      catboxHealth,
      recentUploads
    ] = await Promise.all([
      analyticsRepository.getDailySummary(todayStr),
      analyticsRepository.getTotalItemsEver(),
      checkRedisHealth(),
      checkCatboxHealth(),
      analyticsRepository.getRecentUploads(10)
    ]);
    const enhancedRecentUploads = await Promise.all(
      recentUploads.map(async (u) => {
        const views = await analyticsRepository.getViewCount(u.id);
        return {
          id: u.id,
          name: u.name,
          type: u.type,
          size: u.size,
          formattedSize: u.formattedSize,
          uploaderCountryCode: u.uploaderCountryCode,
          createdAt: u.createdAt,
          views
        };
      })
    );
    const storageMode = isUpstashConfigured() ? redisHealth.connected ? "Upstash Redis (Terdistribusi)" : "Upstash Redis (Terputus / Gangguan)" : "In-Memory (Fallback)";
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.json({
      success: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      today: todayStats,
      totalItemsInRepo,
      redis: {
        configured: redisHealth.configured,
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs,
        mode: storageMode
      },
      catbox: {
        available: catboxHealth.available,
        latencyMs: catboxHealth.latencyMs
      },
      recentUploads: enhancedRecentUploads
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-permanent
   * Irreversibly deletes file from Catbox upstream and removes it from AirShare database/analytics.
   * Strictly protected by requireAdminAuth.
   */
  async deletePermanent(req, res) {
    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Parameter ID berkas wajib diisi." }
      });
      return;
    }
    const mediaRepo = getMediaRepository();
    const item = await mediaRepo.getByIdForAdmin(id);
    const targetUrlOrId = item ? item.shareUrl || item.id : id;
    const itemName = item?.name || id;
    const catboxResult = await storageProvider2.delete(targetUrlOrId);
    await mediaRepo.deleteForAdmin(id);
    await analyticsRepository.removeRecentUpload(id);
    await analyticsRepository.removeFileFromAllStats(id);
    await analyticsRepository.recordDeletion(1);
    await removeSyncCheckItem(id);
    await deletedFilesRepository.recordDeleted({
      id,
      name: itemName,
      formattedSize: item?.formattedSize || "-",
      type: item?.type || "file",
      shareUrl: item?.shareUrl || targetUrlOrId,
      deletedAt: Date.now(),
      deletedBy: "admin",
      reason: "Admin menghapus berkas permanen dari dashboard"
    });
    const clientIp = getClientIp(req);
    await auditLogRepository.recordAction({
      type: "PERMANENT_DELETE",
      detail: `Hapus permanen berkas "${itemName}" (ID: ${id}) dari Catbox & database. Status Catbox: ${catboxResult.success ? "BERHASIL" : "GAGAL (" + catboxResult.message + ")"}`,
      ip: clientIp
    });
    console.log(
      `[ADMIN AUDIT] Permanent delete media ID: ${id}, name: "${itemName}", Catbox response: ${catboxResult.success ? "SUCCESS" : catboxResult.message}`
    );
    res.json({
      success: true,
      message: catboxResult.success ? `Berkas "${itemName}" berhasil dihapus permanen dari server Catbox dan database AirShare.` : `Berkas "${itemName}" dihapus dari database AirShare (${catboxResult.message}).`,
      catboxDeleted: catboxResult.success,
      warning: !catboxResult.success
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-history-only
   * Cleans up broken or orphan file metadata from AirShare database without calling Catbox.
   * Strictly protected by requireAdminAuth.
   */
  async deleteHistoryOnly(req, res) {
    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Parameter ID berkas wajib diisi." }
      });
      return;
    }
    const clientIp = getClientIp(req);
    const mediaRepo = getMediaRepository();
    const item = await mediaRepo.getByIdForAdmin(id);
    await mediaRepo.deleteForAdmin(id);
    await analyticsRepository.removeRecentUpload(id);
    await analyticsRepository.removeFileFromAllStats(id);
    await analyticsRepository.recordDeletion(1);
    await removeSyncCheckItem(id);
    await deletedFilesRepository.recordDeleted({
      id,
      name: item?.name || id,
      formattedSize: item?.formattedSize || "-",
      type: item?.type || "file",
      shareUrl: item?.shareUrl || "#",
      deletedAt: Date.now(),
      deletedBy: "admin",
      reason: "Admin membersihkan riwayat database lokal"
    });
    await auditLogRepository.recordAction({
      type: "HISTORY_DELETE",
      detail: `Pembersihan riwayat database lokal untuk berkas ID: ${id}`,
      ip: clientIp
    });
    console.log(`[ADMIN AUDIT] History-only cleanup for media ID: ${id}`);
    res.json({
      success: true,
      message: `Berkas ${id} berhasil dibersihkan dari riwayat database AirShare.`
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/sync-check
   * Verifies recent files on Catbox upstream to identify active vs broken/orphan files.
   * Strictly protected by requireAdminAuth.
   */
  async runSyncCheck(req, res) {
    const clientIp = getClientIp(req);
    const recentUploads = await analyticsRepository.getRecentUploads(50);
    if (!recentUploads || recentUploads.length === 0) {
      const emptySummary = {
        timestamp: Date.now(),
        totalChecked: 0,
        healthyCount: 0,
        brokenCount: 0,
        brokenItems: []
      };
      await saveLastSyncCheck(emptySummary);
      res.json({
        success: true,
        ...emptySummary
      });
      return;
    }
    const filesToCheck = recentUploads.map((u) => ({
      id: u.id,
      shareUrl: u.shareUrl,
      name: u.name,
      formattedSize: u.formattedSize,
      createdAt: u.createdAt
    }));
    const batchResults = await verifyFilesBatch(filesToCheck, 5);
    const brokenItems = batchResults.filter((r) => !r.exists).map((r) => r.item);
    const healthyCount = batchResults.filter((r) => r.exists).length;
    const summary = {
      timestamp: Date.now(),
      totalChecked: batchResults.length,
      healthyCount,
      brokenCount: brokenItems.length,
      brokenItems
    };
    await saveLastSyncCheck(summary);
    await auditLogRepository.recordAction({
      type: "SYNC_CHECK",
      detail: `Pemeriksaan sinkronisasi selesai: ${summary.totalChecked} berkas diperiksa, ${summary.healthyCount} sehat, ${summary.brokenCount} broken/hilang`,
      ip: clientIp
    });
    console.log(
      `[ADMIN AUDIT] Sync check completed: ${summary.totalChecked} checked, ${summary.healthyCount} healthy, ${summary.brokenCount} broken.`
    );
    res.json({
      success: true,
      timestamp: summary.timestamp,
      totalChecked: summary.totalChecked,
      healthyCount: summary.healthyCount,
      brokenCount: summary.brokenCount,
      brokenItems: summary.brokenItems
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/purge-broken
   * Verifies upstream Catbox files and immediately purges all 404/broken/orphan entries
   * from both MediaRepository and Analytics history.
   */
  async purgeBrokenFiles(req, res) {
    const clientIp = getClientIp(req);
    const mediaRepo = getMediaRepository();
    const recentUploads = await analyticsRepository.getRecentUploads(100);
    const filesToCheck = recentUploads.map((u) => ({
      id: u.id,
      shareUrl: u.shareUrl,
      name: u.name,
      formattedSize: u.formattedSize,
      createdAt: u.createdAt
    }));
    const batchResults = await verifyFilesBatch(filesToCheck, 5);
    let purgedCount = 0;
    for (const resItem of batchResults) {
      if (!resItem.exists) {
        await mediaRepo.deleteForAdmin(resItem.item.id);
        await analyticsRepository.removeRecentUpload(resItem.item.id);
        await analyticsRepository.removeFileFromAllStats(resItem.item.id);
        await removeSyncCheckItem(resItem.item.id);
        await deletedFilesRepository.recordDeleted({
          id: resItem.item.id,
          name: resItem.item.name || resItem.item.id,
          formattedSize: resItem.item.formattedSize || "-",
          type: "file",
          shareUrl: resItem.item.shareUrl || "#",
          deletedAt: Date.now(),
          deletedBy: "sync_purge",
          reason: "Pembersihan otomatis berkas 404 / broken link di server Catbox"
        });
        purgedCount++;
      }
    }
    if (purgedCount > 0) {
      await analyticsRepository.recordDeletion(purgedCount);
    }
    await analyticsRepository.purgeTestData();
    if ("clearTestData" in mediaRepo && typeof mediaRepo.clearTestData === "function") {
      mediaRepo.clearTestData();
    }
    const healthyCount = batchResults.filter((r) => r.exists).length;
    const summary = {
      timestamp: Date.now(),
      totalChecked: batchResults.length,
      healthyCount,
      brokenCount: 0,
      brokenItems: []
    };
    await saveLastSyncCheck(summary);
    await auditLogRepository.recordAction({
      type: "SYNC_CHECK",
      detail: `Pembersihan berkas rusak (404) selesai: ${purgedCount} berkas 404/orphan dihapus dari database & analitik, ${healthyCount} berkas valid dipertahankan.`,
      ip: clientIp
    });
    res.json({
      success: true,
      data: {
        purgedCount,
        healthyCount,
        totalChecked: batchResults.length
      }
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/config
   * Updates dynamic system configurations (limits, announcement banner, feature flags).
   */
  async updateConfig(req, res) {
    const clientIp = getClientIp(req);
    const { maxUploadSize, rateLimit, announcement, featureFlags } = req.body || {};
    const changes = [];
    if (typeof maxUploadSize === "number" && maxUploadSize >= 1024 * 1024 && maxUploadSize <= 500 * 1024 * 1024) {
      await setMaxUploadSize(maxUploadSize);
      changes.push(`maxUploadSize: ${Math.round(maxUploadSize / (1024 * 1024))} MB`);
    }
    if (rateLimit && typeof rateLimit.limit === "number") {
      const limit = Math.max(1, Math.min(200, rateLimit.limit));
      const windowMs = typeof rateLimit.windowMs === "number" ? rateLimit.windowMs : 6e4;
      await setUploadRateLimit(limit, windowMs);
      changes.push(`rateLimit: ${limit}/mnt`);
    }
    if (announcement && typeof announcement.message === "string") {
      const validTypes = ["info", "warning", "success"];
      const type = validTypes.includes(announcement.type) ? announcement.type : "info";
      await setAnnouncement({
        message: announcement.message,
        type,
        enabled: Boolean(announcement.enabled)
      });
      changes.push(`announcement: ${announcement.enabled ? "Aktif" : "Nonaktif"} ("${announcement.message.substring(0, 30)}")`);
    }
    if (featureFlags && typeof featureFlags === "object") {
      await setFeatureFlags({
        pasteToUpload: Boolean(featureFlags.pasteToUpload),
        qrCode: Boolean(featureFlags.qrCode),
        pwaInstallPrompt: Boolean(featureFlags.pwaInstallPrompt)
      });
      changes.push(`featureFlags: paste=${Boolean(featureFlags.pasteToUpload)}, qr=${Boolean(featureFlags.qrCode)}, pwa=${Boolean(featureFlags.pwaInstallPrompt)}`);
    }
    const updatedConfig = await getAllSystemConfig();
    await auditLogRepository.recordAction({
      type: "CONFIG_UPDATE",
      detail: changes.length > 0 ? `Perubahan konfigurasi: ${changes.join(", ")}` : "Konfigurasi sistem diperbarui",
      ip: clientIp
    });
    res.json({
      success: true,
      data: updatedConfig
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/maintenance
   * Toggles the maintenance mode kill switch.
   */
  async toggleMaintenance(req, res) {
    const clientIp = getClientIp(req);
    const enabled = Boolean(req.body?.enabled);
    await setMaintenanceMode(enabled);
    await auditLogRepository.recordAction({
      type: "MAINTENANCE_TOGGLE",
      detail: enabled ? "Kill Switch DIAKTIFKAN \u2014 Mode Pemeliharaan aktif, seluruh unggahan publik ditolak (503)" : "Kill Switch DINONAKTIFKAN \u2014 Mode Pemeliharaan nonaktif, layanan unggahan berjalan normal",
      ip: clientIp
    });
    alertMaintenanceModeChanged(enabled, "web", `IP ${clientIp}`).catch((alertErr) => {
      console.warn("[TELEGRAM_ALERT_WARN] Gagal mengirim alert maintenance mode:", alertErr);
    });
    res.json({
      success: true,
      maintenanceMode: enabled,
      message: enabled ? "Mode Pemeliharaan aktif (Kill Switch Hidup)." : "Mode Pemeliharaan dinonaktifkan (Layanan Normal)."
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-session
   * Revokes a specific active admin session.
   */
  async revokeSession(req, res) {
    const clientIp = getClientIp(req);
    const { tokenToRevoke } = req.body || {};
    if (!tokenToRevoke || typeof tokenToRevoke !== "string") {
      res.status(400).json({ success: false, error: { message: "Token sesi wajib diberikan." } });
      return;
    }
    await revokeAdminSession(tokenToRevoke);
    await auditLogRepository.recordAction({
      type: "SESSION_REVOKE",
      detail: `Mencabut sesi admin dengan token ${tokenToRevoke.substring(0, 8)}...`,
      ip: clientIp,
      adminTokenPreview: `${tokenToRevoke.substring(0, 8)}...`
    });
    res.json({
      success: true,
      message: "Sesi admin berhasil dicabut."
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-all-sessions
   * Revokes all active admin sessions except current one.
   */
  async revokeAllSessions(req, res) {
    const clientIp = getClientIp(req);
    const currentToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const count = await revokeAllAdminSessions(currentToken);
    await auditLogRepository.recordAction({
      type: "SESSION_REVOKE_ALL",
      detail: `Mencabut SEMUA sesi admin lain (${count} sesi ditutup)`,
      ip: clientIp
    });
    res.json({
      success: true,
      revokedCount: count,
      message: `Berhasil mencabut ${count} sesi admin lain.`
    });
  },
  /**
   * GET /{ADMIN_PANEL_PATH}/api/search
   * Search files in repository by name, ID, or filename.
   */
  async searchFiles(req, res) {
    const query = String(req.query.q || "").trim().toLowerCase();
    if (!query) {
      res.json({ success: true, data: { items: [], total: 0 } });
      return;
    }
    const allRecent = await analyticsRepository.getRecentUploads(500);
    const matched = allRecent.filter(
      (item) => item.id.toLowerCase().includes(query) || item.name && item.name.toLowerCase().includes(query) || item.originalFileName && item.originalFileName.toLowerCase().includes(query)
    );
    const enriched = await Promise.all(
      matched.map(async (m) => {
        const views = await analyticsRepository.getViewCount(m.id);
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          size: m.size,
          formattedSize: m.formattedSize,
          createdAt: m.createdAt,
          uploaderCountryCode: m.uploaderCountryCode,
          views,
          shareUrl: m.shareUrl
        };
      })
    );
    res.json({
      success: true,
      data: {
        query,
        items: enriched,
        total: enriched.length
      }
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup/preview
   * Previews files matching age and view count criteria.
   */
  async previewBulkCleanup(req, res) {
    const olderThanDays = Number(req.body?.olderThanDays) || 0;
    const maxViews = req.body?.maxViews !== void 0 ? Number(req.body.maxViews) : 0;
    const now = Date.now();
    const cutoffTime = olderThanDays > 0 ? now - olderThanDays * 24 * 60 * 60 * 1e3 : now;
    const allRecent = await analyticsRepository.getRecentUploads(500);
    const candidates = [];
    let totalBytes = 0;
    for (const item of allRecent) {
      if (olderThanDays > 0 && item.createdAt > cutoffTime) {
        continue;
      }
      const views = await analyticsRepository.getViewCount(item.id);
      if (views <= maxViews) {
        candidates.push({
          id: item.id,
          name: item.name,
          formattedSize: item.formattedSize,
          size: item.size || 0,
          createdAt: item.createdAt,
          views
        });
        totalBytes += item.size || 0;
      }
    }
    res.json({
      success: true,
      data: {
        total: candidates.length,
        totalBytes,
        formattedTotalBytes: formatBytes4(totalBytes),
        items: candidates.slice(0, 100)
      }
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup
   * Irreversibly deletes files matching criteria from Catbox and database.
   */
  async executeBulkCleanup(req, res) {
    const { olderThanDays, maxViews, confirm } = req.body || {};
    if (!confirm) {
      res.status(400).json({
        success: false,
        error: { code: "CONFIRMATION_REQUIRED", message: "Konfirmasi eksplisit diperlukan untuk eksekusi pembersihan massal." }
      });
      return;
    }
    const clientIp = getClientIp(req);
    const days = Number(olderThanDays) || 0;
    const viewsLimit = maxViews !== void 0 ? Number(maxViews) : 0;
    const now = Date.now();
    const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1e3 : now;
    const mediaRepo = getMediaRepository();
    const allRecent = await analyticsRepository.getRecentUploads(500);
    let succeeded = 0;
    let failed = 0;
    let freedBytes = 0;
    for (const item of allRecent) {
      if (days > 0 && item.createdAt > cutoffTime) {
        continue;
      }
      const views = await analyticsRepository.getViewCount(item.id);
      if (views <= viewsLimit) {
        try {
          await storageProvider2.delete(item.shareUrl || item.id);
          await mediaRepo.deleteForAdmin(item.id);
          await analyticsRepository.removeRecentUpload(item.id);
          await analyticsRepository.removeFileFromAllStats(item.id);
          await removeSyncCheckItem(item.id);
          await deletedFilesRepository.recordDeleted({
            id: item.id,
            name: item.name || item.id,
            formattedSize: item.formattedSize || "-",
            type: item.type || "file",
            shareUrl: item.shareUrl || "#",
            deletedAt: Date.now(),
            deletedBy: "bulk_cleanup",
            reason: `Pembersihan massal (kriteria usia > ${days} hari, views <= ${viewsLimit})`
          });
          succeeded++;
          freedBytes += item.size || 0;
        } catch (err) {
          failed++;
        }
      }
    }
    if (succeeded > 0) {
      await analyticsRepository.recordDeletion(succeeded);
    }
    await auditLogRepository.recordAction({
      type: "BULK_CLEANUP",
      detail: `Pembersihan massal (Kriteria: usia > ${days} hari, views <= ${viewsLimit}): Berhasil menghapus ${succeeded} berkas, gagal ${failed}. Total penyimpanan dibebaskan: ${formatBytes4(freedBytes)}`,
      ip: clientIp
    });
    res.json({
      success: true,
      data: {
        succeeded,
        failed,
        freedBytes,
        formattedFreedBytes: formatBytes4(freedBytes)
      }
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/clear-deleted-history
   * Clears all deleted files archive history.
   * Strictly protected by requireAdminAuth.
   */
  async clearDeletedHistory(req, res) {
    const clientIp = getClientIp(req);
    const count = await deletedFilesRepository.clearAll();
    await auditLogRepository.recordAction({
      type: "HISTORY_DELETE",
      detail: `Admin membersihkan seluruh arsip riwayat berkas terhapus (${count} arsip dibersihkan)`,
      ip: clientIp
    });
    res.json({
      success: true,
      clearedCount: count,
      message: `Berhasil membersihkan ${count} riwayat berkas terhapus.`
    });
  },
  /**
   * GET /{ADMIN_PANEL_PATH}/api/deleted-files
   * Returns list of recently deleted files for admin audit.
   * Strictly protected by requireAdminAuth.
   */
  async getDeletedFiles(req, res) {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const items = await deletedFilesRepository.getDeletedFiles(limit);
    res.json({
      success: true,
      data: {
        items,
        total: items.length
      }
    });
  },
  /**
   * POST /{ADMIN_PANEL_PATH}/api/ai-recommendations
   * Real-time executive summary and strategic recommendations generated by Gemini 3.8 Flash.
   * Includes automated graceful fallback to heuristic engine if API key is not configured or fails.
   */
  async getAiRecommendations(req, res) {
    const todayStr = getTodayDateString();
    try {
      const [todayStats, weeklyTrend, topFiles, catboxHealth, redisHealth, totalItems] = await Promise.all([
        analyticsRepository.getDailySummary(todayStr),
        analyticsRepository.getWeeklyTrend(),
        analyticsRepository.getTopFiles(10),
        checkCatboxHealth(),
        checkRedisHealth(),
        analyticsRepository.getTotalItemsEver()
      ]);
      const heuristicRecs = generateRecommendations(todayStats, weeklyTrend, topFiles);
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
          const prompt = `Anda adalah asisten AI Analitik Sistem dan Infrastruktur untuk AirShare Pro (platform berbagi berkas media berkinerja tinggi).
Analisis metrik sistem real-time berikut ini dan berikan ringkasan eksekutif beserta rekomendasi strategis dalam format JSON:

DATA SISTEM REAL-TIME:
- Tanggal: ${todayStats.date}
- Unggahan Hari Ini: ${todayStats.uploads} berkas (${todayStats.formattedBytes})
- Rata-rata Ukuran Berkas: ${todayStats.formattedAverageSize}
- Total Berkas Tersimpan Aktif: ${totalItems} berkas
- Total Kunjungan Share Hari Ini: ${todayStats.totalViews} kali
- Distribusi Tipe Media: ${JSON.stringify(todayStats.byType)}
- Distribusi Negara Pengunggah: ${JSON.stringify(todayStats.byCountry)}
- Berkas Paling Sering Dilihat: ${JSON.stringify(topFiles.map((f) => ({ id: f.id, views: f.views })))}
- Status Catbox Storage: ${catboxHealth.available ? "TERSEDIA" : "TERGANGGU"} (${catboxHealth.latencyMs !== null ? `${catboxHealth.latencyMs}ms` : "N/A"})
- Status Upstash Redis: ${redisHealth.connected ? "TERHUBUNG" : redisHealth.configured ? "DISCONNECTED" : "LOCAL IN-MEMORY"} (${redisHealth.latencyMs !== null ? `${redisHealth.latencyMs}ms` : "N/A"})
- Tren 7 Hari Terakhir: ${weeklyTrend.map((w) => `${w.date}: ${w.uploads} unggahan (${w.formattedBytes})`).join(", ")}

INSTRUKSI OUTPUT:
Hasilkan respons JSON valid dengan struktur:
{
  "summary": "Ringkasan eksekutif 2-3 kalimat mengenai status sistem, tren volume beban, dan efisiensi penyimpanan saat ini. Boleh menggunakan format Markdown (seperti **bold** atau \`code\`).",
  "recommendations": [
    "Rekomendasi 1 yang terarah (boleh gunakan **bold** dan \`code\`)",
    "Rekomendasi 2",
    "Rekomendasi 3",
    "Rekomendasi 4"
  ]
}
Pastikan rekomendasi berfokus pada optimasi bandwidth, proteksi kuota penyimpanan, retensi data, dan keamanan operasional.`;
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          });
          const rawText = response.text?.trim() || "";
          let parsedResponse = null;
          try {
            parsedResponse = JSON.parse(rawText);
          } catch {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedResponse = JSON.parse(jsonMatch[0]);
            }
          }
          if (parsedResponse && (parsedResponse.summary || Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0)) {
            res.json({
              success: true,
              model: "gemini-3.8-flash",
              summary: parsedResponse.summary || "Sistem beroperasi normal dengan parameter kapasitas optimal.",
              recommendations: Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0 ? parsedResponse.recommendations : heuristicRecs,
              generatedAt: Date.now()
            });
            return;
          }
        } catch (geminiErr) {
          console.warn("[GEMINI_RECOMMENDATION_WARN] Gagal menghubungi Gemini API, fallback ke heuristik:", geminiErr?.message || geminiErr);
        }
      }
      res.json({
        success: true,
        model: "heuristic-engine",
        summary: `Sistem mencatat total **${todayStats.uploads} unggahan** (${todayStats.formattedBytes}) dengan **${todayStats.totalViews} kunjungan** pada hari ini. Status penyimpanan Catbox saat ini: \`${catboxHealth.available ? "TERSEDIA" : "TERGANGGU"}\`.`,
        recommendations: heuristicRecs,
        generatedAt: Date.now()
      });
    } catch (err) {
      console.error("[AI_RECOMMENDATIONS_ERROR]", err);
      res.status(500).json({
        success: false,
        error: "Gagal menghasilkan analisis rekomendasi AI. Silakan coba beberapa saat lagi."
      });
    }
  }
};

// src/server/security/request-logger.ts
import crypto3 from "crypto";
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto3.randomBytes(4).toString("hex")}`;
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
import crypto4 from "crypto";
var SESSION_COOKIE_NAME = "airshare_session";
function isValidSessionId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}
function sessionMiddleware(req, res, next) {
  const existingCookie = req.cookies?.[SESSION_COOKIE_NAME];
  let sessionId = existingCookie;
  if (!sessionId || !isValidSessionId(sessionId)) {
    sessionId = `sess_${crypto4.randomBytes(16).toString("hex")}`;
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

// src/server/telegram/pending-confirmations.ts
import crypto5 from "crypto";
var CONFIRMATION_TTL_SECONDS = 60;
var CONFIRMATION_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateConfirmationId(length = 6) {
  const bytes = crypto5.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CONFIRMATION_CHARS[bytes[i] % CONFIRMATION_CHARS.length];
  }
  return result;
}
var inMemoryPendingActions = /* @__PURE__ */ new Map();
function cleanupMemoryActions() {
  const now = Date.now();
  for (const [id, action] of inMemoryPendingActions.entries()) {
    if (action.expiresAt <= now) {
      inMemoryPendingActions.delete(id);
    }
  }
}
async function createPendingAction(userId, action) {
  const confirmationId = generateConfirmationId(6);
  const now = Date.now();
  const expiresAt = now + CONFIRMATION_TTL_SECONDS * 1e3;
  const pending = {
    id: confirmationId,
    type: action.type,
    userId,
    createdAt: now,
    expiresAt,
    description: action.description,
    payload: action.payload
  };
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `telegram_pending:${confirmationId}`;
      await redis.set(key, JSON.stringify(pending), { ex: CONFIRMATION_TTL_SECONDS });
      return confirmationId;
    } catch (err) {
      console.warn("[TELEGRAM_PENDING] Gagal menyimpan ke Redis, fallback in-memory:", err);
    }
  }
  cleanupMemoryActions();
  inMemoryPendingActions.set(confirmationId, pending);
  return confirmationId;
}
async function getPendingAction(confirmationId) {
  if (!confirmationId || typeof confirmationId !== "string") return null;
  const cleanId = confirmationId.trim().toUpperCase();
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `telegram_pending:${cleanId}`;
      const raw = await redis.get(key);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed.expiresAt > Date.now()) {
          return parsed;
        }
        await redis.del(key);
      }
      return null;
    } catch (err) {
      console.warn("[TELEGRAM_PENDING] Gagal membaca dari Redis, fallback in-memory:", err);
    }
  }
  cleanupMemoryActions();
  const item = inMemoryPendingActions.get(cleanId);
  if (item && item.expiresAt > Date.now()) {
    return item;
  }
  if (item) {
    inMemoryPendingActions.delete(cleanId);
  }
  return null;
}
async function clearPendingAction(confirmationId) {
  if (!confirmationId) return;
  const cleanId = confirmationId.trim().toUpperCase();
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.del(`telegram_pending:${cleanId}`);
    } catch (err) {
      console.warn("[TELEGRAM_PENDING] Gagal menghapus dari Redis:", err);
    }
  }
  inMemoryPendingActions.delete(cleanId);
}

// src/server/telegram/telegram-commands.ts
var storageProvider3 = new CatboxStorageProvider();
function escapeHtml4(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatBytes5(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
async function handleTelegramCommand(payload) {
  const fromId = payload.from.id;
  const username = payload.from.username;
  const chatId = payload.chat.id;
  const rawText = (payload.text || "").trim();
  if (!rawText) return;
  if (!isAuthorizedTelegramUser(fromId)) {
    await handleUnauthorizedAttempt(fromId, username);
    await sendTelegramMessage(chatId, "Bot ini bersifat privat.");
    return;
  }
  const allowed = await checkTelegramRateLimit(fromId);
  if (!allowed) {
    await sendTelegramMessage(chatId, "\u26A0\uFE0F Terlalu banyak perintah. Silakan tunggu 1 menit.");
    return;
  }
  const parts = rawText.split(/\s+/);
  const commandWithBot = parts[0];
  const command = commandWithBot.split("@")[0].toLowerCase();
  const args = parts.slice(1);
  switch (command) {
    case "/start":
    case "/help":
      await handleHelp(chatId);
      break;
    case "/status":
      await handleStatus(chatId);
      break;
    case "/stats":
      await handleStats(chatId);
      break;
    case "/log":
      await handleLog(chatId);
      break;
    case "/sessions":
      await handleSessions(chatId);
      break;
    case "/confirm":
      await handleConfirm(chatId, fromId, username, args[0]);
      break;
    case "/killswitch_on":
      await promptKillswitch(chatId, fromId, true);
      break;
    case "/killswitch_off":
      await promptKillswitch(chatId, fromId, false);
      break;
    case "/hapus_permanen":
      await promptHapusPermanen(chatId, fromId, args[0]);
      break;
    case "/revoke_all_sesi":
      await promptRevokeAllSessions(chatId, fromId);
      break;
    case "/bulk_cleanup":
      await promptBulkCleanup(chatId, fromId, args[0], args[1]);
      break;
    case "/announcement":
      await promptAnnouncement(chatId, fromId, args.join(" "));
      break;
    default:
      await sendTelegramMessage(
        chatId,
        "Perintah tidak dikenali. Ketik /help untuk melihat daftar perintah yang tersedia."
      );
      break;
  }
}
async function handleHelp(chatId) {
  const msg = [
    "\u{1F916} <b>AirShare Pro \u2014 Admin Control Bot</b>",
    "",
    "<b>Perintah Pemantauan &amp; Informasi:</b>",
    "\u2022 /status \u2014 Ringkasan kesehatan sistem &amp; aktivitas hari ini",
    "\u2022 /stats \u2014 Statistik 7 hari, distribusi tipe, dan top berkas",
    "\u2022 /log \u2014 10 catatan audit log terbaru",
    "\u2022 /sessions \u2014 Daftar sesi admin web yang aktif saat ini",
    "",
    "<b>Perintah Kontrol (Memerlukan Konfirmasi):</b>",
    "\u2022 /killswitch_on \u2014 Aktifkan Kill Switch (tutup unggahan, 503)",
    "\u2022 /killswitch_off \u2014 Nonaktifkan Kill Switch (buka unggahan)",
    "\u2022 /hapus_permanen &lt;id&gt; \u2014 Hapus berkas dari Catbox &amp; DB",
    "\u2022 /revoke_all_sesi \u2014 Cabut seluruh sesi admin web aktif",
    "\u2022 /bulk_cleanup &lt;hari&gt; &lt;maxViews&gt; \u2014 Pembersihan massal berkas usang",
    "\u2022 /announcement &lt;pesan&gt; \u2014 Pasang banner pengumuman publik",
    "",
    "<i>Catatan: Aksi destruktif memerlukan konfirmasi dengan kode acak dalam 60 detik.</i>"
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function handleStatus(chatId) {
  const [isMaintenance, redisHealth, catboxHealth, todaySummary] = await Promise.all([
    isMaintenanceModeActive(),
    checkRedisHealth(),
    checkCatboxHealth(),
    analyticsRepository.getDailySummary(getTodayDateString())
  ]);
  const redisStatus = redisHealth.connected ? `\u{1F7E2} Terhubung (${redisHealth.latencyMs || 0} ms)` : redisHealth.configured ? "\u{1F534} Gagal Terhubung" : "\u26AA In-Memory (Belum Dikonfigurasi)";
  const catboxStatus = catboxHealth.available ? `\u{1F7E2} Aktif (${catboxHealth.latencyMs || 0} ms)` : "\u{1F534} Gangguan / Tidak Tersedia";
  const maintStatus = isMaintenance ? "\u{1F534} <b>AKTIF</b> (Unggahan Ditutup \u2014 503)" : "\u{1F7E2} <b>Layanan Normal</b> (Unggahan Terbuka)";
  const msg = [
    "\u{1F4CA} <b>Status Sistem AirShare Pro</b>",
    "",
    `\u2022 <b>Maintenance Mode:</b> ${maintStatus}`,
    `\u2022 <b>Penyimpanan Redis:</b> ${redisStatus}`,
    `\u2022 <b>Upstream Catbox:</b> ${catboxStatus}`,
    "",
    "<b>Aktivitas Hari Ini:</b>",
    `\u2022 Unggahan: <b>${todaySummary.uploads}</b> berkas (${todaySummary.formattedBytes})`,
    `\u2022 Kunjungan (Views): <b>${todaySummary.totalViews}</b> kali`
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function handleStats(chatId) {
  const today = getTodayDateString();
  const [weeklyTrend, todaySummary, topFiles, recentUploads] = await Promise.all([
    analyticsRepository.getWeeklyTrend(),
    analyticsRepository.getDailySummary(today),
    analyticsRepository.getTopFiles(5),
    analyticsRepository.getRecentUploads(50)
  ]);
  let total7dUploads = 0;
  let total7dViews = 0;
  let total7dBytes = 0;
  for (const item of weeklyTrend) {
    total7dUploads += item.uploads;
    total7dViews += item.views;
    total7dBytes += item.bytes;
  }
  const typeLines = Object.entries(todaySummary.byType).map(([type, count]) => `  \u2022 ${type}: ${count}`).join("\n") || "  \u2022 Belum ada unggahan hari ini";
  const nameMap = /* @__PURE__ */ new Map();
  for (const item of recentUploads) {
    nameMap.set(item.id, item.name);
  }
  let topFilesText = "";
  if (topFiles.length > 0) {
    topFilesText = topFiles.map((f, idx) => {
      const name = nameMap.get(f.id) || f.id;
      return `${idx + 1}. <code>${escapeHtml4(name.slice(0, 30))}</code> \u2014 <b>${f.views} views</b>`;
    }).join("\n");
  } else {
    topFilesText = "Belum ada data file populer.";
  }
  const msg = [
    "\u{1F4C8} <b>Statistik &amp; Analitik AirShare Pro</b>",
    "",
    "<b>Ringkasan Tren 7 Hari Terakhir:</b>",
    `\u2022 Total Unggahan: <b>${total7dUploads}</b> berkas`,
    `\u2022 Total Penayangan: <b>${total7dViews}</b> kali`,
    `\u2022 Total Ukuran: <b>${formatBytes5(total7dBytes)}</b>`,
    "",
    "<b>Distribusi Tipe Media Hari Ini:</b>",
    typeLines,
    "",
    "<b>Top 5 Berkas Terpopuler:</b>",
    topFilesText
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function handleLog(chatId) {
  const logs = await auditLogRepository.getRecentActions(10);
  if (logs.length === 0) {
    await sendTelegramMessage(chatId, "\u{1F4DD} Belum ada riwayat aktivitas di audit log.");
    return;
  }
  const logLines = logs.map((log) => {
    const timeStr = new Date(log.timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return `\u2022 [${timeStr}] <b>${escapeHtml4(log.type)}</b>: ${escapeHtml4(log.detail)} (IP: <code>${escapeHtml4(log.ip)}</code>)`;
  });
  const msg = [
    "\u{1F4CB} <b>10 Entri Audit Log Terbaru</b>",
    "",
    ...logLines
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function handleSessions(chatId) {
  const sessions = await getAllActiveSessions();
  if (sessions.length === 0) {
    await sendTelegramMessage(chatId, "\u{1F512} Tidak ada sesi admin web yang sedang aktif saat ini.");
    return;
  }
  const sessionLines = sessions.map((s, idx) => {
    const loginStr = new Date(s.loginAt).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${idx + 1}. Token: <code>${escapeHtml4(s.tokenPreview)}</code> | IP: <code>${escapeHtml4(s.ip)}</code> | Login: ${loginStr}`;
  });
  const msg = [
    `\u{1F510} <b>Daftar Sesi Admin Web Aktif (${sessions.length})</b>`,
    "",
    ...sessionLines,
    "",
    "<i>Ketik /revoke_all_sesi jika ingin mencabut semua sesi sekaligus.</i>"
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function promptKillswitch(chatId, userId, enable) {
  const current = await isMaintenanceModeActive();
  if (current === enable) {
    await sendTelegramMessage(
      chatId,
      `\u2139\uFE0F Kill switch sudah dalam status ${enable ? "AKTIF" : "NONAKTIF"}. Tidak ada perubahan yang diperlukan.`
    );
    return;
  }
  const actionType = enable ? "killswitch_on" : "killswitch_off";
  const desc = enable ? "Mengaktifkan Kill Switch (tutup seluruh unggahan baru dengan HTTP 503)" : "Menonaktifkan Kill Switch (membuka kembali layanan unggahan normal)";
  const confirmationId = await createPendingAction(userId, {
    type: actionType,
    description: desc
  });
  const msg = [
    `\u26A0\uFE0F <b>KONFIRMASI ${enable ? "AKTIVASI" : "DEAKTIVASI"} KILL SWITCH</b>`,
    "",
    `Aksi yang akan dilakukan:`,
    `<b>${desc}</b>`,
    "",
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`,
    "",
    "<i>Abaikan pesan ini untuk membatalkan aksi.</i>"
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function promptHapusPermanen(chatId, userId, fileId) {
  if (!fileId || fileId.trim().length === 0) {
    await sendTelegramMessage(chatId, "\u274C Format salah. Gunakan: <code>/hapus_permanen &lt;ID_BERKAS&gt;</code>");
    return;
  }
  const cleanId = fileId.trim();
  const mediaRepo = getMediaRepository();
  let media = await mediaRepo.getByIdForAdmin(cleanId);
  if (!media) {
    const recents = await analyticsRepository.getRecentUploads(200);
    const found = recents.find((r) => r.id === cleanId);
    if (found) {
      media = {
        id: found.id,
        name: found.name,
        originalFileName: found.originalFileName,
        size: found.size,
        formattedSize: found.formattedSize,
        type: found.type,
        mimeType: found.mimeType,
        shareUrl: found.shareUrl,
        provider: "catbox",
        createdAt: found.createdAt,
        sessionId: "unknown"
      };
    }
  }
  if (!media) {
    await sendTelegramMessage(chatId, `\u274C Berkas dengan ID <code>${escapeHtml4(cleanId)}</code> tidak ditemukan di repositori.`);
    return;
  }
  const confirmationId = await createPendingAction(userId, {
    type: "hapus_permanen",
    description: `Hapus permanen berkas "${media.name}" (${media.id})`,
    payload: {
      id: media.id,
      name: media.name,
      shareUrl: media.shareUrl,
      size: media.size,
      formattedSize: media.formattedSize
    }
  });
  const msg = [
    "\u26A0\uFE0F <b>KONFIRMASI HAPUS PERMANEN BERKAS</b>",
    "",
    `\u2022 Nama Berkas: <code>${escapeHtml4(media.name)}</code>`,
    `\u2022 Ukuran: <b>${media.formattedSize}</b>`,
    `\u2022 ID: <code>${escapeHtml4(media.id)}</code>`,
    `\u2022 Tautan: ${escapeHtml4(media.shareUrl)}`,
    "",
    "<i>Berkas akan dihapus secara permanen dari server Catbox dan database. Aksi ini tidak dapat dibatalkan.</i>",
    "",
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function promptRevokeAllSessions(chatId, userId) {
  const sessions = await getAllActiveSessions();
  const count = sessions.length;
  if (count === 0) {
    await sendTelegramMessage(chatId, "\u2139\uFE0F Tidak ada sesi admin aktif yang perlu dicabut.");
    return;
  }
  const confirmationId = await createPendingAction(userId, {
    type: "revoke_all_sesi",
    description: `Cabut seluruh ${count} sesi admin aktif`,
    payload: { count }
  });
  const msg = [
    "\u26A0\uFE0F <b>KONFIRMASI PENCABUTAN SELURUH SESI ADMIN</b>",
    "",
    `Aksi ini akan mencabut <b>${count} sesi admin web</b> yang saat ini aktif. Semua admin yang sedang login di browser akan langsung ter-logout dan wajib memasukkan password kembali.`,
    "",
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`,
    "",
    "<i>Abaikan pesan ini untuk membatalkan aksi.</i>"
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function promptBulkCleanup(chatId, userId, daysArg, viewsArg) {
  const days = parseInt(daysArg || "", 10);
  const maxViews = parseInt(viewsArg || "", 10);
  if (isNaN(days) || isNaN(maxViews) || days < 0 || maxViews < 0) {
    await sendTelegramMessage(
      chatId,
      "\u274C Format salah. Gunakan: <code>/bulk_cleanup &lt;hari&gt; &lt;maxViews&gt;</code>\nContoh: <code>/bulk_cleanup 30 0</code> (berkas usia > 30 hari dengan 0 views)"
    );
    return;
  }
  const now = Date.now();
  const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1e3 : now;
  const allRecent = await analyticsRepository.getRecentUploads(500);
  const candidates = [];
  let totalBytes = 0;
  for (const item of allRecent) {
    if (days > 0 && item.createdAt > cutoffTime) continue;
    const views = await analyticsRepository.getViewCount(item.id);
    if (views <= maxViews) {
      candidates.push({
        id: item.id,
        name: item.name,
        size: item.size || 0,
        shareUrl: item.shareUrl
      });
      totalBytes += item.size || 0;
    }
  }
  if (candidates.length === 0) {
    await sendTelegramMessage(
      chatId,
      `\u2139\uFE0F Tidak ditemukan berkas yang memenuhi kriteria (usia > ${days} hari dan views <= ${maxViews}).`
    );
    return;
  }
  const sampleNames = candidates.slice(0, 3).map((c) => `\u2022 <code>${escapeHtml4(c.name.slice(0, 35))}</code> (${formatBytes5(c.size)})`).join("\n");
  const confirmationId = await createPendingAction(userId, {
    type: "bulk_cleanup",
    description: `Pembersihan massal (${days} hari, views <= ${maxViews})`,
    payload: {
      olderThanDays: days,
      maxViews,
      candidates
    }
  });
  const msg = [
    "\u26A0\uFE0F <b>KONFIRMASI PEMBERSIHAN MASSAL (BULK CLEANUP)</b>",
    "",
    `Kriteria: Usia > <b>${days} hari</b> &amp; Views &le; <b>${maxViews}</b>`,
    `Jumlah Kandidat: <b>${candidates.length} berkas</b>`,
    `Total Ruang Dibebaskan: <b>${formatBytes5(totalBytes)}</b>`,
    "",
    "<b>Contoh berkas yang akan dihapus:</b>",
    sampleNames,
    candidates.length > 3 ? `<i>...dan ${candidates.length - 3} berkas lainnya</i>` : "",
    "",
    "<i>Seluruh berkas ini akan dihapus secara permanen dari Catbox. Aksi ini tidak dapat dibatalkan.</i>",
    "",
    `Balas dengan perintah berikut dalam 60 detik untuk mengeksekusi:`,
    `<code>/confirm ${confirmationId}</code>`
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function promptAnnouncement(chatId, userId, text) {
  const cleanText = (text || "").trim();
  if (!cleanText) {
    await sendTelegramMessage(
      chatId,
      "\u274C Format salah. Gunakan: <code>/announcement &lt;pesan pengumuman&gt;</code>\nContoh: <code>/announcement Server akan maintenance malam ini pukul 23:00 WIB</code>"
    );
    return;
  }
  const confirmationId = await createPendingAction(userId, {
    type: "announcement",
    description: `Banner pengumuman: "${cleanText}"`,
    payload: { message: cleanText }
  });
  const msg = [
    "\u{1F4E2} <b>PRATINJAU BANNER PENGUMUMAN</b>",
    "",
    "Pesan yang akan ditampilkan ke publik:",
    `<blockquote>${escapeHtml4(cleanText)}</blockquote>`,
    "",
    "Tipe: <b>Info (Biru)</b> | Status: <b>Aktif</b>",
    "",
    "Periksa kembali teks di atas untuk menghindari typo pada tampilan publik.",
    `Balas dengan perintah berikut dalam 60 detik untuk mengaktifkan:`,
    `<code>/confirm ${confirmationId}</code>`
  ].join("\n");
  await sendTelegramMessage(chatId, msg);
}
async function handleConfirm(chatId, userId, username, confirmationId) {
  if (!confirmationId || confirmationId.trim().length === 0) {
    await sendTelegramMessage(
      chatId,
      "\u274C Kode konfirmasi tidak disertakan. Format: <code>/confirm &lt;KODE&gt;</code>"
    );
    return;
  }
  const pending = await getPendingAction(confirmationId);
  if (!pending) {
    await sendTelegramMessage(
      chatId,
      "\u26A0\uFE0F Konfirmasi tidak ditemukan atau sudah kedaluwarsa (batas waktu 60 detik). Silakan ulangi perintah dari awal."
    );
    return;
  }
  if (pending.userId !== userId) {
    await sendTelegramMessage(
      chatId,
      "\u26A0\uFE0F Perintah ini hanya dapat dikonfirmasi oleh pengguna Telegram yang memintanya."
    );
    return;
  }
  await clearPendingAction(confirmationId);
  const adminTag = username ? `@${username}` : `ID: ${userId}`;
  try {
    switch (pending.type) {
      case "killswitch_on": {
        await setMaintenanceMode(true);
        await auditLogRepository.recordAction({
          type: "telegram_killswitch_toggle",
          detail: `Kill Switch (Maintenance Mode) DIAKTIFKAN oleh Telegram user ${adminTag}`,
          ip: "telegram-api"
        });
        await alertMaintenanceModeChanged(true, "telegram", adminTag);
        await sendTelegramMessage(
          chatId,
          "\u2705 <b>Kill Switch BERHASIL DIAKTIFKAN.</b>\nSeluruh unggahan baru kini ditolak dengan status HTTP 503 Maintenance Mode."
        );
        break;
      }
      case "killswitch_off": {
        await setMaintenanceMode(false);
        await auditLogRepository.recordAction({
          type: "telegram_killswitch_toggle",
          detail: `Kill Switch (Maintenance Mode) DINONAKTIFKAN oleh Telegram user ${adminTag}`,
          ip: "telegram-api"
        });
        await alertMaintenanceModeChanged(false, "telegram", adminTag);
        await sendTelegramMessage(
          chatId,
          "\u2705 <b>Kill Switch BERHASIL DINONAKTIFKAN.</b>\nLayanan unggahan telah dibuka kembali secara normal."
        );
        break;
      }
      case "hapus_permanen": {
        const payload = pending.payload;
        const mediaRepo = getMediaRepository();
        await storageProvider3.delete(payload.shareUrl || payload.id);
        await mediaRepo.deleteForAdmin(payload.id);
        await analyticsRepository.removeRecentUpload(payload.id);
        await removeSyncCheckItem(payload.id);
        await auditLogRepository.recordAction({
          type: "telegram_permanent_delete",
          detail: `Berkas "${payload.name}" (${payload.id}) dihapus permanen oleh Telegram user ${adminTag}`,
          ip: "telegram-api"
        });
        await sendTelegramMessage(
          chatId,
          `\u2705 Berkas <code>${escapeHtml4(payload.name)}</code> (${payload.id}) telah <b>berhasil dihapus secara permanen</b> dari Catbox dan repositori.`
        );
        break;
      }
      case "revoke_all_sesi": {
        const revokedCount = await revokeAllAdminSessions();
        await auditLogRepository.recordAction({
          type: "telegram_session_revoke_all",
          detail: `Pencabutan seluruh (${revokedCount}) sesi admin web oleh Telegram user ${adminTag}`,
          ip: "telegram-api"
        });
        await sendTelegramMessage(
          chatId,
          `\u2705 Berhasil mencabut <b>${revokedCount} sesi admin web</b> yang aktif. Semua sesi telah dibatalkan.`
        );
        break;
      }
      case "bulk_cleanup": {
        const { olderThanDays, maxViews, candidates } = pending.payload;
        const mediaRepo = getMediaRepository();
        let succeeded = 0;
        let failed = 0;
        let freedBytes = 0;
        for (const item of candidates) {
          try {
            await storageProvider3.delete(item.shareUrl || item.id);
            await mediaRepo.deleteForAdmin(item.id);
            await analyticsRepository.removeRecentUpload(item.id);
            await removeSyncCheckItem(item.id);
            succeeded++;
            freedBytes += item.size || 0;
          } catch {
            failed++;
          }
        }
        await auditLogRepository.recordAction({
          type: "telegram_bulk_cleanup",
          detail: `Pembersihan massal oleh Telegram user ${adminTag} (> ${olderThanDays} hari, views <= ${maxViews}): Sukses ${succeeded}, gagal ${failed}. Total: ${formatBytes5(freedBytes)}`,
          ip: "telegram-api"
        });
        await sendTelegramMessage(
          chatId,
          [
            "\u2705 <b>Pembersihan Massal Berhasil Dieksekusi!</b>",
            "",
            `\u2022 Berkas Terhapus: <b>${succeeded}</b>`,
            `\u2022 Gagal: <b>${failed}</b>`,
            `\u2022 Ruang Dibebaskan: <b>${formatBytes5(freedBytes)}</b>`
          ].join("\n")
        );
        break;
      }
      case "announcement": {
        const { message } = pending.payload;
        await setAnnouncement({
          message,
          type: "info",
          enabled: true,
          updatedAt: Date.now()
        });
        await auditLogRepository.recordAction({
          type: "telegram_announcement_update",
          detail: `Pengumuman publik diperbarui oleh Telegram user ${adminTag}: "${message}"`,
          ip: "telegram-api"
        });
        await sendTelegramMessage(
          chatId,
          `\u2705 <b>Banner Pengumuman Berhasil Disimpan &amp; Diaktifkan!</b>
Pesan kini tampil pada halaman publik AirShare Pro.`
        );
        break;
      }
      default:
        await sendTelegramMessage(chatId, "\u274C Jenis aksi tidak valid.");
        break;
    }
  } catch (err) {
    console.error("[TELEGRAM_CONFIRM_ERROR] Gagal mengeksekusi aksi terkonfirmasi:", err);
    await sendTelegramMessage(
      chatId,
      `\u274C Terjadi kesalahan saat mengeksekusi perintah: ${err instanceof Error ? err.message : "Kesalahan sistem"}`
    );
  }
}

// src/server/api/telegram-webhook-controller.ts
var telegramWebhookController = {
  /**
   * Handles incoming webhook updates from Telegram Bot API.
   * Endpoint: POST /api/telegram/webhook
   */
  async handleWebhook(req, res) {
    const config2 = getTelegramConfig();
    if (!config2.enabled) {
      res.status(200).json({ ok: false, message: "Telegram bot integration is not enabled." });
      return;
    }
    if (config2.webhookSecret) {
      const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
      if (!receivedSecret || receivedSecret !== config2.webhookSecret) {
        console.warn("[TELEGRAM_WEBHOOK_AUTH] Webhook request ditolak: Secret token tidak cocok.");
        res.status(401).json({ error: "Unauthorized webhook secret token" });
        return;
      }
    }
    res.status(200).json({ ok: true });
    try {
      const update = req.body;
      if (!update || typeof update !== "object") return;
      const message = update.message || update.edited_message;
      if (!message || !message.from || !message.chat) return;
      await handleTelegramCommand({
        messageId: message.message_id,
        from: {
          id: message.from.id,
          isBot: Boolean(message.from.is_bot),
          firstName: message.from.first_name,
          username: message.from.username
        },
        chat: {
          id: message.chat.id,
          type: message.chat.type
        },
        text: message.text,
        date: message.date
      });
    } catch (err) {
      console.error("[TELEGRAM_WEBHOOK_ERROR] Kesalahan saat memproses webhook:", err);
    }
  }
};

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
      "img-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
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
  const healthHandler = async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const [redisHealth, catboxHealth] = await Promise.all([
      checkRedisHealth(),
      checkCatboxHealth()
    ]);
    const isDegraded = redisHealth.configured && !redisHealth.connected;
    if (isDegraded) {
      alertRedisFailure("Koneksi ke cluster Redis terputus atau melebihi batas waktu (timeout)").catch(() => {
      });
    }
    res.json({
      status: isDegraded ? "degraded" : "ok",
      service: "AirShare Pro API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      storageProvider: "catbox",
      hasUserhash: Boolean(process.env.CATBOX_USERHASH?.trim()),
      redis: {
        configured: redisHealth.configured,
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs
      },
      catbox: {
        available: catboxHealth.available,
        latencyMs: catboxHealth.latencyMs
      }
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
  app2.get(["/api", "/api/"], (req, res) => {
    res.json({
      success: true,
      service: "AirShare Pro API",
      status: "operational",
      version: "1.0.0",
      endpoints: {
        health: "/api/health",
        systemStatus: "/api/system-status",
        config: "/api/media/config",
        upload: "/api/media/upload",
        media: "/api/media"
      }
    });
  });
  app2.get("/robots.txt", (req, res) => {
    let content = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /s/
Disallow: /admin/

Sitemap: https://airshare-pro.vercel.app/sitemap.xml
`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(content);
  });
  const adminConfig = getAdminConfig();
  if (adminConfig.enabled) {
    const basePath = "/admin";
    app2.get([basePath, `${basePath}/`], (req, res) => {
      res.redirect(`${basePath}/dashboard`);
    });
    app2.get(`${basePath}/login`, (req, res) => {
      return adminController.renderLoginPage(req, res);
    });
    app2.post(`${basePath}/login`, (req, res) => {
      return adminController.handleLogin(req, res);
    });
    app2.all(`${basePath}/logout`, (req, res) => {
      return adminController.handleLogout(req, res);
    });
    app2.get(`${basePath}/dashboard`, requireAdminAuth, (req, res) => {
      return adminController.renderDashboard(req, res);
    });
    app2.get(`${basePath}/api/live-stats`, requireAdminAuth, (req, res) => {
      return adminController.getLiveStats(req, res);
    });
    app2.post(`${basePath}/api/delete-permanent`, requireAdminAuth, (req, res) => {
      return adminController.deletePermanent(req, res);
    });
    app2.post(`${basePath}/api/delete-history-only`, requireAdminAuth, (req, res) => {
      return adminController.deleteHistoryOnly(req, res);
    });
    app2.post(`${basePath}/api/sync-check`, requireAdminAuth, (req, res) => {
      return adminController.runSyncCheck(req, res);
    });
    app2.post(`${basePath}/api/purge-broken`, requireAdminAuth, (req, res) => {
      return adminController.purgeBrokenFiles(req, res);
    });
    app2.post(`${basePath}/api/config`, requireAdminAuth, (req, res) => {
      return adminController.updateConfig(req, res);
    });
    app2.post(`${basePath}/api/maintenance`, requireAdminAuth, (req, res) => {
      return adminController.toggleMaintenance(req, res);
    });
    app2.post(`${basePath}/api/revoke-session`, requireAdminAuth, (req, res) => {
      return adminController.revokeSession(req, res);
    });
    app2.post(`${basePath}/api/revoke-all-sessions`, requireAdminAuth, (req, res) => {
      return adminController.revokeAllSessions(req, res);
    });
    app2.get(`${basePath}/api/search`, requireAdminAuth, (req, res) => {
      return adminController.searchFiles(req, res);
    });
    app2.post(`${basePath}/api/bulk-cleanup/preview`, requireAdminAuth, (req, res) => {
      return adminController.previewBulkCleanup(req, res);
    });
    app2.post(`${basePath}/api/bulk-cleanup`, requireAdminAuth, (req, res) => {
      return adminController.executeBulkCleanup(req, res);
    });
    app2.get(`${basePath}/api/telegram-status`, requireAdminAuth, (req, res) => {
      const config2 = getTelegramConfig();
      res.json({
        success: true,
        data: {
          enabled: config2.enabled,
          adminCount: config2.adminUserIds.length,
          hasSecret: Boolean(config2.webhookSecret)
        }
      });
    });
    app2.get(`${basePath}/api/deleted-files`, requireAdminAuth, (req, res) => {
      return adminController.getDeletedFiles(req, res);
    });
    app2.post(`${basePath}/api/clear-deleted-history`, requireAdminAuth, (req, res) => {
      return adminController.clearDeletedHistory(req, res);
    });
    app2.all(`${basePath}/api/ai-recommendations`, requireAdminAuth, (req, res) => {
      return adminController.getAiRecommendations(req, res);
    });
    app2.all(`${basePath}/*`, requireAdminAuth, (req, res) => {
      res.status(404).send("<!DOCTYPE html><html><body>404 Not Found</body></html>");
    });
  } else {
    app2.all(["/admin", "/admin/*"], (req, res) => {
      res.status(503).send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel \u2014 Konfigurasi Diperlukan</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b101b; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
    .card { background: #131c2e; border: 1px solid #23324d; border-radius: 16px; max-width: 520px; width: 100%; padding: 2.25rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #38bdf8; }
    p { font-size: 0.9rem; line-height: 1.6; color: #94a3b8; margin-bottom: 1.5rem; }
    .code-box { background: #080c14; border: 1px solid #1e293b; border-radius: 10px; padding: 1rem; text-align: left; font-family: monospace; font-size: 0.85rem; color: #e2e8f0; margin-bottom: 1.5rem; line-height: 1.6; }
    .code-box .key { color: #38bdf8; font-weight: 600; }
    .code-box .val { color: #34d399; }
    a { display: inline-block; background: #0284c7; color: #fff; text-decoration: none; padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; }
    a:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Admin Panel Memerlukan Konfigurasi</h1>
    <p>Panel Admin dinonaktifkan secara aman karena kunci rahasia belum disetel di Environment Variables hosting / Vercel Anda. Panel admin selalu diakses di path <code>/admin</code>.</p>
    <div class="code-box">
      <span class="key">ADMIN_SECRET_KEY</span>=<span class="val">kunci-rahasia-minimal-16-karakter</span>
    </div>
    <p style="font-size: 0.8rem; margin-bottom: 1.5rem; color: #64748b;">Tambahkan di Settings &gt; Environment Variables Vercel, lalu redeploy project Anda.</p>
    <a href="/">Kembali ke Halaman Utama</a>
  </div>
</body>
</html>`);
    });
  }
  app2.get(["/api/system-status", "/system-status"], standardRateLimiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const [maintenanceMode, rawAnnouncement, featureFlags] = await Promise.all([
      isMaintenanceModeActive(),
      getAnnouncement(),
      getFeatureFlags()
    ]);
    const activeAnnouncement = rawAnnouncement && rawAnnouncement.enabled ? rawAnnouncement : null;
    res.json({
      success: true,
      data: {
        maintenanceMode,
        announcement: activeAnnouncement,
        featureFlags
      }
    });
  });
  app2.get(["/s", "/s/"], (req, res) => {
    res.redirect("/");
  });
  app2.get("/s/:id", (req, res) => {
    return shareController.renderShareLanding(req, res);
  });
  app2.post("/api/telegram/webhook", (req, res) => {
    return telegramWebhookController.handleWebhook(req, res);
  });
  app2.use("/api/media", router);
  app2.use("/media", router);
  app2.all(["/api", "/api/*", "/media", "/media/*"], (req, res) => {
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
  let queryVPath;
  if (req.query && typeof req.query.__vpath === "string") {
    queryVPath = req.query.__vpath;
  } else if (req.url && req.url.includes("__vpath=")) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      queryVPath = parsedUrl.searchParams.get("__vpath") || void 0;
    } catch {
      const match = req.url.match(/[?&]__vpath=([^&]+)/);
      if (match) {
        queryVPath = decodeURIComponent(match[1]);
      }
    }
  }
  const forwardedUri = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"];
  let targetPath = queryVPath;
  if (!targetPath && forwardedUri) {
    targetPath = forwardedUri;
  }
  if (!targetPath && (!req.url || req.url === "/" || req.url === "/api" || req.url.startsWith("/api?"))) {
    targetPath = "/api";
  }
  if (targetPath) {
    const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
    if (req.query && "__vpath" in req.query) {
      delete req.query.__vpath;
    }
    const currentUrl = req.url || "";
    const queryIdx = currentUrl.indexOf("?");
    if (queryIdx !== -1) {
      try {
        const dummyUrl = new URL(currentUrl, "http://localhost");
        dummyUrl.searchParams.delete("__vpath");
        const remainingQuery = dummyUrl.search;
        req.url = normalizedPath + remainingQuery;
      } catch {
        const qs = currentUrl.slice(queryIdx);
        const cleanQs = qs.replace(/[?&]__vpath=[^&]*/g, "").replace(/^[?&]+/, "?");
        req.url = normalizedPath + (cleanQs !== "?" ? cleanQs : "");
      }
    } else {
      req.url = normalizedPath;
    }
  }
  return app_default(req, res);
}
export {
  config,
  handler as default
};
//# sourceMappingURL=index.js.map
