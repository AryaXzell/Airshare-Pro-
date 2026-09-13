import { Request, Response } from 'express';
import { getMediaRepository } from '../repository/media-repository';
import { analyticsRepository } from '../repository/analytics-repository';
import { deletedFilesRepository } from '../repository/deleted-files-repository';
import { auditLogRepository } from '../repository/audit-log-repository';
import { removeSyncCheckItem } from '../storage/catbox-health-check';
import { CatboxStorageProvider } from '../storage/catbox-storage-provider';
import { getClientIp } from '../security/client-ip';

const storageProvider = new CatboxStorageProvider();

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function deletePermanent(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Parameter ID berkas wajib diisi.' },
      });
      return;
    }

    const mediaRepo = getMediaRepository();
    // Retrieve file record via getByIdForAdmin (never expose sessionId in response)
    const item = await mediaRepo.getByIdForAdmin(id);

    // If item not found in repository, still attempt Catbox deletion if id is valid
    const targetUrlOrId = item ? (item.shareUrl || item.id) : id;
    const itemName = item?.name || id;

    // Call Catbox storage provider delete (uses reqtype=deletefiles & CATBOX_USERHASH)
    const catboxResult = await storageProvider.delete(targetUrlOrId);

    // Clean up all database keys in MediaRepository (Redis / In-memory)
    await mediaRepo.deleteForAdmin(id);

    // Clean up analytics recent uploads cache and all daily stat footprints
    await analyticsRepository.removeRecentUpload(id);
    await analyticsRepository.removeFileFromAllStats(id);
    await analyticsRepository.recordDeletion(1);

    // Clean up sync check broken item if recorded
    await removeSyncCheckItem(id);

    // Record into Deleted Files Archive
    await deletedFilesRepository.recordDeleted({
      id,
      name: itemName,
      formattedSize: item?.formattedSize || '-',
      type: (item?.type as any) || 'file',
      shareUrl: item?.shareUrl || targetUrlOrId,
      deletedAt: Date.now(),
      deletedBy: 'admin',
      reason: 'Admin menghapus berkas permanen dari dashboard',
    });

    // Record Security Audit Log
    const clientIp = getClientIp(req);
    await auditLogRepository.recordAction({
      type: 'PERMANENT_DELETE',
      detail: `Hapus permanen berkas "${itemName}" (ID: ${id}) dari Catbox & database. Status Catbox: ${
        catboxResult.success ? 'BERHASIL' : 'GAGAL (' + catboxResult.message + ')'
      }`,
      ip: clientIp,
    });

    console.log(
      `[ADMIN AUDIT] Permanent delete media ID: ${id}, name: "${itemName}", Catbox response: ${
        catboxResult.success ? 'SUCCESS' : catboxResult.message
      }`
    );

    res.json({
      success: true,
      message: catboxResult.success
        ? `Berkas "${itemName}" berhasil dihapus permanen dari server Catbox dan database AirShare.`
        : `Berkas "${itemName}" dihapus dari database AirShare (${catboxResult.message}).`,
      catboxDeleted: catboxResult.success,
      warning: !catboxResult.success,
    });
  } catch (err: unknown) {
    console.error('[DELETE_PERMANENT_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Gagal menghapus berkas permanen. Silakan coba lagi.' },
    });
  }
}

export async function deleteHistoryOnly(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Parameter ID berkas wajib diisi.' },
      });
      return;
    }

    const clientIp = getClientIp(req);
    const mediaRepo = getMediaRepository();
    const item = await mediaRepo.getByIdForAdmin(id);

    await mediaRepo.deleteForAdmin(id);
    await analyticsRepository.removeRecentUpload(id);
    await analyticsRepository.removeFileFromAllStats(id);
    await analyticsRepository.recordDeletion(1);
    await removeSyncCheckItem(id);

    await deletedFilesRepository.recordDeleted({
      id,
      name: item?.name || id,
      formattedSize: item?.formattedSize || '-',
      type: (item?.type as any) || 'file',
      shareUrl: item?.shareUrl || '#',
      deletedAt: Date.now(),
      deletedBy: 'admin',
      reason: 'Admin membersihkan riwayat database lokal',
    });

    await auditLogRepository.recordAction({
      type: 'HISTORY_DELETE',
      detail: `Pembersihan riwayat database lokal untuk berkas ID: ${id}`,
      ip: clientIp,
    });

    console.log(`[ADMIN AUDIT] History-only cleanup for media ID: ${id}`);

    res.json({
      success: true,
      message: `Berkas ${id} berhasil dibersihkan dari riwayat database AirShare.`,
    });
  } catch (err: unknown) {
    console.error('[DELETE_HISTORY_ONLY_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_FAILED', message: 'Gagal membersihkan riwayat berkas. Silakan coba lagi.' },
    });
  }
}

export async function searchFiles(req: Request, res: Response): Promise<void> {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) {
      res.json({ success: true, data: { items: [], total: 0 } });
      return;
    }

    const allRecent = await analyticsRepository.getRecentUploads(500);
    const matched = allRecent.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.originalFileName && item.originalFileName.toLowerCase().includes(query))
    );

    const enriched = await Promise.all(
      matched.map(async (m) => {
        const views = await analyticsRepository.getViewCount(m.id);
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          size: m.size,
          formattedSize: m.formattedSize,
          createdAt: m.createdAt,
          uploaderCountryCode: m.uploaderCountryCode,
          views,
          shareUrl: m.shareUrl,
        };
      })
    );

    res.json({
      success: true,
      data: {
        query,
        items: enriched,
        total: enriched.length,
      },
    });
  } catch (err: unknown) {
    console.error('[SEARCH_FILES_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_FAILED', message: 'Gagal mencari berkas. Silakan coba lagi.' },
    });
  }
}

