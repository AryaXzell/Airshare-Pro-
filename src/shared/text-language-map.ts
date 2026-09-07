/**
 * Centralized mapping and detection for text and code previewable files.
 * Provides syntax highlighting language hints for highlight.js and display labels.
 */

export const MAX_TEXT_PREVIEW_BYTES = 500 * 1024; // 500 KB limit for inline text rendering

export interface TextLanguageInfo {
  /** Language identifier accepted by highlight.js (e.g. 'html', 'javascript', 'json', 'plaintext') */
  language: string;
  /** Human-readable badge label (e.g. 'HTML', 'TypeScript', 'Markdown') */
  label: string;
}

export const EXTENSION_LANGUAGE_MAP: Record<string, TextLanguageInfo> = {
  // Web
  html: { language: 'html', label: 'HTML' },
  htm: { language: 'html', label: 'HTML' },
  css: { language: 'css', label: 'CSS' },
  scss: { language: 'scss', label: 'SCSS' },
  sass: { language: 'sass', label: 'Sass' },
  less: { language: 'less', label: 'Less' },

  // JavaScript / TypeScript (mapped for language hints)
  js: { language: 'javascript', label: 'JavaScript' },
  mjs: { language: 'javascript', label: 'JavaScript' },
  cjs: { language: 'javascript', label: 'JavaScript' },
  jsx: { language: 'javascript', label: 'JSX' },
  ts: { language: 'typescript', label: 'TypeScript' },
  tsx: { language: 'typescript', label: 'TSX' },

  // Data formats
  json: { language: 'json', label: 'JSON' },
  xml: { language: 'xml', label: 'XML' },
  svg: { language: 'xml', label: 'SVG' },
  yaml: { language: 'yaml', label: 'YAML' },
  yml: { language: 'yaml', label: 'YAML' },
  csv: { language: 'plaintext', label: 'CSV' },
  toml: { language: 'ini', label: 'TOML' },

  // Scripts & queries (mapped for language hints)
  py: { language: 'python', label: 'Python' },
  sh: { language: 'bash', label: 'Bash' },
  bash: { language: 'bash', label: 'Bash' },
  sql: { language: 'sql', label: 'SQL' },
  php: { language: 'php', label: 'PHP' },
  rb: { language: 'ruby', label: 'Ruby' },
  go: { language: 'go', label: 'Go' },

  // Documents & logs
  txt: { language: 'plaintext', label: 'Teks Polos' },
  log: { language: 'plaintext', label: 'Log' },
  md: { language: 'markdown', label: 'Markdown' },
  markdown: { language: 'markdown', label: 'Markdown' },
};

/**
 * Extracts normalized file extension from a filename or path.
 */
export function getFileExtension(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.trim().toLowerCase() || '';
}

/**
 * Resolves language hint and display label for a given filename or extension.
 */
export function getTextLanguageInfo(filenameOrExt: string): TextLanguageInfo {
  const ext = filenameOrExt.includes('.') ? getFileExtension(filenameOrExt) : filenameOrExt.toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || { language: 'plaintext', label: (ext || 'TEKS').toUpperCase() };
}

/**
 * Returns highlight.js language hint (e.g. 'html', 'json', 'typescript', 'plaintext').
 */
export function getTextLanguageHint(filenameOrExt: string): string {
  return getTextLanguageInfo(filenameOrExt).language;
}

/**
 * Known text-based MIME types.
 */
const TEXT_MIME_TYPES = new Set([
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
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
]);

/**
 * Determines whether a file is previewable as text/code based on size, MIME, and extension.
 */
export function isTextPreviewableFile(
  filename: string,
  mimeType?: string,
  sizeBytes?: number
): boolean {
  // Enforce size limit: files > 500KB must fallback to standard download card
  if (sizeBytes !== undefined && sizeBytes > MAX_TEXT_PREVIEW_BYTES) {
    return false;
  }

  const ext = getFileExtension(filename);
  const mime = (mimeType || '').toLowerCase();

  // Extension in known text/code map
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) {
    return true;
  }

  // Text MIME type (text/* or structured text application/*)
  if (mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime)) {
    return true;
  }

  return false;
}
