import { THEME_CSS_VARIABLES } from './share-theme.css';

export function getShareBaseCss(): string {
  return `
    ${THEME_CSS_VARIABLES}

    :root {
      --bg: var(--bg-primary);
      --card: var(--surface-primary);
      --card-gradient: linear-gradient(180deg, var(--surface-primary) 0%, var(--surface-elevated) 100%);
      --text: var(--text-main);
      --muted: var(--text-muted);
      --border: var(--border-subtle);
      --border-accent: var(--border-focus);
      --accent: var(--accent);
      --accent-hover: var(--accent-hover);
      --surface: var(--surface-secondary);
      --surface-subtle: var(--surface-secondary);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; transition: background-color 0.25s ease, color 0.25s ease; }
    .card { background: var(--card-gradient); border: 1px solid var(--border); border-radius: 1.5rem; padding: 1.75rem; max-width: 480px; width: 100%; box-shadow: var(--shadow-elevated, 0 16px 40px -10px rgba(0,0,0,0.65)); backdrop-filter: blur(16px); transition: max-width 0.2s ease, background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease; }
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
`;
}