export async function previewBulkCleanup(req: Request, res: Response): Promise<void> {
  try {
    const olderThanDays = Number(req.body?.olderThanDays) || 0;
    const maxViews = req.body?.maxViews !== undefined ? Number(req.body.maxViews) : 0;

    const now = Date.now();
    const cutoffTime = olderThanDays > 0 ? now - olderThanDays * 24 * 60 * 60 * 1000 : now;

    const allRecent = await analyticsRepository.getRecentUploads(500);

    const candidates = [];
    let totalBytes = 0;

    for (const item of allRecent) {
      if (olderThanDays > 0 && item.createdAt > cutoffTime) {
        continue;
      }
      const views = await analyticsRepository.getViewCount(item.id);
      if (views <= maxViews) {
        candidates.push({
          id: item.id,
          name: item.name,
          formattedSize: item.formattedSize,
          size: item.size || 0,
          createdAt: item.createdAt,
          views,
        });
        totalBytes += item.size || 0;
      }
    }

    res.json({
      success: true,
      data: {
        total: candidates.length,
        totalBytes,
        formattedTotalBytes: formatBytes(totalBytes),
        items: candidates.slice(0, 100),
      },
    });
  } catch (err: unknown) {
    console.error('[PREVIEW_BULK_CLEANUP_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'PREVIEW_FAILED', message: 'Gagal memuat pratinjau pembersihan massal. Silakan coba lagi.' },
    });
  }
}

export async function executeBulkCleanup(req: Request, res: Response): Promise<void> {
  try {
    const { olderThanDays, maxViews, confirm } = req.body || {};
    if (!confirm) {
      res.status(400).json({
        success: false,
        error: { code: 'CONFIRMATION_REQUIRED', message: 'Konfirmasi eksplisit diperlukan untuk eksekusi pembersihan massal.' },
      });
      return;
    }

    const clientIp = getClientIp(req);
    const days = Number(olderThanDays) || 0;
    const viewsLimit = maxViews !== undefined ? Number(maxViews) : 0;
    const now = Date.now();
    const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1000 : now;

    const mediaRepo = getMediaRepository();
    const allRecent = await analyticsRepository.getRecentUploads(500);

    let succeeded = 0;
    let failed = 0;
    let freedBytes = 0;

    for (const item of allRecent) {
      if (days > 0 && item.createdAt > cutoffTime) {
        continue;
      }
      const views = await analyticsRepository.getViewCount(item.id);
      if (views <= viewsLimit) {
        try {
          await storageProvider.delete(item.shareUrl || item.id);
          await mediaRepo.deleteForAdmin(item.id);
          await analyticsRepository.removeRecentUpload(item.id);
          await analyticsRepository.removeFileFromAllStats(item.id);
          await removeSyncCheckItem(item.id);
          await deletedFilesRepository.recordDeleted({
            id: item.id,
            name: item.name || item.id,
            formattedSize: item.formattedSize || '-',
            type: (item.type as any) || 'file',
            shareUrl: item.shareUrl || '#',
            deletedAt: Date.now(),
            deletedBy: 'bulk_cleanup',
            reason: `Pembersihan massal (kriteria usia > ${days} hari, views <= ${viewsLimit})`,
          });
          succeeded++;
          freedBytes += item.size || 0;
        } catch (err) {
          failed++;
        }
      }
    }

    if (succeeded > 0) {
      await analyticsRepository.recordDeletion(succeeded);
    }

    await auditLogRepository.recordAction({
      type: 'BULK_CLEANUP',
      detail: `Pembersihan massal (Kriteria: usia > ${days} hari, views <= ${viewsLimit}): Berhasil menghapus ${succeeded} berkas, gagal ${failed}. Total penyimpanan dibebaskan: ${formatBytes(freedBytes)}`,
      ip: clientIp,
    });

    res.json({
      success: true,
      data: {
        succeeded,
        failed,
        freedBytes,
        formattedFreedBytes: formatBytes(freedBytes),
      },
    });
  } catch (err: unknown) {
    console.error('[EXECUTE_BULK_CLEANUP_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'BULK_CLEANUP_FAILED', message: 'Gagal menjalankan pembersihan massal. Silakan coba lagi.' },
    });
  }
}

export async function clearDeletedHistory(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    const count = await deletedFilesRepository.clearAll();

    await auditLogRepository.recordAction({
      type: 'HISTORY_DELETE',
      detail: `Admin membersihkan seluruh arsip riwayat berkas terhapus (${count} arsip dibersihkan)`,
      ip: clientIp,
    });

    res.json({
      success: true,
      clearedCount: count,
      message: `Berhasil membersihkan ${count} riwayat berkas terhapus.`,
    });
  } catch (err: unknown) {
    console.error('[CLEAR_DELETED_HISTORY_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'CLEAR_HISTORY_FAILED', message: 'Gagal membersihkan riwayat berkas terhapus. Silakan coba lagi.' },
    });
  }
}

export async function getDeletedFiles(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const items = await deletedFilesRepository.getDeletedFiles(limit);
    res.json({
      success: true,
      data: {
        items,
        total: items.length,
      },
    });
  } catch (err: unknown) {
    console.error('[GET_DELETED_FILES_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'GET_DELETED_FILES_FAILED', message: 'Gagal memuat daftar berkas terhapus. Silakan coba lagi.' },
    });
  }
}
