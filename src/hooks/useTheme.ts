import { useEffect, useState } from 'react';
import { ThemeName } from '../types';
import { THEMES } from '../lib/constants';

const THEME_STORAGE_KEY = 'airshare_theme';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === 'undefined') return 'silver';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
      if (stored && THEMES.some(t => t.id === stored)) {
        return stored;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'spacegray' : 'silver';
    } catch {
      return 'silver';
    }
  });

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      document.cookie = `${THEME_STORAGE_KEY}=${newTheme};path=/;max-age=31536000;SameSite=Strict`;
    } catch (e) {
      console.warn('Could not save theme preference:', e);
    }
  };

  useEffect(() => {
    THEMES.forEach(t => {
      document.body.classList.remove(`theme-${t.id}`);
    });
    document.body.classList.add(`theme-${theme}`);

    const currentThemeConfig = THEMES.find(t => t.id === theme);
    const isDark = currentThemeConfig?.isDark ?? false;
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  return {
    theme,
    setTheme,
    themes: THEMES,
    currentThemeInfo: THEMES.find(t => t.id === theme) || THEMES[0],
  };
}
