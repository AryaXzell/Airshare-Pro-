import QRCode from 'qrcode';

/**
 * Generate a PNG Data URL for a given URL or text string.
 * High contrast black & white is used to ensure reliable scanning across all mobile cameras and ambient lighting conditions.
 */
export async function generateQrDataUrl(text: string, size = 280): Promise<string> {
  if (!text || typeof text !== 'string') {
    throw new Error('Teks atau URL wajib diisi untuk membuat kode QR.');
  }

  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}
