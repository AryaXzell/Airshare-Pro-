import { ThemeName } from '../types';

export const THEMES: { id: ThemeName; name: string; swatch: string; isDark: boolean }[] = [
  { id: 'silver', name: 'Classic Silver', swatch: '#f5f5f7', isDark: false },
  { id: 'spacegray', name: 'Space Gray', swatch: '#1c1c1e', isDark: true },
  { id: 'purple', name: 'Deep Purple', swatch: '#a855f7', isDark: true },
  { id: 'pacific', name: 'Pacific Blue', swatch: '#0ea5e9', isDark: true },
  { id: 'rosegold', name: 'Rose Gold', swatch: '#ff3b30', isDark: false },
];

export const BANNED_EXTENSIONS = new Set([
  'exe', 'bat', 'sh', 'js', 'html', 'htm', 'php', 'py', 'pl', 'rb',
  'msi', 'cmd', 'vbs', 'com', 'scr', 'cpl', 'gadget', 'jar', 'wsf',
  'ps1', 'dll', 'apk', 'bin', 'iso'
]);

export const DEFAULT_AUDIO_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format';
