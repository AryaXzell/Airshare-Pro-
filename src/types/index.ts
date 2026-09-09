export type MediaType = 'image' | 'video' | 'audio' | 'file';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  coverWidth?: number;
  coverHeight?: number;
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
  publicShareUrl?: string; // Public landing URL with Open Graph preview (/s/:id)
  provider: 'catbox' | 'local' | 's3';
  createdAt: number;
  sessionId?: string; // Anonymous session scoping ID
  uploaderCountryCode?: string; // ISO 3166-1 alpha-2, e.g. "ID", "US"
  uploaderCountryName?: string; // Human readable country name, e.g. "Indonesia"
  audioMeta?: AudioMetadata;
  videoMeta?: VideoMetadata;
  imageMeta?: ImageMetadata;
  isTextPreviewable?: boolean;
  textLanguageHint?: string; // e.g. "javascript", "typescript", "html", "css", "json", "plaintext"
}

// Normalized Media Object for API and Repository
export type MediaObject = MediaItem;

// Explicit, safe public projection for share landing (never exposes sessionId or internal tracking)
export interface PublicMediaView {
  id: string;
  name: string;
  originalFileName: string;
  type: MediaType;
  mimeType: string;
  size: number;
  formattedSize: string;
  shareUrl: string;
  uploaderCountryCode?: string;
  uploaderCountryName?: string;
  audioMeta?: AudioMetadata;
  videoMeta?: VideoMetadata;
  imageMeta?: ImageMetadata;
  createdAt: number;
  isTextPreviewable?: boolean;
  textLanguageHint?: string;
}

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

export interface MediaTombstone {
  id: string;
  deletedAt: number;
  reason: 'USER_DELETED' | 'USER_CLEARED' | 'ADMIN_DELETED' | 'UPSTREAM_PURGED' | string;
}

export interface MediaRepository {
  create(media: MediaObject): Promise<MediaObject>;
  list(sessionId: string, limit?: number): Promise<MediaObject[]>;
  get(id: string, sessionId: string): Promise<MediaObject | null>;
  getByIdPublic(id: string): Promise<PublicMediaView | null>;
  delete(id: string, sessionId: string): Promise<boolean>;
  clearAll(sessionId: string): Promise<void>;
  getTombstone(id: string): Promise<MediaTombstone | null>;
  recordTombstone(id: string, reason: string): Promise<void>;

  /**
   * Internal Administrative Method ONLY.
   * Allows the authenticated admin panel to look up a media item across all sessions.
   * This method is STRICTLY for internal admin controllers and MUST NOT be exposed directly
   * to public APIs or clients without explicit authorization and field sanitization.
   */
  getByIdForAdmin(id: string): Promise<MediaObject | null>;

  /**
   * Internal Administrative Method ONLY.
   * Deletes a media item permanently across all sessions, indices, and lookup keys.
   */
  deleteForAdmin(id: string): Promise<boolean>;
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

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc';

export type ViewMode = 'grid' | 'list';

export interface ToastInfo {
  id: string;
  message: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

export interface DailyStats {
  date: string;
  uploads: number;
  bytes: number;
  formattedBytes: string;
  totalViews: number;
  averageFileSize: number;
  formattedAverageSize: string;
  byType: Record<string, number>;
  byCountry: Record<string, number>;
}

export interface WeeklyTrendItem {
  date: string;
  uploads: number;
  bytes: number;
  formattedBytes: string;
  views: number;
}

export interface AdminDashboardData {
  today: DailyStats;
  weeklyTrend: WeeklyTrendItem[];
  topFiles: {
    id: string;
    name: string;
    views: number;
    formattedSize: string;
    type: MediaType;
    shareUrl: string;
  }[];
  recentUploads: (MediaObject & {
    views: number;
    maskedSessionId: string;
  })[];
  systemHealth: {
    redisConnected: boolean;
    storageMode: 'upstash' | 'in-memory';
    totalItemsInRepo: number;
    uptimeSeconds: number;
  };
  recommendations: string[];
  adminPanelPath: string;
}
