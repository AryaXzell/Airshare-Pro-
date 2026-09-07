import { MediaType } from '../../types';
import { BANNED_EXTENSIONS } from '../../shared/banned-extensions';

export { BANNED_EXTENSIONS };

export const ALLOWED_FILE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/rtf',
  'application/xml',
  'text/plain',
  'text/html',
  'text/css',
  'text/csv',
  'text/markdown',
  'text/x-markdown',
  'text/xml',
  'text/x-yaml',
  'text/yaml',
  'application/json',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
]);

/**
 * Checks whether a MIME type is in the allowed generic file whitelist
 * (including modern Microsoft Office OpenXML formats and text types).
 */
export function isAllowedGenericFileMime(mime: string): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  if (ALLOWED_FILE_MIME_TYPES.has(lower)) return true;
  if (lower.startsWith('text/')) return true;
  if (lower.startsWith('application/vnd.openxmlformats-officedocument.')) return true;
  return false;
}

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

  // ZIP archives and modern Office OpenXML documents (.docx, .xlsx, .pptx)
  if (mime.includes('zip') || mime.includes('openxmlformats')) {
    return headerHex.startsWith('504b0304') || headerHex.startsWith('504b0506');
  }

  // RAR archives (52 61 72 21 1A 07 -> 'Rar!\x1a\x07')
  if (mime.includes('rar')) {
    return headerHex.startsWith('526172211a07');
  }

  // 7Z archives (37 7A BC AF 27 1C)
  if (mime.includes('7z')) {
    return headerHex.startsWith('377abcaf271c');
  }

  // GZIP archives (1F 8B)
  if (mime.includes('gzip') || mime.includes('tar+gzip')) {
    return headerHex.startsWith('1f8b');
  }

  // PDF documents (25 50 44 46 -> '%PDF')
  if (mime.includes('pdf')) {
    return headerHex.startsWith('25504446');
  }

  // MS Word legacy (.doc) (D0 CF 11 E0 A1 B1 1A E1 -> OLE Compound File)
  if (mime.includes('msword')) {
    return headerHex.startsWith('d0cf11e0a1b11ae1');
  }

  // TAR archives (application/x-tar)
  if (mime.includes('tar')) {
    // Check standard POSIX 'ustar' indicator at offset 257 (0x101)
    if (buffer.length >= 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar') {
      return true;
    }
    // Accept valid 512-byte tar header blocks
    return buffer.length >= 512;
  }

  // Text & data formats (text/plain, text/html, text/css, text/csv, application/json, xml, yaml, etc.)
  if (
    mime.includes('text') ||
    mime.includes('csv') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('yaml') ||
    mime.includes('toml') ||
    mime.includes('sql')
  ) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      // Allow tab(9), newline(10), carriage return(13), and printable characters (32+)
      if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
        return false;
      }
    }
    if (mime.includes('json')) {
      const text = sample.toString('utf8').trim();
      return text.startsWith('{') || text.startsWith('[');
    }
    return true;
  }

  // General check: if it looks like any known valid media or file header
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
    headerHex.startsWith('504b0304') ||
    headerHex.startsWith('504b0506') ||
    headerHex.startsWith('526172211a07') ||
    headerHex.startsWith('377abcaf271c') ||
    headerHex.startsWith('1f8b') ||
    headerHex.startsWith('25504446') ||
    headerHex.startsWith('d0cf11e0a1b11ae1') ||
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

  // Check MIME type and extension
  const mimeType = (file.mimetype || '').toLowerCase();
  let mediaType: MediaType | null = null;
  if (mimeType.startsWith('image/')) mediaType = 'image';
  else if (mimeType.startsWith('video/')) mediaType = 'video';
  else if (mimeType.startsWith('audio/')) mediaType = 'audio';
  else if (isAllowedGenericFileMime(mimeType)) mediaType = 'file';
  else {
    const archiveAndDocExts = new Set([
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'csv', 'txt', 'json', 'xml', 'md', 'rtf', 'log', 'html', 'htm', 'css', 'scss', 'sass', 'less',
      'yaml', 'yml', 'toml', 'sql'
    ]);
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic']);
    const videoExts = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
    const audioExts = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus']);

    if (imageExts.has(ext)) mediaType = 'image';
    else if (videoExts.has(ext)) mediaType = 'video';
    else if (audioExts.has(ext)) mediaType = 'audio';
    else if (archiveAndDocExts.has(ext)) mediaType = 'file';
  }

  if (!mediaType) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_MEDIA_TYPE',
      errorMessage: 'Tipe berkas tidak didukung. Unggah foto, video, audio, atau dokumen/arsip yang diizinkan.',
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
