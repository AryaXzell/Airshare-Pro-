/**
 * Single Source of Truth for Dynamic Themes in Server-Side Rendered Pages
 * Synchronizes /admin and /status with the main React app (src/index.css & useTheme.ts).
 */

export const GOOGLE_FONTS_TAGS = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
`.trim();

export const THEME_HEAD_SCRIPT = `
<script>
  (function() {
    try {
      var storedTheme = localStorage.getItem('airshare_theme');
      var validThemes = ['rosegold', 'silver', 'spacegray', 'purple', 'pacific'];
      var theme = (storedTheme && validThemes.indexOf(storedTheme) !== -1) ? storedTheme : 'rosegold';
      document.documentElement.setAttribute('data-theme-loading', theme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme-loading', 'rosegold');
    }
  })();
</script>
`.trim();

export const THEME_BODY_SCRIPT = `
<script>
  (function() {
    var theme = document.documentElement.getAttribute('data-theme-loading') || 'rosegold';
    document.body.classList.add('theme-' + theme);
  })();
</script>
`.trim();

export const THEME_STORAGE_LISTENER_SCRIPT = `
  window.addEventListener('storage', function(e) {
    if (e.key === 'airshare_theme' && e.newValue) {
      var validThemes = ['rosegold', 'silver', 'spacegray', 'purple', 'pacific'];
      var newTheme = validThemes.indexOf(e.newValue) !== -1 ? e.newValue : 'rosegold';
      validThemes.forEach(function(t) {
        document.body.classList.remove('theme-' + t);
      });
      document.body.classList.add('theme-' + newTheme);
    }
  });
`.trim();

export const THEME_CSS_VARIABLES = `
  :root {
    --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

    /* Default Theme: Rose Gold */
    --bg-primary: #fdf9fa;
    --surface-primary: rgba(255, 255, 255, 0.95);
    --surface-secondary: rgba(244, 63, 94, 0.04);
    --surface-elevated: #ffffff;
    --surface-translucent: rgba(255, 255, 255, 0.90);
    --surface-hover: rgba(244, 63, 94, 0.05);
    --surface-active: rgba(244, 63, 94, 0.10);

    --border-subtle: rgba(225, 29, 72, 0.10);
    --border-subtle-hover: rgba(225, 29, 72, 0.22);
    --border-focus: rgba(225, 29, 72, 0.45);

    --text-main: #2b1118;
    --text-muted: #7d4854;

    --accent: #e11d48;
    --accent-hover: #be123c;
    --accent-text: #ffffff;
    --accent-soft: rgba(225, 29, 72, 0.09);
    --accent-soft-hover: rgba(225, 29, 72, 0.16);

    --slider-track: rgba(225, 29, 72, 0.10);
    --slider-fill: #e11d48;

    --shadow-subtle: 0 2px 12px -2px rgba(190, 18, 60, 0.05), 0 1px 3px rgba(190, 18, 60, 0.03);
    --shadow-elevated: 0 12px 32px -4px rgba(190, 18, 60, 0.08), 0 4px 12px -2px rgba(190, 18, 60, 0.04);
    --shadow-modal: 0 24px 48px -8px rgba(190, 18, 60, 0.12), 0 8px 16px -4px rgba(190, 18, 60, 0.04);

    /* Legacy Fallback Aliases */
    --bg: var(--bg-primary);
    --fg: var(--text-main);
    --text: var(--text-main);
    --muted: var(--text-muted);
    --card: var(--surface-primary);
    --card-inner: var(--surface-secondary);
    --card-elevated: var(--surface-elevated);
    --surface-glass: var(--surface-translucent);
    --border: var(--border-subtle);
    --border-accent: var(--border-focus);
    --accent-dark: var(--accent-hover);

    color-scheme: light;
  }

  /* Theme: Classic Silver (Light) */
  .theme-silver {
    --bg-primary: #f5f5f7;
    --surface-primary: rgba(255, 255, 255, 0.94);
    --surface-secondary: rgba(0, 0, 0, 0.035);
    --surface-elevated: #ffffff;
    --surface-translucent: rgba(255, 255, 255, 0.88);
    --surface-hover: rgba(0, 0, 0, 0.045);
    --surface-active: rgba(0, 0, 0, 0.08);

    --border-subtle: rgba(0, 0, 0, 0.08);
    --border-subtle-hover: rgba(0, 0, 0, 0.16);
    --border-focus: rgba(0, 113, 227, 0.45);

    --text-main: #1d1d1f;
    --text-muted: #6e6e73;
    
    --accent: #0071e3;
    --accent-hover: #0077ed;
    --accent-text: #ffffff;
    --accent-soft: rgba(0, 113, 227, 0.09);
    --accent-soft-hover: rgba(0, 113, 227, 0.15);

    --slider-track: rgba(0, 0, 0, 0.08);
    --slider-fill: #0071e3;

    --shadow-subtle: 0 2px 12px -2px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03);
    --shadow-elevated: 0 12px 32px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04);
    --shadow-modal: 0 24px 48px -8px rgba(0, 0, 0, 0.12), 0 8px 16px -4px rgba(0, 0, 0, 0.04);

    color-scheme: light;
  }

  /* Theme: Space Gray (Dark) */
  .theme-spacegray {
    --bg-primary: #0e0e11;
    --surface-primary: rgba(22, 22, 26, 0.92);
    --surface-secondary: rgba(255, 255, 255, 0.05);
    --surface-elevated: #1a1a1f;
    --surface-translucent: rgba(24, 24, 29, 0.85);
    --surface-hover: rgba(255, 255, 255, 0.07);
    --surface-active: rgba(255, 255, 255, 0.12);

    --border-subtle: rgba(255, 255, 255, 0.09);
    --border-subtle-hover: rgba(255, 255, 255, 0.18);
    --border-focus: rgba(52, 211, 153, 0.45);

    --text-main: #f5f5f7;
    --text-muted: #94949b;

    --accent: #34d399;
    --accent-hover: #10b981;
    --accent-text: #042f1a;
    --accent-soft: rgba(52, 211, 153, 0.12);
    --accent-soft-hover: rgba(52, 211, 153, 0.18);

    --slider-track: rgba(255, 255, 255, 0.14);
    --slider-fill: #34d399;

    --shadow-subtle: 0 4px 16px -2px rgba(0, 0, 0, 0.35);
    --shadow-elevated: 0 16px 36px -4px rgba(0, 0, 0, 0.55);
    --shadow-modal: 0 28px 56px -8px rgba(0, 0, 0, 0.75);

    color-scheme: dark;
  }

  /* Theme: Deep Purple (Dark) */
  .theme-purple {
    --bg-primary: #0a0614;
    --surface-primary: rgba(22, 15, 36, 0.92);
    --surface-secondary: rgba(192, 132, 252, 0.06);
    --surface-elevated: #1b122e;
    --surface-translucent: rgba(24, 16, 40, 0.85);
    --surface-hover: rgba(255, 255, 255, 0.07);
    --surface-active: rgba(255, 255, 255, 0.12);

    --border-subtle: rgba(192, 132, 252, 0.14);
    --border-subtle-hover: rgba(192, 132, 252, 0.25);
    --border-focus: rgba(192, 132, 252, 0.45);

    --text-main: #f8f6ff;
    --text-muted: #ab9bc7;

    --accent: #c084fc;
    --accent-hover: #a855f7;
    --accent-text: #28084a;
    --accent-soft: rgba(192, 132, 252, 0.13);
    --accent-soft-hover: rgba(192, 132, 252, 0.20);

    --slider-track: rgba(255, 255, 255, 0.14);
    --slider-fill: #c084fc;

    --shadow-subtle: 0 4px 16px -2px rgba(8, 4, 16, 0.45);
    --shadow-elevated: 0 16px 36px -4px rgba(8, 4, 16, 0.65);
    --shadow-modal: 0 28px 56px -8px rgba(8, 4, 16, 0.85);

    color-scheme: dark;
  }

  /* Theme: Pacific Blue (Dark) */
  .theme-pacific {
    --bg-primary: #07101d;
    --surface-primary: rgba(14, 25, 45, 0.92);
    --surface-secondary: rgba(56, 189, 248, 0.06);
    --surface-elevated: #11203b;
    --surface-translucent: rgba(15, 28, 50, 0.85);
    --surface-hover: rgba(255, 255, 255, 0.07);
    --surface-active: rgba(255, 255, 255, 0.12);

    --border-subtle: rgba(56, 189, 248, 0.14);
    --border-subtle-hover: rgba(56, 189, 248, 0.25);
    --border-focus: rgba(56, 189, 248, 0.45);

    --text-main: #f0f8ff;
    --text-muted: #7cb3d4;

    --accent: #38bdf8;
    --accent-hover: #0ea5e9;
    --accent-text: #05263d;
    --accent-soft: rgba(56, 189, 248, 0.13);
    --accent-soft-hover: rgba(56, 189, 248, 0.20);

    --slider-track: rgba(255, 255, 255, 0.14);
    --slider-fill: #38bdf8;

    --shadow-subtle: 0 4px 16px -2px rgba(4, 9, 18, 0.45);
    --shadow-elevated: 0 16px 36px -4px rgba(4, 9, 18, 0.65);
    --shadow-modal: 0 28px 56px -8px rgba(4, 9, 18, 0.85);

    color-scheme: dark;
  }

  /* Theme: Rose Gold (White + Rose Gold Signature Identity) */
  .theme-rosegold {
    --bg-primary: #fdf9fa;
    --surface-primary: rgba(255, 255, 255, 0.95);
    --surface-secondary: rgba(244, 63, 94, 0.04);
    --surface-elevated: #ffffff;
    --surface-translucent: rgba(255, 255, 255, 0.90);
    --surface-hover: rgba(244, 63, 94, 0.05);
    --surface-active: rgba(244, 63, 94, 0.10);

    --border-subtle: rgba(225, 29, 72, 0.10);
    --border-subtle-hover: rgba(225, 29, 72, 0.22);
    --border-focus: rgba(225, 29, 72, 0.45);

    --text-main: #2b1118;
    --text-muted: #7d4854;

    --accent: #e11d48;
    --accent-hover: #be123c;
    --accent-text: #ffffff;
    --accent-soft: rgba(225, 29, 72, 0.09);
    --accent-soft-hover: rgba(225, 29, 72, 0.16);

    --slider-track: rgba(225, 29, 72, 0.10);
    --slider-fill: #e11d48;

    --shadow-subtle: 0 2px 12px -2px rgba(190, 18, 60, 0.05), 0 1px 3px rgba(190, 18, 60, 0.03);
    --shadow-elevated: 0 12px 32px -4px rgba(190, 18, 60, 0.08), 0 4px 12px -2px rgba(190, 18, 60, 0.04);
    --shadow-modal: 0 24px 48px -8px rgba(190, 18, 60, 0.12), 0 8px 16px -4px rgba(190, 18, 60, 0.04);

    color-scheme: light;
  }
`.trim();
