import { copyToClipboard, getPublicShareUrl } from './utils';

export type ToastFunction = (
  msg: string,
  options?: {
    description?: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
  }
) => void;

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'AbortError'
  ) {
    return true;
  }
  return false;
}

/**
 * Share a single media item via Web Share API if supported;
 * falls back to clipboard copying with an explicit informative message.
 */
export async function shareSingleMedia(
  item: { id: string; name: string; shareUrl: string; publicShareUrl?: string },
  onToast: ToastFunction
): Promise<void> {
  const targetUrl = getPublicShareUrl(item);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: item.name,
        text: `Berkas ${item.name} di AirShare Pro`,
        url: targetUrl,
      });
      return; // Native share sheet displayed; visual feedback provided by OS
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return; // User explicitly dismissed share sheet, no toast needed
      }
    }
  }

  // Fallback: Copy URL to clipboard and explicitly inform the user
  const ok = await copyToClipboard(targetUrl);
  if (ok) {
    onToast(
      'Berbagi langsung tidak didukung perangkat ini — tautan disalin ke clipboard sebagai gantinya.',
      { type: 'info' }
    );
  } else {
    onToast('Gagal menyalin tautan ke clipboard.', { type: 'error' });
  }
}

/**
 * Share multiple media URLs via Web Share API if supported;
 * falls back to clipboard copying with an explicit informative message.
 */
export async function shareBulkMedia(
  urls: string[],
  onToast: ToastFunction
): Promise<void> {
  if (urls.length === 0) return;
  const text = urls.join('\n');

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `${urls.length} Berkas AirShare Pro`,
        text: `Daftar berkas terunggah:\n${text}`,
      });
      return; // Native share sheet displayed; visual feedback provided by OS
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return; // User explicitly dismissed share sheet, no toast needed
      }
    }
  }

  // Fallback: Copy all URLs to clipboard and explicitly inform the user
  const ok = await copyToClipboard(text);
  if (ok) {
    onToast(
      `Berbagi langsung tidak didukung — ${urls.length} tautan disalin ke clipboard sebagai gantinya.`,
      { type: 'info' }
    );
  } else {
    onToast('Gagal menyalin tautan ke clipboard.', { type: 'error' });
  }
}
