/**
 * Responsive media query styles for Admin Dashboard.
 */
export function getResponsiveCss(): string {
  return `
    /* Media Queries */
    @media (max-width: 900px) {
      .admin-layout {
        display: block;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .admin-sidebar {
        display: none;
      }
      .admin-main {
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .admin-mobile-tabs {
        display: flex;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .section-grid {
        grid-template-columns: 1fr;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .op-config-grid {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 640px) {
      body {
        padding: 0.75rem;
      }
      .container {
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .top-nav {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
        margin-bottom: 1rem;
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
      }
      .nav-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .live-badge {
        flex: 1;
        min-width: 0;
      }
      .panel {
        padding: 1rem;
        border-radius: 1rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .metric-card {
        padding: 1rem 1.1rem;
        border-radius: 1rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .rec-box, .ai-rec-box {
        padding: 1rem;
        border-radius: 1rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .admin-clean-footer {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
    }
  `;
}
