import { Request, Response } from 'express';
import { getMediaRepository } from '../repository/media-repository';
import { analyticsRepository } from '../repository/analytics-repository';
import { checkUpstreamFileStatus } from '../storage/catbox-health-check';
import { getMaintenanceLevel } from '../security/system-config';
import { PublicMediaView } from '../../types';
import {
  renderSuccessHtml,
  renderThemedErrorHtml,
  renderFullLockdownHtml,
  renderNotFoundHtml,
  ThemedErrorOptions,
} from '../share-html';

export type { ThemedErrorOptions };

export class ShareController {
  public async renderShareLanding(req: Request, res: Response): Promise<void> {
    // Check Full Lockdown Kill Switch FIRST
    const level = await getMaintenanceLevel();
    if (level === 'full_lockdown') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(503).send(ShareController.renderFullLockdownHtml());
      return;
    }

    const rawId = req.params.id;
    const requestId =
      (req as any).id ||
      (res.getHeader('X-Request-ID') as string) ||
      `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
      res.status(400).send(
        ShareController.renderThemedErrorHtml({
          title: 'Format Tautan Tidak Valid — AirShare Pro',
          heading: 'Format Tautan Tidak Dikenali',
          message: 'Tautan berkas yang Anda buka memiliki format yang salah, kosong, atau tidak lengkap.',
          errorCode: 'ERR_INVALID_ID',
          httpStatus: 400,
          requestId,
        })
      );
      return;
    }

    const cleanId = rawId.trim();

    try {
      const repo = getMediaRepository();

      // Step 1: Check if this file was explicitly deleted (Tombstone detection)
      const tombstone = await repo.getTombstone(cleanId);
      if (tombstone) {
        const isUpstream = tombstone.reason === 'UPSTREAM_PURGED';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(410).send(
          ShareController.renderThemedErrorHtml({
            title: isUpstream
              ? 'Berkas Telah Terhapus dari Upstream — AirShare Pro'
              : 'Berkas Telah Dihapus — AirShare Pro',
            heading: isUpstream ? 'Berkas Telah Dihapus dari Catbox' : 'Berkas Telah Dihapus',
            message: isUpstream
              ? 'Media fisik pada server penyimpanan Catbox telah terhapus atau kedaluwarsa, sehingga tautan ini tidak dapat lagi diakses.'
              : 'Berkas ini telah dihapus permanen oleh pemilik unggahan atau administrator sistem dan tidak lagi tersedia di jaringan.',
            errorCode: isUpstream ? 'ERR_UPSTREAM_PURGED' : 'ERR_MEDIA_DELETED',
            httpStatus: 410,
            itemId: cleanId,
            deletedAt: tombstone.deletedAt,
            reason: tombstone.reason,
            requestId,
          })
        );
        return;
      }

      // Step 2: Fetch public record from repository
      const item = await repo.getByIdPublic(cleanId);

      if (!item) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(404).send(
          ShareController.renderThemedErrorHtml({
            title: 'Berkas Tidak Ditemukan — AirShare Pro',
            heading: 'Berkas Tidak Ditemukan',
            message: 'Tautan berkas yang Anda akses tidak terdaftar di sistem atau masa berlakunya telah habis.',
            errorCode: 'ERR_MEDIA_NOT_FOUND',
            httpStatus: 404,
            itemId: cleanId,
            requestId,
          })
        );
        return;
      }

      // Step 3: Upstream verification with Catbox Cloud Storage
      // If the media was deleted directly from upstream Catbox, purge metadata and tombstone immediately
      if (item.shareUrl) {
        const upstreamStatus = await checkUpstreamFileStatus(item.shareUrl);
        if (upstreamStatus.isPurged) {
          // Asynchronously clean up stale Redis metadata to prevent future ghost lookups
          repo.deleteForAdmin(item.id).catch(() => {});
          repo.recordTombstone(item.id, 'UPSTREAM_PURGED').catch(() => {});
          analyticsRepository.removeRecentUpload(item.id).catch(() => {});

          console.warn(`[SHARE_SYNC] File ${item.id} detected as 404/410 on Catbox upstream. Tombstone recorded.`);

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.status(410).send(
            ShareController.renderThemedErrorHtml({
              title: 'Berkas Telah Terhapus dari Catbox — AirShare Pro',
              heading: 'Berkas Telah Dihapus dari Catbox',
              message: 'Berkas ini sebelumnya tersinkronisasi, namun media fisik pada server Catbox telah dihapus atau kedaluwarsa.',
              errorCode: 'ERR_UPSTREAM_PURGED',
              httpStatus: 410,
              itemId: item.id,
              deletedAt: Date.now(),
              reason: 'Media fisik telah terhapus dari server penyimpanan Catbox upstream (HTTP 404/410)',
              upstreamUrl: item.shareUrl,
              upstreamStatus: `HTTP ${upstreamStatus.status} (Purged Upstream)`,
              requestId,
            })
          );
          return;
        }
      }

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const currentUrl = `${protocol}://${host}/s/${encodeURIComponent(item.id)}`;

      // Record share view analytics fail-safely in background
      analyticsRepository.recordShareView(item.id).catch((statErr) => {
        console.warn('[ANALYTICS_WARN] Gagal mencatat share view:', statErr);
      });

      const html = await ShareController.renderSuccessHtml(item, currentUrl, host, protocol);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, private');
      res.status(200).send(html);
    } catch (err) {
      console.error('[SHARE_CONTROLLER_ERROR]', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(500).send(
        ShareController.renderThemedErrorHtml({
          title: 'Terjadi Kesalahan Sistem — AirShare Pro',
          heading: 'Gagal Memuat Berkas',
          message: 'Terjadi kendala saat memproses permintaan berkas. Silakan coba beberapa saat lagi.',
          errorCode: 'ERR_INTERNAL_SERVER',
          httpStatus: 500,
          itemId: cleanId,
          requestId,
        })
      );
    }
  }

  public static renderNotFoundHtml(message: string): string {
    return renderNotFoundHtml(message);
  }

  public static renderFullLockdownHtml(): string {
    return renderFullLockdownHtml();
  }

  public static renderThemedErrorHtml(options: ThemedErrorOptions): string {
    return renderThemedErrorHtml(options);
  }

  public static async renderSuccessHtml(
    item: PublicMediaView,
    currentUrl: string,
    host: string,
    protocol: string
  ): Promise<string> {
    return renderSuccessHtml(item, currentUrl, host, protocol);
  }
}

export const shareController = new ShareController();
export default shareController;
