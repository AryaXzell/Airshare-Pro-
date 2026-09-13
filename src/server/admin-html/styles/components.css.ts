/**
 * Reusable components styles: tables, badges, iOS modals, buttons, sync banners, footer, toast.
 */
export function getComponentsCss(): string {
  return `
    /* Tables */
    .table-container {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
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

    /* iOS-Style Custom Toggle Switch */
    .ios-toggle-switch {
      position: relative;
      display: inline-block;
      width: 51px;
      height: 31px;
      flex-shrink: 0;
    }
    .ios-toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .ios-toggle-track {
      position: absolute;
      inset: 0;
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .ios-toggle-switch input:checked + .ios-toggle-track {
      background: var(--accent);
      border-color: var(--accent);
    }
    .ios-toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 25px;
      height: 25px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.25);
      transition: transform 0.2s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    .ios-toggle-switch input:checked + .ios-toggle-track .ios-toggle-thumb {
      transform: translateX(20px);
    }
    .ios-toggle-switch input:disabled + .ios-toggle-track {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ========================================================
       iOS DYNAMIC ISLAND / BANNER TOAST NOTIFICATION
       ======================================================== */
    .ios-toast-container {
      position: fixed;
      top: 1.15rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      width: calc(100% - 2rem);
      max-width: 440px;
    }

    .ios-toast {
      pointer-events: auto;
      width: 100%;
      background: rgba(18, 18, 22, 0.9);
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 1.15rem;
      padding: 0.65rem 1rem;
      box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      box-sizing: border-box;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      user-select: none;
      animation: iosDynamicSpringIn 0.38s cubic-bezier(0.16, 1.3, 0.3, 1) both;
      will-change: transform, opacity, filter;
      transition: transform 0.15s ease;
    }

    .ios-toast:active {
      transform: scale(0.97);
    }

    .ios-toast.toast-exit {
      animation: iosDynamicSpringOut 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      pointer-events: none;
    }

    @keyframes iosDynamicSpringIn {
      0% {
        opacity: 0;
        transform: translateY(-36px) scale(0.84);
        filter: blur(6px);
      }
      70% {
        opacity: 1;
        transform: translateY(2px) scale(1.015);
        filter: blur(0px);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0px);
      }
    }

    @keyframes iosDynamicSpringOut {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0px);
      }
      100% {
        opacity: 0;
        transform: translateY(-24px) scale(0.88);
        filter: blur(5px);
      }
    }

    .ios-toast-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .ios-toast.level-error {
      background: rgba(30, 16, 20, 0.94);
      border-color: rgba(248, 113, 113, 0.38);
      box-shadow: 0 16px 36px -4px rgba(239, 68, 68, 0.3), 0 0 0 1px rgba(248, 113, 113, 0.15);
    }
    .ios-toast.level-error .ios-toast-icon {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    .ios-toast.level-warning {
      background: rgba(30, 24, 14, 0.94);
      border-color: rgba(251, 191, 36, 0.38);
      box-shadow: 0 16px 36px -4px rgba(245, 158, 11, 0.25), 0 0 0 1px rgba(251, 191, 36, 0.15);
    }
    .ios-toast.level-warning .ios-toast-icon {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
    }

    .ios-toast.level-success {
      background: rgba(14, 28, 22, 0.94);
      border-color: rgba(52, 211, 153, 0.38);
      box-shadow: 0 16px 36px -4px rgba(16, 185, 129, 0.25), 0 0 0 1px rgba(52, 211, 153, 0.15);
    }
    .ios-toast.level-success .ios-toast-icon {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }

    .ios-toast.level-info {
      background: rgba(16, 24, 36, 0.94);
      border-color: rgba(56, 189, 248, 0.38);
      box-shadow: 0 16px 36px -4px rgba(56, 189, 248, 0.25), 0 0 0 1px rgba(56, 189, 248, 0.15);
    }
    .ios-toast.level-info .ios-toast-icon {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
    }

    .ios-toast-body {
      flex: 1;
      min-width: 0;
    }
    .ios-toast-title {
      font-size: 0.8rem;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 0.15rem;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ios-toast-time {
      font-size: 0.65rem;
      font-weight: 500;
      opacity: 0.55;
    }
    .ios-toast-msg {
      font-size: 0.775rem;
      line-height: 1.35;
      color: rgba(241, 245, 249, 0.88);
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .ios-toast-hint {
      font-size: 0.675rem;
      color: rgba(148, 163, 184, 0.85);
      margin-top: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .ios-toast-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: currentColor;
      opacity: 0.35;
      width: 100%;
      transform-origin: left;
      animation: iosToastProgress 1.8s linear forwards;
    }
    .ios-toast:hover .ios-toast-bar {
      animation-play-state: paused;
    }
    @keyframes iosToastProgress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    /* ========================================================
       TAB PUSAT NOTIFIKASI
       ======================================================== */
    .notif-badge-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #ef4444;
      color: #ffffff;
      font-size: 0.65rem;
      font-weight: 800;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      margin-left: 0.4rem;
      line-height: 1;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
    }
    .notif-filter-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .notif-filter-btn {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      border-radius: 999px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s ease;
    }
    .notif-filter-btn:hover {
      background: var(--surface-secondary);
      color: var(--text-main);
    }
    .notif-filter-btn.active {
      background: var(--accent);
      color: var(--accent-text, #ffffff);
      border-color: var(--accent);
    }

    .notif-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 1rem;
      padding: 1.15rem;
      margin-bottom: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
      position: relative;
    }
    .notif-card.unread {
      border-left: 4px solid var(--accent);
      background: var(--surface-glass);
    }
    .notif-card.is-error {
      border-color: rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.03);
    }
    .notif-card.is-error.unread {
      border-left: 4px solid #ef4444;
    }

    .notif-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .notif-meta-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .notif-tag {
      font-size: 0.675rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.18rem 0.55rem;
      border-radius: 6px;
      line-height: 1.2;
    }
    .notif-tag-error { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); }
    .notif-tag-warning { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
    .notif-tag-success { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }
    .notif-tag-info { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); }

    .notif-time-badge {
      font-size: 0.725rem;
      color: var(--text-muted);
    }

    /* 1-Click Copy Error Box */
    .notif-error-clickable-box {
      background: rgba(239, 68, 68, 0.08);
      border: 1px dashed rgba(239, 68, 68, 0.4);
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      transition: all 0.2s ease;
      user-select: text;
    }
    .notif-error-clickable-box:hover {
      background: rgba(239, 68, 68, 0.14);
      border-color: rgba(239, 68, 68, 0.6);
      transform: translateY(-1px);
    }
    .notif-error-clickable-box:active {
      transform: translateY(0);
    }
    .btn-copy-error-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
      font-size: 0.725rem;
      font-weight: 700;
      padding: 0.35rem 0.65rem;
      border-radius: 0.5rem;
      cursor: pointer;
      flex-shrink: 0;
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    .btn-copy-error-badge:hover {
      background: rgba(239, 68, 68, 0.35);
      color: #ffffff;
    }
    .btn-copy-error-badge.copied {
      background: rgba(16, 185, 129, 0.25) !important;
      border-color: rgba(16, 185, 129, 0.5) !important;
      color: #34d399 !important;
    }

    /* Expandable Original / Raw Details */
    .notif-raw-details {
      margin-top: 0.5rem;
      border-radius: 0.75rem;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      overflow: hidden;
    }
    .notif-raw-details summary {
      padding: 0.6rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      user-select: none;
    }
    .notif-raw-details summary:hover {
      color: var(--text-main);
    }
    .notif-raw-box {
      padding: 0.85rem;
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      line-height: 1.45;
      color: #e2e8f0;
      background: rgba(0, 0, 0, 0.35);
      border-top: 1px solid var(--border-subtle);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 260px;
      overflow-y: auto;
    }
  `;
}
