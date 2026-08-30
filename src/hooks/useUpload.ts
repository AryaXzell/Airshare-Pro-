import { useCallback, useRef, useState } from 'react';
import { MediaItem, MediaType, UploadProgressUpdate } from '../types';
import { mediaApiClient } from '../lib/api/mediaClient';
import { formatEta, validateMediaFile } from '../lib/utils';
import {
  extractAudioMetadata,
  extractImageMetadata,
  extractVideoMetadata,
} from '../lib/metadata/mediaMetadata';

export interface UseUploadReturn {
  isUploading: boolean;
  progress: number;
  speed: string;
  eta: string;
  statusMessage: string;
  currentFile: File | null;
  result: MediaItem | null;
  error: string | null;
  startUpload: (file: File) => Promise<MediaItem | null>;
  cancelUpload: () => void;
  resetUpload: () => void;
}

export function useUpload(onSuccess?: (item: MediaItem) => void): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('—');
  const [eta, setEta] = useState('—');
  const [statusMessage, setStatusMessage] = useState('Mempersiapkan berkas...');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [result, setResult] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setStatusMessage('Unggahan dibatalkan');
  }, []);

  const resetUpload = useCallback(() => {
    cancelUpload();
    setIsUploading(false);
    setProgress(0);
    setSpeed('—');
    setEta('—');
    setStatusMessage('');
    setCurrentFile(null);
    setResult(null);
    setError(null);
  }, [cancelUpload]);

  const startUpload = useCallback(
    async (file: File): Promise<MediaItem | null> => {
      // Validate file before initiating network request
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        setError(validation.error || 'Berkas tidak valid');
        return null;
      }

      resetUpload();
      setCurrentFile(file);
      setIsUploading(true);
      setError(null);
      setProgress(0);
      setStatusMessage('Membaca metadata & mempersiapkan pengiriman...');

      abortControllerRef.current = new AbortController();

      let localBlobUrl: string | null = null;
      try {
        // Extract client-side metadata
        const type: MediaType = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
          ? 'video'
          : 'audio';

        let imageMeta;
        let videoMeta;
        let audioMeta;

        if (type === 'image') {
          imageMeta = await extractImageMetadata(file);
        } else if (type === 'video') {
          videoMeta = await extractVideoMetadata(file);
        } else if (type === 'audio') {
          audioMeta = await extractAudioMetadata(file);
        }

        const metadataPayload = { imageMeta, videoMeta, audioMeta };

        // Create temporary blob URL for instant preview capability
        localBlobUrl = URL.createObjectURL(file);

        // Upload through backend API to Catbox
        const uploadedMedia = await mediaApiClient.uploadFile(
          file,
          metadataPayload,
          (update: UploadProgressUpdate) => {
            setProgress(update.percentage);
            setSpeed(update.speedFormatted);
            setEta(formatEta(update.etaSeconds));
            setStatusMessage(update.statusMessage);
          },
          abortControllerRef.current.signal
        );

        // Attach local blobUrl for temporary session preview
        const enrichedItem: MediaItem = {
          ...uploadedMedia,
          blobUrl: localBlobUrl,
          imageMeta: uploadedMedia.imageMeta || imageMeta,
          videoMeta: uploadedMedia.videoMeta || videoMeta,
          audioMeta: uploadedMedia.audioMeta || audioMeta,
        };

        setResult(enrichedItem);
        setIsUploading(false);

        if (onSuccess) {
          onSuccess(enrichedItem);
        }

        return enrichedItem;
      } catch (err: unknown) {
        if (localBlobUrl) {
          try {
            URL.revokeObjectURL(localBlobUrl);
          } catch {
            // ignore
          }
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Unggahan dibatalkan.');
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : 'Terjadi kesalahan saat mengunggah berkas ke Catbox.';
          setError(msg);
        }
        setIsUploading(false);
        return null;
      }
    },
    [onSuccess, resetUpload]
  );

  return {
    isUploading,
    progress,
    speed,
    eta,
    statusMessage,
    currentFile,
    result,
    error,
    startUpload,
    cancelUpload,
    resetUpload,
  };
}
