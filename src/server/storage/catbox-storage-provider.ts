import { StorageDeleteResult, StorageProvider, StorageUploadResult } from '../../types';

export interface CatboxProviderOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export class CatboxStorageProvider implements StorageProvider {
  public readonly name = 'catbox';
  private readonly apiUrl = 'https://catbox.moe/user/api.php';
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options?: CatboxProviderOptions) {
    this.timeoutMs = options?.timeoutMs || parseInt(process.env.CATBOX_TIMEOUT_MS || '60000', 10);
    this.maxRetries = options?.maxRetries ?? 2;
  }

  /**
   * Reads userhash securely only on the server runtime.
   * If not set or empty, uploads proceed anonymously to Catbox.
   */
  private getUserhash(): string | undefined {
    const hash = process.env.CATBOX_USERHASH?.trim();
    return hash && hash.length > 0 ? hash : undefined;
  }

  /**
   * Catbox API requires userhash to delete files.
   */
  public isDeleteSupported(): boolean {
    return Boolean(this.getUserhash());
  }

  /**
   * Sanitizes error messages to guarantee no Catbox credentials leak.
   */
  private sanitizeError(err: unknown, userhash?: string): Error {
    let raw = err instanceof Error ? err.message : 'Kesalahan jaringan atau server eksternal';
    if (userhash && userhash.length > 0) {
      raw = raw.split(userhash).join('***');
    }
    return new Error(raw);
  }

  /**
   * Single attempt to upload file buffer to Catbox with timeout signal.
   */
  private async executeUploadAttempt(
    fileBlob: Blob,
    filename: string,
    userhash?: string
  ): Promise<string> {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');

    if (userhash) {
      formData.append('userhash', userhash);
    }

    formData.append('fileToUpload', fileBlob, filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'User-Agent': 'AirSharePro-Security/2.1 (MediaSharingHub)',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Distinguish non-retryable 4xx errors vs retryable 5xx errors
        const isTransient = response.status >= 500 && response.status < 600;
        const err = new Error(`Catbox HTTP ${response.status}: ${response.statusText}`);
        (err as unknown as { isTransient: boolean }).isTransient = isTransient;
        throw err;
      }

      const rawResult = await response.text();
      const trimmedResult = rawResult.trim();

      // Catbox returns URL on success (e.g. "https://files.catbox.moe/abc123.mp4")
      if (
        !trimmedResult.startsWith('http://') &&
        !trimmedResult.startsWith('https://')
      ) {
        // Catbox returned an error string like "File is too large" or "Invalid userhash"
        const err = new Error(`Catbox provider: ${trimmedResult}`);
        (err as unknown as { isTransient: boolean }).isTransient = false;
        throw err;
      }

      // Security check: Validate returned URL domain
      try {
        const parsedUrl = new URL(trimmedResult);
        if (!parsedUrl.hostname.endsWith('catbox.moe')) {
          throw new Error('URL yang diterima dari provider tidak valid.');
        }
      } catch {
        throw new Error('URL respon provider tidak valid.');
      }

      return trimmedResult;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        const timeoutErr = new Error(`Unggahan ke Catbox melebihi batas waktu (${this.timeoutMs / 1000}s).`);
        (timeoutErr as unknown as { isTransient: boolean }).isTransient = true;
        throw timeoutErr;
      }
      throw err;
    }
  }

  /**
   * Uploads a file buffer to Catbox with exponential backoff for transient errors.
   */
  public async upload(
    fileBuffer: Buffer | Uint8Array | Blob,
    filename: string,
    mimeType: string
  ): Promise<StorageUploadResult> {
    const userhash = this.getUserhash();

    // Convert Buffer/Uint8Array to standard Blob
    let fileBlob: Blob;
    if (fileBuffer instanceof Blob) {
      fileBlob = fileBuffer;
    } else {
      const uint8 = new Uint8Array(
        fileBuffer.buffer,
        fileBuffer.byteOffset,
        fileBuffer.byteLength
      );
      fileBlob = new Blob([uint8], { type: mimeType || 'application/octet-stream' });
    }

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const fileUrl = await this.executeUploadAttempt(fileBlob, filename, userhash);

        // Generate stable ID from Catbox URL path
        const urlParts = fileUrl.split('/');
        const generatedId = urlParts[urlParts.length - 1] || `${Date.now()}`;

        return {
          id: generatedId,
          url: fileUrl,
          provider: this.name,
          filename,
          size: fileBlob.size,
          mimeType,
        };
      } catch (err: unknown) {
        lastError = err;
        const isTransient = (err as { isTransient?: boolean })?.isTransient ?? false;

        // Do not retry non-transient errors (e.g. invalid file, 4xx, file too large)
        if (!isTransient || attempt > this.maxRetries) {
          break;
        }

        // Exponential backoff: 500ms, 1500ms...
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw this.sanitizeError(lastError, userhash);
  }

  /**
   * Deletes a file on Catbox using the official API (reqtype=deletefiles).
   */
  public async delete(idOrUrl: string): Promise<StorageDeleteResult> {
    const userhash = this.getUserhash();

    if (!userhash) {
      return {
        success: false,
        supported: false,
        message:
          'Penghapusan dari server Catbox membutuhkan CATBOX_USERHASH. Berkas dihapus dari riwayat pada sesi Anda, namun berkas aslinya tetap ada di Catbox.',
      };
    }

    // Extract filename from URL or ID
    const filename = idOrUrl.includes('/')
      ? idOrUrl.split('/').pop() || idOrUrl
      : idOrUrl;

    const formData = new FormData();
    formData.append('reqtype', 'deletefiles');
    formData.append('userhash', userhash);
    formData.append('files', filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 15000));

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'User-Agent': 'AirSharePro-Security/2.1 (MediaSharingHub)',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          supported: true,
          message: `Gagal menghubungi Catbox: HTTP ${response.status}`,
        };
      }

      const resultText = (await response.text()).trim();

      if (resultText.toLowerCase().includes('success') || resultText.length === 0) {
        return {
          success: true,
          supported: true,
          message: 'Berkas berhasil dihapus dari Catbox.',
        };
      }

      return {
        success: false,
        supported: true,
        message: `Catbox delete: ${resultText}`,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          supported: true,
          message: 'Penghapusan berkas di Catbox melebihi batas waktu (15s).',
        };
      }
      const sanitized = this.sanitizeError(err, userhash);
      return {
        success: false,
        supported: true,
        message: sanitized.message,
      };
    }
  }
}
