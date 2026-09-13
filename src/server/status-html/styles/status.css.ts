import { THEME_CSS_VARIABLES } from '../../admin-html/styles/theme.css';

export function getStatusPageCss(bannerBg: string, bannerBorder: string, bannerColor: string): string {
  return `
    ${THEME_CSS_VARIABLES}

    :root {
      --card-bg: var(--surface-primary);
      --card-border: var(--border-subtle);
      --card-hover: var(--surface-hover);
      --fg: var(--text-main);
      --muted: var(--text-muted);
      --subtle: var(--text-muted);
      --primary: var(--accent);
      --primary-hover: var(--accent-hover);
      --green: #10b981;
      --green-light: #059669;
      --yellow: #f59e0b;
      --yellow-light: #d97706;
      --red: #ef4444;
      --red-light: #dc2626;
      --status-operational: #059669;
      --status-degraded: #d97706;
      --status-outage: #dc2626;
    }

    .theme-spacegray, .theme-purple, .theme-pacific {
      --green-light: #34d399;
      --yellow-light: #fbbf24;
      --red-light: #f87171;
      --status-operational: #34d399;
      --status-degraded: #fbbf24;
      --status-outage: #f87171;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    .container {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
      flex: 1;
    }

    /* Header & Navbar */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--text-main);
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      background: var(--accent);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-text);
      box-shadow: var(--shadow-subtle);
    }

    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
    }

    .brand-pill {
      font-size: 0.7rem;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--border-subtle);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn-nav {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.825rem;
      font-weight: 600;
      color: var(--text-muted);
      text-decoration: none;
      padding: 0.45rem 0.85rem;
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .btn-nav:hover {
      background: var(--surface-hover);
      color: var(--text-main);
      border-color: var(--border-subtle-hover);
    }

    /* Overall Status Hero */
    .status-hero {
      background: ${bannerBg};
      border: 1px solid ${bannerBorder};
      border-radius: 14px;
      padding: 1.5rem 1.75rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
      transition: all 0.3s ease;
      box-shadow: var(--shadow-subtle);
    }

    .hero-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }

    .dot-operational {
      background-color: var(--green);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
    }

    .dot-degraded {
      background-color: var(--yellow);
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
      animation: pulse-glow 2s infinite ease-in-out;
    }

    .dot-outage {
      background-color: var(--red);
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
      animation: pulse-glow 1.5s infinite ease-in-out;
    }

    @keyframes pulse-glow {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.75; }
    }

    .hero-headline {
      font-size: 1.2rem;
      font-weight: 700;
      color: ${bannerColor};
      letter-spacing: -0.01em;
      margin-bottom: 0.35rem;
    }

    .hero-sub {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Announcement */
    .announcement-card {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 1.15rem 1.35rem;
      margin-bottom: 2rem;
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      color: #0284c7;
    }

    .announcement-card.type-warning {
      background: rgba(245, 158, 11, 0.08);
      border-color: rgba(245, 158, 11, 0.25);
      color: #b45309;
    }

    .announcement-card.type-success {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.25);
      color: #047857;
    }

    .theme-spacegray .announcement-card, .theme-purple .announcement-card, .theme-pacific .announcement-card {
      color: #38bdf8;
    }
    .theme-spacegray .announcement-card.type-warning, .theme-purple .announcement-card.type-warning, .theme-pacific .announcement-card.type-warning {
      color: #fbbf24;
    }
    .theme-spacegray .announcement-card.type-success, .theme-purple .announcement-card.type-success, .theme-pacific .announcement-card.type-success {
      color: #34d399;
    }

    .ann-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .ann-title {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .ann-msg {
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--text-main);
    }

    /* Section Title */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .refresh-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    /* Services List */
    .services-grid {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2.25rem;
      box-shadow: var(--shadow-subtle);
    }

    .service-row {
      padding: 1.15rem 1.35rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.15s ease;
    }

    .service-row:last-child {
      border-bottom: none;
    }

    .service-row:hover {
      background: var(--surface-hover);
    }

    .service-info {
      flex: 1;
    }

    .service-name {
      font-size: 0.925rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 0.2rem;
    }

    .service-desc {
      font-size: 0.775rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .service-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.775rem;
      font-weight: 600;
      padding: 0.3rem 0.7rem;
      border-radius: 9999px;
      white-space: nowrap;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .badge-green {
      background: rgba(16, 185, 129, 0.12);
      color: var(--green-light);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .badge-green .badge-dot { background: var(--green); }

    .badge-yellow {
      background: rgba(245, 158, 11, 0.12);
      color: var(--yellow-light);
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .badge-yellow .badge-dot { background: var(--yellow); }

    .badge-red {
      background: rgba(239, 68, 68, 0.12);
      color: var(--red-light);
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .badge-red .badge-dot { background: var(--red); }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2.25rem;
    }

    .metric-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.15rem 1.25rem;
      box-shadow: var(--shadow-subtle);
    }

    .metric-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
    }

    .metric-val {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .metric-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    /* Past Incidents */
    .incidents-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem 1.35rem;
      margin-bottom: 2.5rem;
      box-shadow: var(--shadow-subtle);
    }

    .incident-entry {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      font-size: 0.825rem;
      color: var(--text-muted);
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border-subtle);
      padding-top: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.775rem;
      color: var(--text-muted);
    }

    .footer a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer a:hover {
      color: var(--accent);
    }

    .footer-links {
      display: flex;
      gap: 1.25rem;
    }

    @media (max-width: 640px) {
      .service-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .service-badge {
        align-self: flex-start;
      }
    }
  `;
}
