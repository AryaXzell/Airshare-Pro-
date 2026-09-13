/**
 * Base layout, reset, typography, and navigation styles for Admin Panel.
 */
export function getBaseCss(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      overflow-x: hidden;
      width: 100%;
      max-width: 100vw;
    }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      padding: 1.25rem;
      min-height: 100vh;
      transition: background-color 0.25s ease, color 0.25s ease;
    }
    .container {
      max-width: 1280px;
      width: 100%;
      margin: 0 auto;
      min-width: 0;
      box-sizing: border-box;
    }

    /* Header & Navigation */
    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--surface-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-logo {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .brand-text h1 { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
    .brand-text p { font-size: 0.75rem; color: var(--muted); }
    .nav-actions { display: flex; align-items: center; gap: 0.75rem; }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: transparent;
      border: none;
      box-shadow: none;
      padding: 0.25rem 0.4rem;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
      flex-shrink: 0;
    }
    .live-sync-time {
      font-size: 0.775rem;
      color: var(--muted);
      font-weight: 500;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
    .btn-logout {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.2s, color 0.2s;
    }
    .btn-logout:hover { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }

    /* Layout & Sidebar Nav */
    .admin-layout {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    .admin-sidebar {
      width: 240px;
      flex-shrink: 0;
      position: sticky;
      top: 1.25rem;
      max-height: calc(100vh - 2.5rem);
      overflow-y: auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 0.85rem;
      box-shadow: var(--shadow-subtle);
    }
    .sidebar-title {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      padding: 0.45rem 0.65rem 0.65rem;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.5rem;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .admin-sidebar-btn {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      text-align: left;
      padding: 0.65rem 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .admin-sidebar-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
    }
    .admin-sidebar-btn.active {
      background: var(--accent-soft);
      border-color: var(--border-accent);
      color: #60a5fa;
    }
    .admin-sidebar-btn.active .sidebar-btn-title {
      color: #60a5fa;
    }
    .sidebar-btn-icon {
      width: 32px;
      height: 32px;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.04);
      flex-shrink: 0;
      color: inherit;
      transition: background 0.15s ease;
    }
    .admin-sidebar-btn.active .sidebar-btn-icon {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }
    .sidebar-btn-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .sidebar-btn-title {
      font-size: 0.825rem;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-btn-desc {
      font-size: 0.675rem;
      color: var(--muted);
      line-height: 1.2;
      margin-top: 0.15rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-main {
      flex: 1;
      min-width: 0;
      width: 100%;
    }

    /* Mobile Category Tabs */
    .admin-mobile-tabs {
      display: none;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.75rem;
      margin-bottom: 1rem;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x;
      scrollbar-width: none;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
    }
    .admin-mobile-tabs::-webkit-scrollbar {
      display: none;
    }
    .admin-tab-btn {
      flex-shrink: 0;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 0.95rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    .admin-tab-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
    }
    .admin-tab-btn:active {
      transform: scale(0.96);
      background: rgba(255, 255, 255, 0.1);
    }
    .admin-tab-btn.active {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
    }
    .admin-sidebar-btn {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    }
    .admin-sidebar-btn:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.08);
    }

    /* Category Panel Toggle */
    .category-panel {
      display: none;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .category-panel.active {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      animation: fadeIn 0.2s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
}
