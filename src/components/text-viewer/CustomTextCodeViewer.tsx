import React, { useEffect, useState, useMemo } from 'react';
import hljs from 'highlight.js';
import { Copy, Check, ExternalLink, Code2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard } from '../../lib/utils';
import { getTextLanguageInfo, getTextLanguageHint, MAX_TEXT_PREVIEW_BYTES } from '../../shared/text-language-map';

interface CustomTextCodeViewerProps {
  item: MediaItem;
  onClose: () => void;
  onToast: (msg: string, opts?: { type?: 'success' | 'error' }) => void;
}

/**
 * Splits highlighted HTML into lines while safely balancing open/closed tags across line breaks.
 */
function splitHighlightedLines(html: string): string[] {
  const lines = html.split('\n');
  const result: string[] = [];
  const openTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = openTags.join('');
    const tagRegex = /<span\s+class="([^"]+)">|<\/span>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      if (match[0].startsWith('</')) {
        openTags.pop();
      } else {
        openTags.push(match[0]);
      }
    }
    const suffix = '</span>'.repeat(openTags.length);
    result.push(prefix + line + suffix);
  }
  return result;
}

export const CustomTextCodeViewer: React.FC<CustomTextCodeViewerProps> = ({
  item,
  onClose,
  onToast,
}) => {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const langInfo = useMemo(() => {
    return getTextLanguageInfo(item.name);
  }, [item.name]);

  const loadText = async () => {
    setIsLoading(true);
    setError(null);

    // If file exceeds size limit, show error
    if (item.size > MAX_TEXT_PREVIEW_BYTES) {
      setError(`Ukuran berkas (${item.formattedSize}) melebihi batas pratinjau teks (500 KB).`);
      setIsLoading(false);
      return;
    }

    try {
      const fetchUrl = item.blobUrl || item.shareUrl;
      const response = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Gagal memuat isi berkas (HTTP ${response.status})`);
      }

      const text = await response.text();
      if (text.length > MAX_TEXT_PREVIEW_BYTES) {
        setError(`Ukuran konten teks (${Math.round(text.length / 1024)} KB) melebihi batas pratinjau teks.`);
      } else {
        setContent(text);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh isi berkas.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadText();
  }, [item.id, item.shareUrl]);

  // Syntax highlighting computation
  const highlightedLines = useMemo(() => {
    if (!content) return [];
    try {
      const langHint = item.textLanguageHint || getTextLanguageHint(item.name);
      const isKnown = hljs.getLanguage(langHint);
      const highlighted = isKnown
        ? hljs.highlight(content, { language: langHint, ignoreIllegals: true }).value
        : hljs.highlight(content, { language: 'plaintext' }).value;
      return splitHighlightedLines(highlighted);
    } catch {
      // Fallback to simple escaping
      const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped.split('\n');
    }
  }, [content, item.name, item.textLanguageHint]);

  const handleCopy = async () => {
    if (!content) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      onToast('Isi teks berhasil disalin ke papan klip!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      onToast('Gagal menyalin isi teks.', { type: 'error' });
    }
  };

  return (
    <div
      className="w-full max-w-4xl max-h-[90vh] bg-[#121216] text-white rounded-[1.8rem] sm:rounded-[2.2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col relative transition-all duration-200"
      style={{ zIndex: 10 }}
    >
      {/* Top Toolbar */}
      <div className="p-3.5 sm:p-4 border-b border-white/10 flex items-center justify-between bg-[#191920] flex-wrap gap-2">
        {/* File name & Language Badge */}
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 flex-shrink-0">
            <Code2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold truncate text-zinc-100" title={item.name}>
              {item.name}
            </h4>
            <div className="flex items-center space-x-2 text-[11px] text-zinc-400 font-mono">
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold uppercase text-[10px]">
                {langInfo.label}
              </span>
              <span>•</span>
              <span>{content ? `${highlightedLines.length} baris` : item.formattedSize}</span>
              <span>•</span>
              <span>{item.formattedSize}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {content && (
            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center space-x-1.5 transition-colors clean-tap text-zinc-200"
              title="Salin isi teks"
              aria-label="Salin isi teks"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin'}</span>
            </button>
          )}

          <a
            href={item.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center space-x-1.5 transition-colors clean-tap text-zinc-200"
            title="Lihat mentah di tab baru"
            aria-label="Lihat mentah"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mentah</span>
          </a>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors clean-tap flex-shrink-0 text-zinc-300 hover:text-white"
            aria-label="Tutup pratinjau"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Viewer Body */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 bg-[#0d0d10] font-mono text-[13px] leading-[1.6]">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <p className="text-xs">Memuat dan menyoroti sintaks...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="p-3 rounded-full bg-red-500/10 text-red-400 mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-200 mb-1">{error}</p>
            <p className="text-xs text-zinc-400 max-w-sm mb-4">
              Anda tetap dapat mengunduh atau melihat berkas secara langsung.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={loadText}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors"
              >
                Coba Lagi
              </button>
              <a
                href={item.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors"
              >
                Buka Berkas
              </a>
            </div>
          </div>
        )}

        {content && !isLoading && !error && (
          <div className="code-viewer-container font-mono select-text overflow-x-auto min-w-full">
            {highlightedLines.map((lineHtml, idx) => (
              <div
                key={idx}
                className="code-line group flex hover:bg-white/[0.04] transition-colors rounded px-1 -mx-1"
              >
                <span
                  className="code-line-number select-none text-zinc-600 text-right pr-4 min-w-[3rem] font-mono text-xs opacity-70 group-hover:opacity-100 group-hover:text-zinc-400"
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
                <span
                  className="code-line-content flex-1 whitespace-pre break-normal text-zinc-200"
                  dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-white/10 bg-[#141418] flex items-center justify-between text-[11px] text-zinc-400 font-mono">
        <span>Clean Glass Syntax Engine</span>
        <span className="truncate max-w-[200px] sm:max-w-none">{item.mimeType}</span>
      </div>
    </div>
  );
};
