import { MediaItem, UploadOptions } from '../../types';
import { mediaApiClient } from '../api/mediaClient';
import {
  extractAudioMetadata,
  extractImageMetadata,
  extractVideoMetadata,
} from '../metadata/mediaMetadata';

export interface UploadResult {
  success: boolean;
  shareUrl: string;
  mediaItem: MediaItem;
}

export class UploadService {
  private static instance: UploadService;

  public static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }
    return UploadService.instance;
  }

  public async upload(
    file: File,
    options?: UploadOptions
  ): Promise<UploadResult> {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    let imageMeta;
    let videoMeta;
    let audioMeta;

    if (isImage) {
      imageMeta = await extractImageMetadata(file);
    } else if (isVideo) {
      videoMeta = await extractVideoMetadata(file);
    } else if (isAudio) {
      audioMeta = await extractAudioMetadata(file);
    }

    const metadataPayload = { imageMeta, videoMeta, audioMeta };

    const localBlobUrl = URL.createObjectURL(file);

    const mediaObject = await mediaApiClient.uploadFile(
      file,
      metadataPayload,
      options?.onProgress,
      options?.signal
    );

    const fullItem: MediaItem = {
      ...mediaObject,
      blobUrl: localBlobUrl,
      imageMeta: mediaObject.imageMeta || imageMeta,
      videoMeta: mediaObject.videoMeta || videoMeta,
      audioMeta: mediaObject.audioMeta || audioMeta,
    };

    return {
      success: true,
      shareUrl: fullItem.shareUrl,
      mediaItem: fullItem,
    };
  }
}

export const uploadService = UploadService.getInstance();
