import { AudioMetadata, ImageMetadata, VideoMetadata } from '../../types';

// Helper to decode ID3 syncsafe integers
function readSyncsafeInteger(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

// Decode text frames based on ID3 encoding byte
function decodeFrameText(bytes: Uint8Array, encodingByte: number): string {
  try {
    if (encodingByte === 0) {
      // ISO-8859-1 (Latin1)
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) break; // null terminator
        str += String.fromCharCode(bytes[i]);
      }
      return str.trim();
    } else if (encodingByte === 1 || encodingByte === 2) {
      // UTF-16 with BOM
      const decoder = new TextDecoder(encodingByte === 2 ? 'utf-16be' : 'utf-16');
      return decoder.decode(bytes).replace(/\0/g, '').trim();
    } else if (encodingByte === 3) {
      // UTF-8
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(bytes).replace(/\0/g, '').trim();
    }
  } catch {
    // fallback ascii
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] >= 32 && bytes[i] <= 126) str += String.fromCharCode(bytes[i]);
    }
    return str.trim();
  }
  return '';
}

// Parse ID3v2 tags from File ArrayBuffer
async function parseId3Tags(file: File): Promise<Partial<AudioMetadata>> {
  try {
    // Read first 256KB to find ID3 header and frames
    const sliceSize = Math.min(file.size, 256 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    // Check "ID3" identifier
    if (
      uint8[0] !== 0x49 || // 'I'
      uint8[1] !== 0x44 || // 'D'
      uint8[2] !== 0x33    // '3'
    ) {
      return {};
    }

    const majorVersion = view.getUint8(3); // 3 for ID3v2.3, 4 for ID3v2.4
    const tagSize = readSyncsafeInteger(view, 6);
    const headerEnd = 10;
    const maxOffset = Math.min(headerEnd + tagSize, sliceSize);

    let offset = headerEnd;
    const result: Partial<AudioMetadata> = {};

    while (offset < maxOffset - 10) {
      // Read frame ID (4 chars)
      let frameId = '';
      for (let i = 0; i < 4; i++) {
        frameId += String.fromCharCode(uint8[offset + i]);
      }

      if (!/^[A-Z0-9]{4}$/.test(frameId)) {
        break; // Reached padding or unknown
      }

      let frameSize = 0;
      if (majorVersion === 4) {
        frameSize = readSyncsafeInteger(view, offset + 4);
      } else {
        frameSize = view.getUint32(offset + 4);
      }

      if (frameSize <= 0 || offset + 10 + frameSize > sliceSize) {
        break;
      }

      const frameDataOffset = offset + 10;
      const frameData = uint8.slice(frameDataOffset, frameDataOffset + frameSize);

      if (frameData.length > 1) {
        const encoding = frameData[0];
        const contentBytes = frameData.slice(1);

        if (frameId === 'TIT2') {
          // Title
          result.title = decodeFrameText(contentBytes, encoding);
        } else if (frameId === 'TPE1' || frameId === 'TPE2') {
          // Artist
          if (!result.artist) {
            result.artist = decodeFrameText(contentBytes, encoding);
          }
        } else if (frameId === 'TALB') {
          // Album
          result.album = decodeFrameText(contentBytes, encoding);
        } else if (frameId === 'APIC' && !result.coverUrl) {
          // Attached picture (Cover Artwork)
          try {
            let pOffset = 1;
            // Read mime type (terminated with 0x00)
            let mimeType = '';
            while (pOffset < frameData.length && frameData[pOffset] !== 0) {
              mimeType += String.fromCharCode(frameData[pOffset]);
              pOffset++;
            }
            pOffset++; // skip null
            pOffset++; // skip picture type (1 byte)

            // Skip description string
            if (encoding === 1 || encoding === 2) {
              // 2 null bytes for utf-16
              while (pOffset < frameData.length - 1 && !(frameData[pOffset] === 0 && frameData[pOffset + 1] === 0)) {
                pOffset += 2;
              }
              pOffset += 2;
            } else {
              while (pOffset < frameData.length && frameData[pOffset] !== 0) {
                pOffset++;
              }
              pOffset++;
            }

            if (pOffset < frameData.length) {
              const imgBytes = frameData.slice(pOffset);
              let binary = '';
              const len = imgBytes.byteLength;
              for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(imgBytes[i]);
              }
              const base64 = btoa(binary);
              result.coverUrl = `data:${mimeType || 'image/jpeg'};base64,${base64}`;
            }
          } catch (e) {
            console.warn('Could not extract APIC frame:', e);
          }
        }
      }

      offset += 10 + frameSize;
    }

    return result;
  } catch (err) {
    console.warn('ID3 parsing error:', err);
    return {};
  }
}

export async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  const fallbackTitle = file.name.replace(/\.[^/.]+$/, '');
  let artist = '';
  let title = fallbackTitle;

  // Parse "Artist - Title" format from filename if available
  if (fallbackTitle.includes(' - ')) {
    const parts = fallbackTitle.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  const id3 = await parseId3Tags(file);

  return {
    title: id3.title || title,
    artist: id3.artist || artist || 'Artis Tidak Dikenal',
    album: id3.album,
    coverUrl: id3.coverUrl,
  };
}

export async function extractImageMetadata(file: File): Promise<ImageMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    video.src = url;
  });
}
