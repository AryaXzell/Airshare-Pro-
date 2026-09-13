/**
 * Responsive media query styles for Admin Dashboard.
 */
export function getResponsiveCss(): string {
  return `
    /* Media Queries */
    @media (max-width: 900px) {
      .admin-layout {
        display: block;
      }
      .admin-sidebar {
        display: none;
      }
      .admin-main {
        width: 100%;
      }
      .admin-mobile-tabs {
        display: flex;
      }
      .section-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      body {
        padding: 0.75rem;
      }
      .top-nav {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
        margin-bottom: 1rem;
      }
      .panel {
        padding: 1rem;
        border-radius: 1rem;
      }
      .metric-card {
        padding: 1rem 1.1rem;
        border-radius: 1rem;
      }
      .rec-box {
        padding: 1rem;
        border-radius: 1rem;
      }
      .admin-clean-footer {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
      }
    }
  `;
}
