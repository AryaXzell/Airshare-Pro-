import { ThemeName } from '../types';
import { BANNED_EXTENSIONS } from '../shared/banned-extensions';

export { BANNED_EXTENSIONS };

export const THEMES: { id: ThemeName; name: string; swatch: string; isDark: boolean }[] = [
  { id: 'rosegold', name: 'White + Rose Gold', swatch: '#f43f5e', isDark: false },
  { id: 'silver', name: 'Classic Silver', swatch: '#e2e8f0', isDark: false },
  { id: 'spacegray', name: 'Space Gray', swatch: '#1c1c1e', isDark: true },
  { id: 'purple', name: 'Deep Purple', swatch: '#a855f7', isDark: true },
  { id: 'pacific', name: 'Pacific Blue', swatch: '#0ea5e9', isDark: true },
];

export const DEFAULT_AUDIO_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format';

export const UPLOAD_CANCELLED_MESSAGE = 'Unggahan dibatalkan oleh pengguna.';
