import { MediaType } from '../../types';
import { BANNED_EXTENSIONS } from '../../shared/banned-extensions';

export { BANNED_EXTENSIONS };

export interface ValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  sanitizedFilename?: string;
  detectedMediaType?: MediaType;
}

/**
 * Sanitizes untrusted filenames to prevent directory traversal, control characters,
 * and dangerous shell characters.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return `media_${Date.now()}`;
  }

  // Strip null bytes and control chars
  let clean = rawName.replace(/[\x00-\x1F\x7F]/g, '');

  // Strip path traversal prefixes (UNIX & Windows)
  clean = clean.replace(/^.*[\\/]/, '');

  // Keep only safe alphanumeric, periods, dashes, underscores, spaces, brackets
  clean = clean.replace(/[^a-zA-Z0-9._\- ()[\]]/g, '_');

  // Collapse consecutive periods to avoid hidden extension exploits (e.g. file...jpg)
  clean = clean.replace(/\.{2,}/g, '.');

  // Limit filename length to 200 characters while preserving extension
  if (clean.length > 200) {
    const parts = clean.split('.');
    const ext = parts.length > 1 ? `.${parts.pop()}` : '';
    const base = parts.join('.').slice(0, 200 - ext.length);
    clean = `${base}${ext}`;
  }

  return clean.trim() || `media_${Date.now()}`;
}

/**
 * Verifies file signature / magic bytes for common media formats.
 * Prevents disguised executable binaries disguised with media extensions.
 */
export function verifyMediaMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  const headerHex = buffer.subarray(0, 12).toString('hex').toLowerCase();
  const mime = mimeType.toLowerCase();

  // Executable / Binary headers to block unconditionally
  if (headerHex.startsWith('4d5a')) return false; // DOS/PE EXE 'MZ'
  if (headerHex.startsWith('7f454c46')) return false; // ELF Linux Binary
  if (headerHex.startsWith('504b0304') && (mime.includes('image') || mime.includes('audio'))) {
    // ZIP header (often APK/JAR) masquerading as simple media
    return false;
  }

  // JPEG / JPG (FF D8 FF)
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    return headerHex.startsWith('ffd8ff');
  }

  // PNG (89 50 4E 47 0D 0A 1A 0A)
  if (mime.includes('png')) {
    return headerHex.startsWith('89504e470d0a1a0a');
  }

  // GIF (GIF87a or GIF89a -> 47 49 46 38)
  if (mime.includes('gif')) {
    return headerHex.startsWith('47494638');
  }

  // WebP (RIFF .... WEBP -> 52 49 46 46 ... 57 45 42 50)
  if (mime.includes('webp')) {
    return (
      headerHex.startsWith('52494646') &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  // MP4 / M4A / MOV (ftyp box at byte 4: 66 74 79 70)
  if (mime.includes('mp4') || mime.includes('quicktime') || mime.includes('m4a')) {
    return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }

  // Matroska / WebM (1A 45 DF A3)
  if (mime.includes('webm') || mime.includes('matroska') || mime.includes('mkv')) {
    return headerHex.startsWith('1a45dfa3');
  }

  // MP3 (49 44 33 -> 'ID3') or raw MP3 frame sync (FF FB / FF F3 / FF F2)
  if (mime.includes('mp3') || mime.includes('mpeg')) {
    return (
      headerHex.startsWith('494433') ||
      headerHex.startsWith('fffb') ||
      headerHex.startsWith('fff3') ||
      headerHex.startsWith('fff2')
    );
  }

  // OGG (4F 67 67 53 -> 'OggS')
  if (mime.includes('ogg')) {
    return headerHex.startsWith('4f676753') || headerHex.startsWith('4f676773');
  }

  // FLAC (66 4C 61 43 -> 'fLaC')
  if (mime.includes('flac')) {
    return headerHex.startsWith('664c6143');
  }

  // WAV (52 49 46 46 .... 57 41 56 45 -> 'RIFF'...'WAVE')
  if (mime.includes('wav')) {
    return (
      headerHex.startsWith('52494646') &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE'
    );
  }

  // BMP (42 4D -> 'BM')
  if (mime.includes('bmp')) {
    return headerHex.startsWith('424d');
  }

  // SVG (XML text format <svg or <?xml)
  if (mime.includes('svg')) {
    const textStart = buffer.subarray(0, 256).toString('utf8').trim().toLowerCase();
    return textStart.includes('<svg') || textStart.includes('<?xml');
  }

  // General check: if it looks like any known valid media header
  const isKnownMedia =
    headerHex.startsWith('ffd8ff') ||
    headerHex.startsWith('89504e47') ||
    headerHex.startsWith('47494638') ||
    headerHex.startsWith('52494646') ||
    headerHex.startsWith('1a45dfa3') ||
    headerHex.startsWith('494433') ||
    headerHex.startsWith('664c6143') ||
    headerHex.startsWith('4f676753') ||
    headerHex.startsWith('4f676773') ||
    (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp');

  return isKnownMedia;
}

/**
 * Validates uploaded media file integrity and security constraints.
 */
export function validateUploadedFile(
  file: Express.Multer.File | undefined,
  maxSizeBytes: number
): ValidationResult {
  if (!file) {
    return {
      valid: false,
      errorCode: 'NO_FILE',
      errorMessage: 'Tidak ada berkas yang diunggah.',
    };
  }

  const originalName = file.originalname || 'unnamed-file';
  const sanitizedName = sanitizeFilename(originalName);
  const ext = sanitizedName.split('.').pop()?.toLowerCase() || '';

  // Check banned extensions
  if (BANNED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      errorCode: 'FORBIDDEN_EXTENSION',
      errorMessage: `Ekstensi berkas .${ext} dilarang demi keamanan sistem.`,
    };
  }

  // Check file size
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: `Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal (${(maxSizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      errorCode: 'INVALID_FILE',
      errorMessage: 'Berkas kosong (0 bytes).',
    };
  }

  // Check MIME type
  const mimeType = (file.mimetype || '').toLowerCase();
  let mediaType: MediaType | null = null;
  if (mimeType.startsWith('image/')) mediaType = 'image';
  else if (mimeType.startsWith('video/')) mediaType = 'video';
  else if (mimeType.startsWith('audio/')) mediaType = 'audio';

  if (!mediaType) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_MEDIA_TYPE',
      errorMessage: 'Hanya format Foto (image/*), Video (video/*), dan Audio (audio/*) yang didukung.',
    };
  }

  // Verify magic bytes
  if (file.buffer && !verifyMediaMagicBytes(file.buffer, mimeType)) {
    return {
      valid: false,
      errorCode: 'CORRUPTED_OR_INVALID_MEDIA',
      errorMessage: 'Format biner berkas tidak cocok dengan tipe media yang ditentukan.',
    };
  }

  return {
    valid: true,
    sanitizedFilename: sanitizedName,
    detectedMediaType: mediaType,
  };
}

/**
 * Validates alphanumeric ID for media retrieval/deletion to avoid traversal or SQL/NoSQL injection.
 */
export function isValidMediaId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Allow safe characters: alphanumeric, dash, underscore, dot (e.g. "abc123xyz", "photo-12.jpg")
  return /^[a-zA-Z0-9._\-]{1,100}$/.test(id);
}
