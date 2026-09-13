import {
  GOOGLE_FONTS_TAGS,
  THEME_HEAD_SCRIPT,
  THEME_BODY_SCRIPT,
  THEME_STORAGE_LISTENER_SCRIPT,
  THEME_CSS_VARIABLES,
} from '../styles/theme.css';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface AdminLoginPageParams {
  fullAdminPath: string;
  errorMessage?: string;
}

export function renderAdminLoginHtml(params: AdminLoginPageParams): string {
  const { fullAdminPath, errorMessage } = params;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Authentication — AirShare Pro</title>
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
    ${THEME_CSS_VARIABLES}

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      transition: background-color 0.25s ease, color 0.25s ease;
    }
    .glass-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 1.5rem;
      padding: 2.25rem;
      max-width: 420px;
      width: 100%;
      box-shadow: var(--shadow-modal);
    }
    .header { text-align: center; margin-bottom: 2rem; }
    h1 { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.35rem; color: var(--text-main); }
    p.subtitle { color: var(--text-muted); font-size: 0.85rem; line-height: 1.4; }
    .error-banner {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
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
    label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      padding: 0.8rem 1rem;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--border-focus);
    }
    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: var(--accent-text, #fff);
      border: none;
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .btn-submit:hover { background: var(--accent-hover); }
  </style>
</head>
<body class="theme-rosegold">
  ${THEME_BODY_SCRIPT}
  <div class="glass-card">
    <div class="header">
      <h1>AirShare Pro Admin</h1>
      <p class="subtitle">Masukkan kunci otorisasi rahasia untuk memuat analitik sistem.</p>
    </div>

    ${
      errorMessage
        ? `<div class="error-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${escapeHtml(errorMessage)}</span>
          </div>`
        : ''
    }

    <form method="POST" action="/${escapeHtml(fullAdminPath)}/login">
      <div class="form-group">
        <label for="password">Kunci Sandi Admin</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••••••••••" autofocus />
      </div>
      <button type="submit" class="btn-submit">Buka Dashboard</button>
    </form>
  </div>

  <script>
    ${THEME_STORAGE_LISTENER_SCRIPT}
  </script>
</body>
</html>`;
}
