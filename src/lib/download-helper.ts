/**
 * Downloads a media file reliably across modern browsers, handling CORS and blob creation.
 */
export async function downloadMediaFile(url: string, filename: string): Promise<void> {
  try {
    // 1. Try direct fetch to blob for seamless same-origin or CORS-enabled downloads
    const response = await fetch(url, { credentials: 'omit', mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 1500);
      return;
    }
  } catch {
    // If fetch failed due to CORS or network, proceed to anchor click fallback
  }

  // 2. Direct anchor click fallback
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 1500);
}
