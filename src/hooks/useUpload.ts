import { useCallback, useRef, useState } from 'react';
import { MediaItem, MediaType, UploadProgressUpdate } from '../types';
import { mediaApiClient } from '../lib/api/mediaClient';
import { formatEta, validateMediaFile } from '../lib/utils';
import { UPLOAD_CANCELLED_MESSAGE } from '../lib/constants';
import {
  extractAudioMetadata,
  extractImageMetadata,
  extractVideoMetadata,
} from '../lib/metadata/mediaMetadata';

export interface StartUploadOptions {
  source?: 'paste' | 'manual';
}

export type UploadToastFunction = (
  msg: string,
  options?: {
    description?: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
  }
) => void;

export interface UseUploadReturn {
  isUploading: boolean;
  progress: number;
  speed: string;
  eta: string;
  statusMessage: string;
  currentFile: File | null;
  lastFailedFile: File | null;
  result: MediaItem | null;
  error: string | null;
  startUpload: (file: File, options?: StartUploadOptions) => Promise<MediaItem | null>;
  retryUpload: () => Promise<MediaItem | null>;
  cancelUpload: () => void;
  resetUpload: () => void;
  dismissError: () => void;
}

export function useUpload(
  onSuccess?: (item: MediaItem) => void,
  onToast?: UploadToastFunction
): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('—');
  const [eta, setEta] = useState('—');
  const [statusMessage, setStatusMessage] = useState('Mempersiapkan berkas...');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);
  const [result, setResult] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setStatusMessage(UPLOAD_CANCELLED_MESSAGE);
  }, []);

  const resetUpload = useCallback(() => {
    cancelUpload();
    setIsUploading(false);
    setProgress(0);
    setSpeed('—');
    setEta('—');
    setStatusMessage('');
    setCurrentFile(null);
    setLastFailedFile(null);
    setResult(null);
    setError(null);
  }, [cancelUpload]);

  const dismissError = useCallback(() => {
    setError(null);
    setLastFailedFile(null);
  }, []);

  const startUpload = useCallback(
    async (file: File, options?: StartUploadOptions): Promise<MediaItem | null> => {
      // Validate file before initiating network request
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        setLastFailedFile(file);
        setError(validation.error || 'Berkas tidak valid');
        return null;
      }

      // Check online status before initializing network request
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLastFailedFile(file);
        setError('Tidak dapat mengunggah — Anda sedang offline. Hubungkan perangkat ke internet untuk mengunggah.');
        return null;
      }

      // Post-validation feedback: if pasted from clipboard, notify user that valid media was detected
      if (options?.source === 'paste' && onToast) {
        onToast('Berkas dari clipboard terdeteksi, mengunggah...', {
          type: 'info',
        });
      }

      // Reset state but keep track of active upload
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setCurrentFile(file);
      setLastFailedFile(null);
      setResult(null);
      setIsUploading(true);
      setError(null);
      setProgress(0);
      setStatusMessage('Membaca metadata & mempersiapkan pengiriman...');

      abortControllerRef.current = new AbortController();

      let localBlobUrl: string | null = null;
      try {
        // Extract client-side metadata strictly according to validated media type
        const validation = validateMediaFile(file);
        const type: MediaType = validation.type || 'file';

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

        const metadataPayload = {
          imageMeta: type === 'image' ? imageMeta : undefined,
          videoMeta: type === 'video' ? videoMeta : undefined,
          audioMeta: type === 'audio' ? audioMeta : undefined,
        };

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

        // Attach local blobUrl for temporary session preview with strict media type isolation
        const enrichedItem: MediaItem = {
          ...uploadedMedia,
          blobUrl: localBlobUrl,
          imageMeta: uploadedMedia.type === 'image' ? (uploadedMedia.imageMeta || imageMeta) : undefined,
          videoMeta: uploadedMedia.type === 'video' ? (uploadedMedia.videoMeta || videoMeta) : undefined,
          audioMeta: uploadedMedia.type === 'audio' ? (uploadedMedia.audioMeta || audioMeta) : undefined,
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
        setLastFailedFile(file);
        if (
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.message === UPLOAD_CANCELLED_MESSAGE)
        ) {
          setError(UPLOAD_CANCELLED_MESSAGE);
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
    [onSuccess, onToast]
  );

  const retryUpload = useCallback(async (): Promise<MediaItem | null> => {
    if (lastFailedFile) {
      return startUpload(lastFailedFile);
    }
    if (currentFile) {
      return startUpload(currentFile);
    }
    return null;
  }, [currentFile, lastFailedFile, startUpload]);

  return {
    isUploading,
    progress,
    speed,
    eta,
    statusMessage,
    currentFile,
    lastFailedFile,
    result,
    error,
    startUpload,
    retryUpload,
    cancelUpload,
    resetUpload,
    dismissError,
  };
}
