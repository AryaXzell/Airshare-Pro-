import { useEffect } from 'react';

interface UsePasteUploadOptions {
  onFilePasted: (file: File) => void;
  isEnabled?: boolean;
  onToast?: (
    msg: string,
    options?: {
      description?: string;
      type?: 'success' | 'error' | 'warning' | 'info';
    }
  ) => void;
}

/**
 * Custom hook to intercept clipboard paste events (Ctrl+V / Cmd+V)
 * and trigger direct file upload when an image, audio, or video is in the clipboard.
 */
export function usePasteUpload({
  onFilePasted,
  isEnabled = true,
  onToast,
}: UsePasteUploadOptions): void {
  useEffect(() => {
    if (!isEnabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      // Ignore if user is currently typing in an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        // Only allow paste upload if it's strictly a file and NOT plain text
        const hasText = e.clipboardData?.types.includes('text/plain');
        if (hasText) return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const items = Array.from(clipboardData.items);
      const fileItem = items.find((item) => item.kind === 'file');

      if (!fileItem) return;

      const file = fileItem.getAsFile();
      if (!file) return;

      // Prevent default browser paste behavior
      e.preventDefault();

      // Ensure file has a descriptive filename if default is generic (e.g. image.png)
      let finalFile = file;
      const isGenericName =
        !file.name ||
        file.name === 'image.png' ||
        file.name === 'blob' ||
        file.name === 'unknown';

      if (isGenericName) {
        const ext = file.type.split('/')[1] || 'png';
        const timestamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[-:]/g, '')
          .replace('T', '_');
        const customName = `clipboard_${timestamp}.${ext}`;
        finalFile = new File([file], customName, { type: file.type });
      }

      if (onToast) {
        onToast('Berkas dari clipboard terdeteksi, memulai unggahan...', {
          type: 'info',
        });
      }

      onFilePasted(finalFile);
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [onFilePasted, isEnabled, onToast]);
}
