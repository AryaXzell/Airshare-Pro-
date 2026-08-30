export type MediaType = 'image' | 'video' | 'audio';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
}

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
}

export interface MediaItem {
  id: string;
  name: string;
  originalFileName: string;
  size: number;
  formattedSize: string;
  type: MediaType;
  mimeType: string;
  blobUrl?: string; // Client-side temporary preview URL
  shareUrl: string; // Real production URL from storage provider (e.g. Catbox)
  provider: 'catbox' | 'local' | 's3';
  createdAt: number;
  audioMeta?: AudioMetadata;
  videoMeta?: VideoMetadata;
  imageMeta?: ImageMetadata;
}

// Normalized Media Object for API and Repository
export type MediaObject = MediaItem;

export type UploadStage =
  | 'idle'
  | 'validating'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'error';

export interface UploadProgressUpdate {
  stage: UploadStage;
  loaded: number;
  total: number;
  percentage: number;
  speedBytesPerSec: number;
  speedFormatted: string;
  etaSeconds: number;
  statusMessage: string;
}

export interface UploadOptions {
  onProgress?: (update: UploadProgressUpdate) => void;
  signal?: AbortSignal;
}

export interface StorageUploadResult {
  id: string;
  url: string;
  provider: 'catbox' | string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface StorageDeleteResult {
  success: boolean;
  supported: boolean;
  message?: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(
    fileBuffer: Buffer | Uint8Array | Blob,
    filename: string,
    mimeType: string
  ): Promise<StorageUploadResult>;
  delete(idOrUrl: string): Promise<StorageDeleteResult>;
  isDeleteSupported(): boolean;
}

export interface MediaRepository {
  create(media: MediaObject): Promise<MediaObject>;
  list(limit?: number): Promise<MediaObject[]>;
  get(id: string): Promise<MediaObject | null>;
  delete(id: string): Promise<boolean>;
  clearAll(): Promise<void>;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type ThemeName =
  | 'silver'
  | 'spacegray'
  | 'purple'
  | 'pacific'
  | 'rosegold';

export interface ToastInfo {
  id: string;
  message: string;
  description?: string;
  type?: 'success' | 'error' | 'info';
}
