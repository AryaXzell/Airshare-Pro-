import { ThemeName } from '../types';
import { BANNED_EXTENSIONS } from '../shared/banned-extensions';

export { BANNED_EXTENSIONS };

export interface ThemeColorPalette {
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  text: string;
  muted: string;
}

export interface ThemeConfig {
  id: ThemeName;
  name: string;
  swatch: string;
  isDark: boolean;
  tag: string;
  description: string;
  colors: ThemeColorPalette;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'rosegold',
    name: 'White + Rose Gold',
    swatch: '#e11d48',
    isDark: false,
    tag: 'Signature Light',
    description: 'Nuansa putih hangat dengan aksen rose gold',
    colors: {
      bg: '#fdf9fa',
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      border: 'rgba(225, 29, 72, 0.15)',
      accent: '#e11d48',
      accentSoft: 'rgba(225, 29, 72, 0.10)',
      accentText: '#ffffff',
      text: '#2b1118',
      muted: '#7d4854',
    },
  },
  {
    id: 'silver',
    name: 'Classic Silver',
    swatch: '#0071e3',
    isDark: false,
    tag: 'Light Minimal',
    description: 'Minimalis bersih dengan aksen biru klasik',
    colors: {
      bg: '#f5f5f7',
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      border: 'rgba(0, 0, 0, 0.12)',
      accent: '#0071e3',
      accentSoft: 'rgba(0, 113, 227, 0.10)',
      accentText: '#ffffff',
      text: '#1d1d1f',
      muted: '#6e6e73',
    },
  },
  {
    id: 'spacegray',
    name: 'Space Gray',
    swatch: '#34d399',
    isDark: true,
    tag: 'Dark High-Contrast',
    description: 'Gelap pekat dengan aksen zamrud mint',
    colors: {
      bg: '#0e0e11',
      surface: '#16161a',
      surfaceElevated: '#1a1a1f',
      border: 'rgba(255, 255, 255, 0.12)',
      accent: '#34d399',
      accentSoft: 'rgba(52, 211, 153, 0.14)',
      accentText: '#042f1a',
      text: '#f5f5f7',
      muted: '#94949b',
    },
  },
  {
    id: 'purple',
    name: 'Deep Purple',
    swatch: '#c084fc',
    isDark: true,
    tag: 'Dark Neon',
    description: 'Violet neon dengan aksen lavender futuristik',
    colors: {
      bg: '#0a0614',
      surface: '#160f24',
      surfaceElevated: '#1b122e',
      border: 'rgba(192, 132, 252, 0.18)',
      accent: '#c084fc',
      accentSoft: 'rgba(192, 132, 252, 0.14)',
      accentText: '#28084a',
      text: '#f8f6ff',
      muted: '#ab9bc7',
    },
  },
  {
    id: 'pacific',
    name: 'Pacific Blue',
    swatch: '#38bdf8',
    isDark: true,
    tag: 'Dark Ocean',
    description: 'Samudra malam dengan aksen biru laut',
    colors: {
      bg: '#07101d',
      surface: '#0e192d',
      surfaceElevated: '#11203b',
      border: 'rgba(56, 189, 248, 0.18)',
      accent: '#38bdf8',
      accentSoft: 'rgba(56, 189, 248, 0.14)',
      accentText: '#05263d',
      text: '#f0f8ff',
      muted: '#7cb3d4',
    },
  },
];

export const DEFAULT_AUDIO_COVER = '/default-audio-cover.svg';

export const UPLOAD_CANCELLED_MESSAGE = 'Unggahan dibatalkan oleh pengguna.';
