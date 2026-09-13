/**
 * Dashboard panels, charts, metrics, distribution, country lists, and AI recommendation styles.
 */
export function getDashboardPanelsCss(): string {
  return `
    /* Summary Metric Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem 1.5rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-subtle);
    }
    .metric-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .metric-label { font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .metric-icon { width: 32px; height: 32px; border-radius: 0.6rem; display: flex; align-items: center; justify-content: center; background: var(--surface-secondary); border: 1px solid var(--border-subtle); color: var(--accent); }
    .metric-value { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.25rem; }
    .metric-sub { font-size: 0.75rem; color: var(--muted); }

    /* Split Section Layout */
    .section-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.85rem;
    }
    .panel-title { font-size: 1rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; }
    .panel-badge { font-size: 0.75rem; color: var(--muted); }

    /* SVG Chart */
    .chart-container { width: 100%; height: 180px; position: relative; margin-top: 1rem; }
    .chart-bars { display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .chart-bar { width: 100%; max-width: 32px; background: linear-gradient(180deg, var(--accent), var(--accent-dark)); border-radius: 6px 6px 0 0; min-height: 4px; transition: height 0.3s; }
    .chart-date { font-size: 0.65rem; color: var(--muted); margin-top: 0.4rem; text-align: center; }
    .chart-tooltip-label { font-size: 0.7rem; font-weight: 700; color: var(--text); margin-bottom: 0.2rem; }

    /* Distribution Progress */
    .dist-item { margin-bottom: 1rem; }
    .dist-header { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; }
    .dist-bar-track { width: 100%; height: 8px; background: var(--surface-secondary); border: 1px solid var(--border-subtle); border-radius: 9999px; overflow: hidden; }
    .dist-bar-fill { height: 100%; border-radius: 9999px; }

    /* Country List */
    .country-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem; }
    .country-info { display: flex; align-items: center; gap: 0.6rem; }
    .country-flag { width: 20px; height: 14px; object-fit: cover; border-radius: 2px; }

    /* Gemini AI Recommendations & Real-Time Summary Box */
    .ai-rec-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-subtle);
      position: relative;
      overflow: hidden;
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .ai-rec-box::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
    }
    .ai-rec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .ai-rec-title-group {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .ai-rec-sparkle-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
      flex-shrink: 0;
    }
    .ai-rec-title {
      font-size: 0.975rem;
      font-weight: 800;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .ai-rec-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .ai-badge-model {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      color: var(--accent);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      letter-spacing: 0.02em;
    }
    .ai-badge-pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent);
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    .btn-ai-refresh {
      background: var(--surface-secondary);
      border: 1px solid var(--border);
      color: var(--text-main);
      border-radius: 8px;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .btn-ai-refresh:hover {
      background: var(--surface-hover);
      border-color: var(--accent);
      color: var(--accent);
    }
    .btn-ai-refresh:active {
      transform: scale(0.96);
    }
    .btn-ai-refresh:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* AI Executive Summary Card — High Contrast Adaptive Styling */
    .ai-summary-card {
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      border-left: 3.5px solid var(--accent);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      line-height: 1.65;
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    #ai-rec-summary-text {
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .ai-summary-label {
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      margin-bottom: 0.4rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    /* Recommendations List */
    .ai-recs-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 0;
      margin: 0;
    }
    .ai-list-item {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--text-main);
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      padding: 0.75rem 0.95rem;
      border-radius: 8px;
      transition: background 0.15s ease;
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .ai-list-item:hover {
      background: var(--surface-hover);
    }
    .ai-bullet {
      color: var(--accent);
      flex-shrink: 0;
      font-size: 0.85rem;
      margin-top: 0.15rem;
    }
    .ai-num-badge {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.7rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }
    .ai-item-body {
      flex: 1;
      min-width: 0;
      color: var(--text-main);
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .ai-bold {
      font-weight: 700;
      color: var(--text-main);
    }
    .ai-italic {
      font-style: italic;
      color: var(--text-main);
      opacity: 0.92;
    }
    .ai-code {
      font-family: var(--font-mono);
      font-size: 0.775rem;
      font-weight: 600;
      background: var(--surface-primary);
      color: var(--accent);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      overflow-wrap: break-word;
      word-break: break-all;
      max-width: 100%;
      display: inline-block;
    }
    .ai-heading-3 {
      font-size: 0.9rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0.6rem 0 0.3rem;
    }
    .ai-meta-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-subtle);
      font-size: 0.725rem;
      color: var(--text-muted);
    }

    /* Custom Loading Skeleton */
    .ai-skeleton-container {
      display: none;
      flex-direction: column;
      gap: 0.85rem;
    }
    .ai-skeleton-status {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .ai-skeleton-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: pulseDot 1.2s infinite ease-in-out;
    }
    .skeleton-shimmer {
      background: linear-gradient(90deg, var(--surface-secondary) 25%, var(--surface-hover) 50%, var(--surface-secondary) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite linear;
      border-radius: 6px;
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .skeleton-card {
      height: 74px;
      border-radius: 10px;
      width: 100%;
      border: 1px solid var(--border-subtle);
    }
    .skeleton-row {
      height: 44px;
      border-radius: 8px;
      width: 100%;
      border: 1px solid var(--border-subtle);
    }

    /* Error Notification Container */
    .ai-error-box {
      display: none;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.28);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
      max-width: 100%;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .ai-error-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #dc2626;
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }
    .theme-spacegray .ai-error-header, .theme-purple .ai-error-header, .theme-pacific .ai-error-header {
      color: #f87171;
    }
    .ai-error-desc {
      font-size: 0.8rem;
      color: var(--text-main);
      line-height: 1.5;
      margin-bottom: 0.85rem;
      opacity: 0.9;
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .ai-error-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .btn-ai-retry {
      background: #dc2626;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      touch-action: manipulation;
    }
    .theme-spacegray .btn-ai-retry, .theme-purple .btn-ai-retry, .theme-pacific .btn-ai-retry {
      background: #ef4444;
    }
    .btn-ai-fallback {
      background: var(--surface-secondary);
      color: var(--text-main);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }
  `;
}
