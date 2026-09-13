/**
 * Reusable components styles: tables, badges, iOS modals, buttons, sync banners, footer, toast.
 */
export function getComponentsCss(): string {
  return `
    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-top: 0.5rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      background: var(--card);
      box-shadow: var(--shadow-subtle);
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: var(--border-subtle) transparent;
    }
    .table-container::-webkit-scrollbar {
      height: 6px;
      width: 6px;
    }
    .table-container::-webkit-scrollbar-track {
      background: transparent;
    }
    .table-container::-webkit-scrollbar-thumb {
      background: var(--border-subtle);
      border-radius: 9999px;
    }
    table {
      width: 100%;
      min-width: 600px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
      color: var(--text-main);
    }
    th {
      padding: 0.75rem 0.9rem;
      font-size: 0.725rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      background: var(--surface-secondary);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-main);
      vertical-align: middle;
    }
    tr:hover td {
      background: var(--surface-hover);
    }
    .badge-type { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .badge-image { background: rgba(16, 185, 129, 0.15); color: #059669; }
    .badge-video { background: rgba(139, 92, 246, 0.15); color: #7c3aed; }
    .badge-audio { background: rgba(236, 72, 153, 0.15); color: #db2777; }
    .badge-file { background: rgba(245, 158, 11, 0.15); color: #d97706; }

    .theme-spacegray .badge-image, .theme-purple .badge-image, .theme-pacific .badge-image { color: #34d399; }
    .theme-spacegray .badge-video, .theme-purple .badge-video, .theme-pacific .badge-video { color: #a78bfa; }
    .theme-spacegray .badge-audio, .theme-purple .badge-audio, .theme-pacific .badge-audio { color: #f472b6; }
    .theme-spacegray .badge-file, .theme-purple .badge-file, .theme-pacific .badge-file { color: #fbbf24; }

    .session-tag { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); background: var(--surface-secondary); border: 1px solid var(--border-subtle); padding: 0.15rem 0.4rem; border-radius: 4px; }
    .link-view { color: var(--accent); text-decoration: none; font-weight: 600; }
    .link-view:hover { text-decoration: underline; }

    /* iOS Alert & Confirmation Modal (Super Lightweight, Adaptive to Themes) */
    .ios-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      opacity: 0;
      visibility: hidden;
      pointer-events: none; /* CRITICAL FIX: prevents touch blocking when modal is not active */
      transition: opacity 0.18s ease, visibility 0.18s ease;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    .ios-modal-overlay.active {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .ios-modal-box {
      background: var(--card, #18181b);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
      border-radius: 14px;
      width: 100%;
      max-width: 320px;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04);
      text-align: center;
      overflow: hidden;
      transform: scale(0.92);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ios-modal-overlay.active .ios-modal-box {
      transform: scale(1);
    }
    .ios-modal-body-content {
      padding: 1.35rem 1.15rem 1.15rem;
    }
    .ios-modal-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      margin: 0 auto 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ios-modal-icon-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .ios-modal-icon-warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .ios-modal-icon-info {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent, #60a5fa);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .ios-modal-icon-success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .ios-modal-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--fg, #ffffff);
      line-height: 1.3;
      margin-bottom: 0.45rem;
    }
    .ios-modal-desc {
      font-size: 0.825rem;
      color: var(--subtle, #a1a1aa);
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-line;
    }
    .ios-modal-actions-row {
      display: flex;
      border-top: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    }
    .ios-modal-btn {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 0.95rem;
      padding: 0.85rem 0.5rem;
      cursor: pointer;
      transition: background 0.15s ease;
      outline: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      font-family: inherit;
    }
    .ios-modal-btn:active, .ios-modal-btn:hover {
      background: rgba(128, 128, 128, 0.1);
    }
    .ios-modal-btn-cancel {
      color: var(--subtle, #94a3b8);
      font-weight: 500;
      border-right: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    }
    .ios-modal-btn-danger {
      color: #f87171;
      font-weight: 700;
    }
    .ios-modal-btn-primary {
      color: var(--accent, #60a5fa);
      font-weight: 700;
    }

    /* Action buttons & Sync UI */
    .btn-delete-perm {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-perm:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.4);
      color: #ffffff;
    }
    .btn-delete-perm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-sync-action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--accent);
      color: #ffffff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.45rem 0.95rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .btn-sync-action:hover {
      background: #1d4ed8;
    }
    .btn-sync-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sync-banner {
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      font-size: 0.85rem;
      line-height: 1.5;
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .sync-banner-ok {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
    }
    .sync-banner-warn {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #f87171;
    }
    .sync-banner-idle {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .btn-delete-history {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-history:hover {
      background: rgba(245, 158, 11, 0.25);
      color: #ffffff;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Clean Minimalist Footer */
    .admin-clean-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.85rem 1.25rem;
      background: var(--surface-glass);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border-subtle);
      border-radius: 1rem;
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .admin-clean-footer .footer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .admin-clean-footer .footer-dot {
      opacity: 0.4;
    }
    .admin-clean-footer .footer-tab-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 700;
    }
    .admin-clean-footer .footer-tab-link:hover {
      text-decoration: underline;
    }
    .admin-clean-footer .footer-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      opacity: 0.8;
    }
    .health-item { display: flex; align-items: center; gap: 0.5rem; }
    .status-indicator { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
    .status-ok { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-warn { background: var(--warning); box-shadow: 0 0 6px var(--warning); }

    #admin-toast-banner {
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
  `;
}
