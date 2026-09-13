export function getFullLockdownCss(): string {
  return `
    :root {
      --bg: #09090b;
      --card: #121216;
      --card-inner: #181820;
      --border: #27272a;
      --border-subtle: #202025;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #f87171;
      --accent-glow: rgba(239, 68, 68, 0.15);
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
    body::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 360px;
      background: radial-gradient(circle at 50% 10%, rgba(239, 68, 68, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .wrapper {
      position: relative;
      z-index: 1;
      max-width: 520px;
      width: 100%;
    }
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
      background: linear-gradient(135deg, #ef4444, #b91c1c);
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
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      font-weight: 600;
    }
    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03);
      text-align: center;
    }
    .status-badge-row {
      display: flex;
      align-items: center;
      justify-content: center;
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
      padding: 0.35rem 0.85rem;
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
      margin: 0 auto 1.25rem;
    }
    h1 {
      font-size: 1.35rem;
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
    .status-info-box {
      background: var(--card-inner);
      border: 1px solid var(--border-subtle);
      border-radius: 0.85rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
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
      background-color: #2563eb;
      color: #fff;
    }
    .btn-primary:hover {
      background-color: #1d4ed8;
    }
  `;
}

export function getShareErrorCss(accentColor: string, accentGlow: string): string {
  return `
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
  `;
}
