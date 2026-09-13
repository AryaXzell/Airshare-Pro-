import { Request, Response } from 'express';
import { analyticsRepository } from '../repository/analytics-repository';
import { getMediaRepository } from '../repository/media-repository';
import { deletedFilesRepository } from '../repository/deleted-files-repository';
import { auditLogRepository } from '../repository/audit-log-repository';
import {
  verifyFilesBatch,
  saveLastSyncCheck,
  removeSyncCheckItem,
  SyncCheckSummary,
} from '../storage/catbox-health-check';
import { getClientIp } from '../security/client-ip';

export async function runSyncCheck(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    // Check recent uploads up to 50 items
    const recentUploads = await analyticsRepository.getRecentUploads(50);
    if (!recentUploads || recentUploads.length === 0) {
      const emptySummary: SyncCheckSummary = {
        timestamp: Date.now(),
        totalChecked: 0,
        healthyCount: 0,
        brokenCount: 0,
        brokenItems: [],
      };
      await saveLastSyncCheck(emptySummary);
      res.json({
        success: true,
        ...emptySummary,
      });
      return;
    }

    const filesToCheck = recentUploads.map((u) => ({
      id: u.id,
      shareUrl: u.shareUrl,
      name: u.name,
      formattedSize: u.formattedSize,
      createdAt: u.createdAt,
    }));

    // Verify batch with concurrency limit of 5 to avoid overwhelming Catbox
    const batchResults = await verifyFilesBatch(filesToCheck, 5);
    const brokenItems = batchResults
      .filter((r) => !r.exists)
      .map((r) => r.item);
    const healthyCount = batchResults.filter((r) => r.exists).length;

    const summary: SyncCheckSummary = {
      timestamp: Date.now(),
      totalChecked: batchResults.length,
      healthyCount,
      brokenCount: brokenItems.length,
      brokenItems,
    };
    await saveLastSyncCheck(summary);

    await auditLogRepository.recordAction({
      type: 'SYNC_CHECK',
      detail: `Pemeriksaan sinkronisasi selesai: ${summary.totalChecked} berkas diperiksa, ${summary.healthyCount} sehat, ${summary.brokenCount} broken/hilang`,
      ip: clientIp,
    });

    console.log(
      `[ADMIN AUDIT] Sync check completed: ${summary.totalChecked} checked, ${summary.healthyCount} healthy, ${summary.brokenCount} broken.`
    );

    res.json({
      success: true,
      timestamp: summary.timestamp,
      totalChecked: summary.totalChecked,
      healthyCount: summary.healthyCount,
      brokenCount: summary.brokenCount,
      brokenItems: summary.brokenItems,
    });
  } catch (err: unknown) {
    console.error('[RUN_SYNC_CHECK_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'SYNC_CHECK_FAILED', message: 'Gagal menjalankan pemeriksaan sinkronisasi berkas. Silakan coba lagi.' },
    });
  }
}

export async function purgeBrokenFiles(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    const mediaRepo = getMediaRepository();
    const recentUploads = await analyticsRepository.getRecentUploads(100);

    const filesToCheck = recentUploads.map((u) => ({
      id: u.id,
      shareUrl: u.shareUrl,
      name: u.name,
      formattedSize: u.formattedSize,
      createdAt: u.createdAt,
    }));

    const batchResults = await verifyFilesBatch(filesToCheck, 5);
    let purgedCount = 0;

    for (const resItem of batchResults) {
      if (!resItem.exists) {
        await mediaRepo.deleteForAdmin(resItem.item.id);
        await analyticsRepository.removeRecentUpload(resItem.item.id);
        await analyticsRepository.removeFileFromAllStats(resItem.item.id);
        await removeSyncCheckItem(resItem.item.id);
        await deletedFilesRepository.recordDeleted({
          id: resItem.item.id,
          name: resItem.item.name || resItem.item.id,
          formattedSize: resItem.item.formattedSize || '-',
          type: 'file',
          shareUrl: resItem.item.shareUrl || '#',
          deletedAt: Date.now(),
          deletedBy: 'sync_purge',
          reason: 'Pembersihan otomatis berkas 404 / broken link di server Catbox',
        });
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      await analyticsRepository.recordDeletion(purgedCount);
    }

    // Also purge any test fixture artifacts from runtime
    await analyticsRepository.purgeTestData();
    if ('clearTestData' in mediaRepo && typeof (mediaRepo as any).clearTestData === 'function') {
      (mediaRepo as any).clearTestData();
    }

    const healthyCount = batchResults.filter((r) => r.exists).length;
    const summary: SyncCheckSummary = {
      timestamp: Date.now(),
      totalChecked: batchResults.length,
      healthyCount,
      brokenCount: 0,
      brokenItems: [],
    };
    await saveLastSyncCheck(summary);

    await auditLogRepository.recordAction({
      type: 'SYNC_CHECK',
      detail: `Pembersihan berkas rusak (404) selesai: ${purgedCount} berkas 404/orphan dihapus dari database & analitik, ${healthyCount} berkas valid dipertahankan.`,
      ip: clientIp,
    });

    res.json({
      success: true,
      data: {
        purgedCount,
        healthyCount,
        totalChecked: batchResults.length,
      },
    });
  } catch (err: unknown) {
    console.error('[PURGE_BROKEN_FILES_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'PURGE_FAILED', message: 'Gagal membersihkan berkas broken link. Silakan coba lagi.' },
    });
  }
}
