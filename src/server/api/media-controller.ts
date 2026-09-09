import { Request, Response } from 'express';
import { CatboxStorageProvider } from '../storage/catbox-storage-provider';
import { getMediaRepository } from '../repository/media-repository';
import { analyticsRepository } from '../repository/analytics-repository';
import {
  validateUploadedFile,
  isValidMediaId,
} from '../security/input-validator';
import {
  isMaintenanceModeActive,
  getMaxUploadSize,
  getUploadRateLimit,
} from '../security/system-config';
import { getClientIp } from '../security/client-ip';
import { lookupCountryFromIp, resolveCountryFromRequest } from '../security/geo-lookup';
import { isTextPreviewableFile, getTextLanguageHint } from '../../shared/text-language-map';
import { recordUploadAndCheckSpike } from '../telegram/telegram-notifier';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  AudioMetadata,
  ImageMetadata,
  MediaObject,
  VideoMetadata,
} from '../../types';

const storageProvider = new CatboxStorageProvider();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const mediaController = {
  /**
   * GET /api/media/config
   * Provides non-sensitive upload configuration to client
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    const currentMaxSize = await getMaxUploadSize();
    const currentRateLimit = await getUploadRateLimit();

    const response: ApiSuccessResponse<{
      maxUploadSize: number;
      formattedMaxSize: string;
      provider: string;
      isDeleteSupported: boolean;
      rateLimitUploadsPerMinute: number;
    }> = {
      success: true,
      data: {
        maxUploadSize: currentMaxSize,
        formattedMaxSize: formatBytes(currentMaxSize),
        provider: storageProvider.name,
        isDeleteSupported: storageProvider.isDeleteSupported(),
        rateLimitUploadsPerMinute: currentRateLimit.limit,
      },
    };
    res.json(response);
  },

  /**
   * POST /api/media/upload
   * Receives uploaded file stream, validates strictly, uploads to Catbox, and persists metadata.
   */
  async uploadMedia(req: Request, res: Response): Promise<void> {
    // Check Kill Switch / Maintenance Mode FIRST
    if (await isMaintenanceModeActive()) {
      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: 'MAINTENANCE_MODE',
          message: 'Layanan sedang dalam pemeliharaan. Silakan coba beberapa saat lagi.',
        },
      };
      res.status(503).json(err);
      return;
    }

    const mediaRepository = getMediaRepository();
    try {
      const file = req.file;
      const currentMaxSize = await getMaxUploadSize();

      // Authoritative server-side file and payload validation
      const validation = validateUploadedFile(file, currentMaxSize);
      if (!validation.valid || !file || !validation.sanitizedFilename || !validation.detectedMediaType) {
        const status = validation.errorCode === 'FILE_TOO_LARGE' ? 413 : 400;
        const err: ApiErrorResponse = {
          success: false,
          error: {
            code: validation.errorCode || 'INVALID_REQUEST',
            message: validation.errorMessage || 'Berkas tidak valid.',
          },
        };
        res.status(status).json(err);
        return;
      }

      const originalName = file.originalname || 'unknown-file';
      const sanitizedName = validation.sanitizedFilename;
      const mediaType = validation.detectedMediaType;
      const mimeType = file.mimetype || 'application/octet-stream';
      const sessionId = req.sessionId;

      // Optional client metadata parsing with safe field picking
      let imageMeta: ImageMetadata | undefined;
      let videoMeta: VideoMetadata | undefined;
      let audioMeta: AudioMetadata | undefined;

      if (req.body && req.body.metadata) {
        try {
          const parsed = typeof req.body.metadata === 'string'
            ? JSON.parse(req.body.metadata)
            : req.body.metadata;

          if (parsed && typeof parsed === 'object') {
            if (mediaType === 'image' && parsed.imageMeta) {
              imageMeta = {
                width: typeof parsed.imageMeta.width === 'number' ? parsed.imageMeta.width : undefined,
                height: typeof parsed.imageMeta.height === 'number' ? parsed.imageMeta.height : undefined,
              };
            }
            if (mediaType === 'video' && parsed.videoMeta) {
              videoMeta = {
                duration: typeof parsed.videoMeta.duration === 'number' ? parsed.videoMeta.duration : undefined,
                width: typeof parsed.videoMeta.width === 'number' ? parsed.videoMeta.width : undefined,
                height: typeof parsed.videoMeta.height === 'number' ? parsed.videoMeta.height : undefined,
              };
            }
            if (mediaType === 'audio' && parsed.audioMeta) {
              audioMeta = {
                title: typeof parsed.audioMeta.title === 'string' ? parsed.audioMeta.title.slice(0, 150) : undefined,
                artist: typeof parsed.audioMeta.artist === 'string' ? parsed.audioMeta.artist.slice(0, 150) : undefined,
                album: typeof parsed.audioMeta.album === 'string' ? parsed.audioMeta.album.slice(0, 150) : undefined,
                duration: typeof parsed.audioMeta.duration === 'number' ? parsed.audioMeta.duration : undefined,
                coverWidth: typeof parsed.audioMeta.coverWidth === 'number' && parsed.audioMeta.coverWidth > 0 ? parsed.audioMeta.coverWidth : undefined,
                coverHeight: typeof parsed.audioMeta.coverHeight === 'number' && parsed.audioMeta.coverHeight > 0 ? parsed.audioMeta.coverHeight : undefined,
                coverUrl: undefined, // Handled specifically below to prevent base64 truncation
              };

              // Decode and upload embedded ID3 cover art safely as separate file if provided
              const rawCover = parsed.audioMeta.coverUrl;
              if (typeof rawCover === 'string' && rawCover.startsWith('data:image/')) {
                try {
                  const match = rawCover.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                  if (match) {
                    const coverMime = match[1];
                    const base64Data = match[2];
                    const coverBuffer = Buffer.from(base64Data, 'base64');
                    // Check reasonable size constraint (<= 2MB)
                    if (coverBuffer.length > 0 && coverBuffer.length <= 2 * 1024 * 1024) {
                      const baseName = sanitizedName.replace(/\.[^.]+$/, '');
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
                  console.warn('Failed to upload audio cover art to storage provider:', coverErr);
                }
              } else if (typeof rawCover === 'string' && (rawCover.startsWith('http://') || rawCover.startsWith('https://'))) {
                audioMeta.coverUrl = rawCover;
              }
            }
          }
        } catch {
          // Ignore parse errors on auxiliary client metadata
        }
      }

      // Resolve client country anonymously via IP geolocation & proxy headers (fail-open)
      const clientIp = getClientIp(req);
      const geo = await resolveCountryFromRequest(req, clientIp);

      // Real upload to Catbox Storage Provider
      const uploadResult = await storageProvider.upload(
        file.buffer,
        sanitizedName,
        mimeType
      );

      // Determine if file is eligible for inline text/code syntax preview
      const isText = mediaType === 'file' && isTextPreviewableFile(sanitizedName, mimeType, file.size);
      const textLanguageHint = isText ? getTextLanguageHint(sanitizedName) : undefined;

      // Construct normalized MediaObject with anonymous session scoping
      const mediaObject: MediaObject = {
        id: uploadResult.id,
        name: sanitizedName,
        originalFileName: originalName.slice(0, 200),
        size: file.size,
        formattedSize: formatBytes(file.size),
        type: mediaType,
        mimeType,
        shareUrl: uploadResult.url,
        provider: 'catbox',
        createdAt: Date.now(),
        sessionId,
        uploaderCountryCode: geo?.countryCode,
        uploaderCountryName: geo?.countryName,
        imageMeta: mediaType === 'image' ? imageMeta : undefined,
        videoMeta: mediaType === 'video' ? videoMeta : undefined,
        audioMeta: mediaType === 'audio' ? audioMeta : undefined,
        isTextPreviewable: isText,
        textLanguageHint,
      };

      // Persist metadata into repository
      await mediaRepository.create(mediaObject);

      // Record upload analytics fail-safely in background
      analyticsRepository.recordUpload(mediaObject).catch((statErr) => {
        console.warn('[ANALYTICS_WARN] Gagal mencatat upload analitik:', statErr);
      });

      // Track session uploads and alert on traffic spike (>15 uploads in 5 mins)
      recordUploadAndCheckSpike(sessionId).catch((spikeErr) => {
        console.warn('[SPIKE_ALERT_WARN] Gagal mengecek lonjakan sesi:', spikeErr);
      });

      const response: ApiSuccessResponse<MediaObject> = {
        success: true,
        data: mediaObject,
      };

      res.status(201).json(response);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gagal mengunggah berkas ke provider.';
      
      const isTimeout = message.toLowerCase().includes('timeout') || message.toLowerCase().includes('waktu');
      const errorCode = isTimeout ? 'UPLOAD_TIMEOUT' : 'PROVIDER_ERROR';

      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: errorCode,
          message,
        },
      };
      res.status(isTimeout ? 504 : 502).json(err);
    }
  },

  /**
   * GET /api/media
   * Retrieves list of stored media items scoped to current caller session
   */
  async listMedia(req: Request, res: Response): Promise<void> {
    const mediaRepository = getMediaRepository();
    try {
      const rawLimit = parseInt(req.query.limit as string, 10);
      const limit = isNaN(rawLimit) ? 100 : Math.min(Math.max(1, rawLimit), 200);

      const items = await mediaRepository.list(req.sessionId, limit);
      const response: ApiSuccessResponse<MediaObject[]> = {
        success: true,
        data: items,
      };
      res.json(response);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gagal memuat daftar media.';
      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: 'REPOSITORY_ERROR',
          message,
        },
      };
      res.status(500).json(err);
    }
  },

  /**
   * GET /api/media/:id
   * Retrieves single media item by ID, scoped to caller session
   */
  async getMedia(req: Request, res: Response): Promise<void> {
    const mediaRepository = getMediaRepository();
    try {
      const { id } = req.params;
      if (!isValidMediaId(id)) {
        const err: ApiErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Format ID media tidak valid.',
          },
        };
        res.status(400).json(err);
        return;
      }

      const item = await mediaRepository.get(id, req.sessionId);
      if (!item) {
        const err: ApiErrorResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Berkas media tidak ditemukan di repositori.',
          },
        };
        res.status(404).json(err);
        return;
      }

      const response: ApiSuccessResponse<MediaObject> = {
        success: true,
        data: item,
      };
      res.json(response);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gagal mengambil data media.';
      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message,
        },
      };
      res.status(500).json(err);
    }
  },

  /**
   * DELETE /api/media/:id
   * Deletes item from repository (session-scoped) and requests Catbox deletion if userhash is configured
   */
  async deleteMedia(req: Request, res: Response): Promise<void> {
    const mediaRepository = getMediaRepository();
    try {
      const { id } = req.params;
      if (!isValidMediaId(id)) {
        const err: ApiErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Format ID media tidak valid.',
          },
        };
        res.status(400).json(err);
        return;
      }

      const item = await mediaRepository.get(id, req.sessionId);

      if (!item) {
        const err: ApiErrorResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Berkas media tidak ditemukan di repositori.',
          },
        };
        res.status(404).json(err);
        return;
      }

      // Delete from repository
      await mediaRepository.delete(id, req.sessionId);

      // Record analytics deletion fail-safe
      analyticsRepository.recordDeletion(1).catch((err) => {
        console.warn('[ANALYTICS_RECORD_DELETION_WARN] Gagal memperbarui analitik deletion:', err);
      });

      // Purge from recent uploads in analytics
      analyticsRepository.removeRecentUpload(id).catch((err) => {
        console.warn('[ANALYTICS_REMOVE_RECENT_WARN] Gagal menghapus recent upload:', err);
      });

      // Attempt deletion on storage provider if URL is known
      let providerResult: {
        success: boolean;
        supported: boolean;
        message?: string;
      } = {
        success: false,
        supported: false,
      };

      if (item.shareUrl) {
        providerResult = await storageProvider.delete(item.shareUrl);
      }

      const response: ApiSuccessResponse<{
        deletedId: string;
        providerResult: typeof providerResult;
      }> = {
        success: true,
        data: {
          deletedId: id,
          providerResult,
        },
      };
      res.json(response);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gagal menghapus berkas.';
      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message,
        },
      };
      res.status(500).json(err);
    }
  },

  /**
   * DELETE /api/media
   * Clears repository history for current session
   */
  async clearAllMedia(req: Request, res: Response): Promise<void> {
    const mediaRepository = getMediaRepository();
    try {
      const existingItems = await mediaRepository.list(req.sessionId);
      const count = existingItems.length;

      await mediaRepository.clearAll(req.sessionId);

      if (count > 0) {
        analyticsRepository.recordDeletion(count).catch((err) => {
          console.warn('[ANALYTICS_RECORD_DELETION_WARN] Gagal memperbarui analitik clearAll:', err);
        });
        existingItems.forEach((item) => {
          analyticsRepository.removeRecentUpload(item.id).catch(() => {});
        });
      }

      const response: ApiSuccessResponse<{ cleared: boolean }> = {
        success: true,
        data: { cleared: true },
      };
      res.json(response);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gagal membersihkan riwayat.';
      const err: ApiErrorResponse = {
        success: false,
        error: {
          code: 'CLEAR_ERROR',
          message,
        },
      };
      res.status(500).json(err);
    }
  },
};
