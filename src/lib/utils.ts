import { BANNED_EXTENSIONS } from './constants';
import { MediaType } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatEta(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.ceil(seconds % 60);
  return `${mins}m ${remSecs}s`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function validateMediaFile(file: File): { valid: boolean; error?: string; type?: MediaType } {
  const nameParts = file.name.split('.');
  const ext = nameParts.length > 1 ? nameParts.pop()?.toLowerCase() || '' : '';

  if (BANNED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Format berkas .${ext} dilarang demi keamanan sistem.`
    };
  }

  if (file.type.startsWith('image/')) {
    return { valid: true, type: 'image' };
  }
  if (file.type.startsWith('video/')) {
    return { valid: true, type: 'video' };
  }
  if (file.type.startsWith('audio/')) {
    return { valid: true, type: 'audio' };
  }

  // Check common extensions fallback if MIME type is missing or generic
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic'];
  const videoExts = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'];
  const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];

  if (imageExts.includes(ext)) return { valid: true, type: 'image' };
  if (videoExts.includes(ext)) return { valid: true, type: 'video' };
  if (audioExts.includes(ext)) return { valid: true, type: 'audio' };

  return {
    valid: false,
    error: 'Hanya format gambar, video, atau audio yang didukung.'
  };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  // Fallback for older browsers or non-secure contexts
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export function generateSlug(length = 7): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
