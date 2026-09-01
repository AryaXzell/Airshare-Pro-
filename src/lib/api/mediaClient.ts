import {
  ApiResponse,
  AudioMetadata,
  ImageMetadata,
  MediaObject,
  UploadProgressUpdate,
  VideoMetadata,
} from '../../types';
import { formatBytes } from '../utils';
import { UPLOAD_CANCELLED_MESSAGE } from '../constants';

export interface UploadMetadataPayload {
  imageMeta?: ImageMetadata;
  videoMeta?: VideoMetadata;
  audioMeta?: AudioMetadata;
}

export class MediaApiClient {
  private baseUrl = '/api/media';

  /**
   * Uploads file to AirShare API with real-time XHR upload progress
   */
  public uploadFile(
    file: File,
    metadata?: UploadMetadataPayload,
    onProgress?: (update: UploadProgressUpdate) => void,
    signal?: AbortSignal
  ): Promise<MediaObject> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error(UPLOAD_CANCELLED_MESSAGE));
        });
      }

      // Track progress with throttling to protect UI thread on low-end devices
      let lastProgressDispatch = 0;

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;

        const now = Date.now();
        const timeDiffSec = (now - lastTime) / 1000;
        const totalDurationSec = (now - startTime) / 1000;

        let speedBytesPerSec = 0;
        if (timeDiffSec > 0.1) {
          speedBytesPerSec = (e.loaded - lastLoaded) / timeDiffSec;
          lastLoaded = e.loaded;
          lastTime = now;
        } else if (totalDurationSec > 0) {
          speedBytesPerSec = e.loaded / totalDurationSec;
        }

        const percentage = Math.min(
          99,
          Math.max(1, Math.round((e.loaded / e.total) * 100))
        );
        const remainingBytes = Math.max(0, e.total - e.loaded);
        const etaSeconds =
          speedBytesPerSec > 0 ? Math.ceil(remainingBytes / speedBytesPerSec) : 0;

        // Throttle React state dispatch to ~80ms (12fps) unless reaching 99%
        if (onProgress && (now - lastProgressDispatch > 80 || percentage === 99)) {
          lastProgressDispatch = now;
          onProgress({
            stage: percentage < 99 ? 'uploading' : 'processing',
            loaded: e.loaded,
            total: e.total,
            percentage,
            speedBytesPerSec,
            speedFormatted: `${formatBytes(speedBytesPerSec)}/s`,
            etaSeconds,
            statusMessage:
              percentage < 99
                ? 'Mengirim berkas ke server...'
                : 'Catbox sedang memproses & menerbitkan link...',
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as ApiResponse<MediaObject>;
            if (response.success === true) {
              if (onProgress) {
                onProgress({
                  stage: 'completed',
                  loaded: file.size,
                  total: file.size,
                  percentage: 100,
                  speedBytesPerSec: 0,
                  speedFormatted: '0 B/s',
                  etaSeconds: 0,
                  statusMessage: 'Unggahan berhasil diselesaikan!',
                });
              }
              resolve(response.data);
              return;
            }
            if ('error' in response) {
              reject(new Error(response.error.message || 'Gagal mengunggah'));
              return;
            }
            reject(new Error('Gagal mengunggah berkas'));
          } catch {
            reject(new Error('Respon server tidak valid'));
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText) as { success?: boolean; error?: { message?: string } };
            if (errRes.error?.message) {
              reject(new Error(errRes.error.message));
              return;
            }
          } catch {
            // Fallback status text
          }
          reject(new Error(`Server error: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            'Gagal terhubung ke server. Periksa koneksi internet Anda.'
          )
        );
      };

      xhr.ontimeout = () => {
        reject(new Error('Koneksi unggahan melebihi batas waktu (timeout).'));
      };

      // Construct multipart form data
      const formData = new FormData();
      formData.append('file', file, file.name);

      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      xhr.open('POST', `${this.baseUrl}/upload`, true);
      xhr.timeout = 180000; // 3 minutes timeout for large files
      xhr.send(formData);
    });
  }

  /**
   * Fetches list of stored media items
   */
  public async fetchList(): Promise<MediaObject[]> {
    const res = await fetch(this.baseUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal memuat riwayat media`);
    }

    const json = (await res.json()) as ApiResponse<MediaObject[]>;
    if (json.success === true) {
      return json.data;
    }
    if ('error' in json) {
      throw new Error(json.error.message);
    }
    throw new Error('Gagal memuat media');
  }

  /**
   * Deletes a media item by ID
   */
  public async deleteMedia(
    id: string
  ): Promise<{ deletedId: string; providerResult?: { message?: string } }> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal menghapus media`);
    }

    const json = (await res.json()) as ApiResponse<{
      deletedId: string;
      providerResult?: { message?: string };
    }>;
    if (json.success === true) {
      return json.data;
    }
    if ('error' in json) {
      throw new Error(json.error.message);
    }
    throw new Error('Gagal menghapus media');
  }

  /**
   * Clears all media items
   */
  public async clearAll(): Promise<void> {
    const res = await fetch(this.baseUrl, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal membersihkan riwayat`);
    }
  }

  /**
   * Fetches public server configuration
   */
  public async fetchConfig(): Promise<{
    maxUploadSize: number;
    formattedMaxSize: string;
    provider: string;
    isDeleteSupported: boolean;
  }> {
    const res = await fetch(`${this.baseUrl}/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return {
        maxUploadSize: 209715200,
        formattedMaxSize: '200 MB',
        provider: 'catbox',
        isDeleteSupported: false,
      };
    }

    const json = await res.json();
    if (json.success && json.data) {
      return json.data;
    }

    return {
      maxUploadSize: 209715200,
      formattedMaxSize: '200 MB',
      provider: 'catbox',
      isDeleteSupported: false,
    };
  }
}

export const mediaApiClient = new MediaApiClient();
