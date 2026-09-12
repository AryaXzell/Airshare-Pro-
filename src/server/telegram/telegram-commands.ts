import { isAuthorizedTelegramUser, handleUnauthorizedAttempt, checkTelegramRateLimit } from './telegram-auth';
import { sendTelegramMessage, alertMaintenanceModeChanged } from './telegram-notifier';
import {
  createPendingAction,
  getPendingAction,
  clearPendingAction,
  PendingActionType,
} from './pending-confirmations';
import {
  isMaintenanceModeActive,
  getMaintenanceLevel,
  setMaintenanceLevel,
  MaintenanceLevel,
  setAnnouncement,
} from '../security/system-config';
import { checkRedisHealth } from '../storage/redis-client';
import { checkCatboxHealth } from '../storage/catbox-health-check';
import { analyticsRepository, getTodayDateString } from '../repository/analytics-repository';
import { auditLogRepository } from '../repository/audit-log-repository';
import { getAllActiveSessions, revokeAllAdminSessions } from '../security/admin-auth';
import { getMediaRepository } from '../repository/media-repository';
import { CatboxStorageProvider } from '../storage/catbox-storage-provider';
import { removeSyncCheckItem } from '../storage/catbox-health-check';

const storageProvider = new CatboxStorageProvider();

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export interface TelegramMessagePayload {
  messageId: number;
  from: {
    id: number;
    isBot: boolean;
    firstName?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  date: number;
}

/**
 * Main dispatcher for Telegram Bot commands.
 */
export async function handleTelegramCommand(payload: TelegramMessagePayload): Promise<void> {
  const fromId = payload.from.id;
  const username = payload.from.username;
  const chatId = payload.chat.id;
  const rawText = (payload.text || '').trim();

  if (!rawText) return;

  // 1. Strict Identity Verification First
  if (!isAuthorizedTelegramUser(fromId)) {
    await handleUnauthorizedAttempt(fromId, username);
    await sendTelegramMessage(chatId, 'Bot ini bersifat privat.');
    return;
  }

  // 2. Anti-spam Rate Limiting per user ID
  const allowed = await checkTelegramRateLimit(fromId);
  if (!allowed) {
    await sendTelegramMessage(chatId, '⚠️ Terlalu banyak perintah. Silakan tunggu 1 menit.');
    return;
  }

  // Parse command & arguments (support /command@botname syntax)
  const parts = rawText.split(/\s+/);
  const commandWithBot = parts[0];
  const command = commandWithBot.split('@')[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/start':
    case '/help':
      await handleHelp(chatId);
      break;

    case '/status':
      await handleStatus(chatId);
      break;

    case '/stats':
      await handleStats(chatId);
      break;

    case '/log':
      await handleLog(chatId);
      break;

    case '/sessions':
      await handleSessions(chatId);
      break;

    case '/confirm':
      await handleConfirm(chatId, fromId, username, args[0]);
      break;

    case '/killswitch_on':
      await promptKillswitch(chatId, fromId, 'upload_only');
      break;

    case '/killswitch_lockdown':
      await promptKillswitch(chatId, fromId, 'full_lockdown');
      break;

    case '/killswitch_off':
      await promptKillswitch(chatId, fromId, 'off');
      break;

    case '/hapus_permanen':
      await promptHapusPermanen(chatId, fromId, args[0]);
      break;

    case '/revoke_all_sesi':
      await promptRevokeAllSessions(chatId, fromId);
      break;

    case '/bulk_cleanup':
      await promptBulkCleanup(chatId, fromId, args[0], args[1]);
      break;

    case '/announcement':
      await promptAnnouncement(chatId, fromId, args.join(' '));
      break;

    default:
      await sendTelegramMessage(
        chatId,
        'Perintah tidak dikenali. Ketik /help untuk melihat daftar perintah yang tersedia.'
      );
      break;
  }
}

// -------------------------------------------------------------
// READ-ONLY COMMANDS (Bagian 2)
// -------------------------------------------------------------

async function handleHelp(chatId: number): Promise<void> {
  const msg = [
    '🤖 <b>AirShare Pro — Admin Control Bot</b>',
    '',
    '<b>Perintah Pemantauan &amp; Informasi:</b>',
    '• /status — Ringkasan kesehatan sistem &amp; aktivitas hari ini',
    '• /stats — Statistik 7 hari, distribusi tipe, dan top berkas',
    '• /log — 10 catatan audit log terbaru',
    '• /sessions — Daftar sesi admin web yang aktif saat ini',
    '',
    '<b>Perintah Kontrol (Memerlukan Konfirmasi):</b>',
    '• /killswitch_on — Tutup unggahan saja (upload 503, share link tetap aktif)',
    '• /killswitch_lockdown — Lockdown Total (upload &amp; share link ditutup 503)',
    '• /killswitch_off — Nonaktifkan Kill Switch (seluruh layanan normal)',
    '• /hapus_permanen &lt;id&gt; — Hapus berkas dari Catbox &amp; DB',
    '• /revoke_all_sesi — Cabut seluruh sesi admin web aktif',
    '• /bulk_cleanup &lt;hari&gt; &lt;maxViews&gt; — Pembersihan massal berkas usang',
    '• /announcement &lt;pesan&gt; — Pasang banner pengumuman publik',
    '',
    '<i>Catatan: Aksi destruktif memerlukan konfirmasi dengan kode acak dalam 60 detik.</i>',
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function handleStatus(chatId: number): Promise<void> {
  const [maintenanceLevel, redisHealth, catboxHealth, todaySummary] = await Promise.all([
    getMaintenanceLevel(),
    checkRedisHealth(),
    checkCatboxHealth(),
    analyticsRepository.getDailySummary(getTodayDateString()),
  ]);

  const redisStatus = redisHealth.connected
    ? `🟢 Terhubung (${redisHealth.latencyMs || 0} ms)`
    : redisHealth.configured
    ? '🔴 Gagal Terhubung'
    : '⚪ In-Memory (Belum Dikonfigurasi)';

  const catboxStatus = catboxHealth.available
    ? `🟢 Aktif (${catboxHealth.latencyMs || 0} ms)`
    : '🔴 Gangguan / Tidak Tersedia';

  const maintStatus =
    maintenanceLevel === 'full_lockdown'
      ? '🔴 <b>LOCKDOWN TOTAL</b> (Upload &amp; Share Ditutup — 503)'
      : maintenanceLevel === 'upload_only'
      ? '🟡 <b>TUTUP UPLOAD</b> (Upload 503, Share Link Tetap Aktif)'
      : '🟢 <b>Layanan Normal</b> (Unggahan &amp; Berbagi Terbuka)';

  const msg = [
    '📊 <b>Status Sistem AirShare Pro</b>',
    '',
    `• <b>Maintenance Mode:</b> ${maintStatus}`,
    `• <b>Penyimpanan Redis:</b> ${redisStatus}`,
    `• <b>Upstream Catbox:</b> ${catboxStatus}`,
    '',
    '<b>Aktivitas Hari Ini:</b>',
    `• Unggahan: <b>${todaySummary.uploads}</b> berkas (${todaySummary.formattedBytes})`,
    `• Kunjungan (Views): <b>${todaySummary.totalViews}</b> kali`,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function handleStats(chatId: number): Promise<void> {
  const today = getTodayDateString();
  const [weeklyTrend, todaySummary, topFiles, recentUploads] = await Promise.all([
    analyticsRepository.getWeeklyTrend(),
    analyticsRepository.getDailySummary(today),
    analyticsRepository.getTopFiles(5),
    analyticsRepository.getRecentUploads(50),
  ]);

  // Total past 7 days
  let total7dUploads = 0;
  let total7dViews = 0;
  let total7dBytes = 0;
  for (const item of weeklyTrend) {
    total7dUploads += item.uploads;
    total7dViews += item.views;
    total7dBytes += item.bytes;
  }

  // Media type breakdown
  const typeLines = Object.entries(todaySummary.byType)
    .map(([type, count]) => `  • ${type}: ${count}`)
    .join('\n') || '  • Belum ada unggahan hari ini';

  // Resolve top files names from recentUploads map
  const nameMap = new Map<string, string>();
  for (const item of recentUploads) {
    nameMap.set(item.id, item.name);
  }

  let topFilesText = '';
  if (topFiles.length > 0) {
    topFilesText = topFiles
      .map((f, idx) => {
        const name = nameMap.get(f.id) || f.id;
        return `${idx + 1}. <code>${escapeHtml(name.slice(0, 30))}</code> — <b>${f.views} views</b>`;
      })
      .join('\n');
  } else {
    topFilesText = 'Belum ada data file populer.';
  }

  const msg = [
    '📈 <b>Statistik &amp; Analitik AirShare Pro</b>',
    '',
    '<b>Ringkasan Tren 7 Hari Terakhir:</b>',
    `• Total Unggahan: <b>${total7dUploads}</b> berkas`,
    `• Total Penayangan: <b>${total7dViews}</b> kali`,
    `• Total Ukuran: <b>${formatBytes(total7dBytes)}</b>`,
    '',
    '<b>Distribusi Tipe Media Hari Ini:</b>',
    typeLines,
    '',
    '<b>Top 5 Berkas Terpopuler:</b>',
    topFilesText,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function handleLog(chatId: number): Promise<void> {
  const logs = await auditLogRepository.getRecentActions(10);

  if (logs.length === 0) {
    await sendTelegramMessage(chatId, '📝 Belum ada riwayat aktivitas di audit log.');
    return;
  }

  const logLines = logs.map((log) => {
    const timeStr = new Date(log.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `• [${timeStr}] <b>${escapeHtml(log.type)}</b>: ${escapeHtml(log.detail)} (IP: <code>${escapeHtml(log.ip)}</code>)`;
  });

  const msg = [
    '📋 <b>10 Entri Audit Log Terbaru</b>',
    '',
    ...logLines,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function handleSessions(chatId: number): Promise<void> {
  const sessions = await getAllActiveSessions();

  if (sessions.length === 0) {
    await sendTelegramMessage(chatId, '🔒 Tidak ada sesi admin web yang sedang aktif saat ini.');
    return;
  }

  const sessionLines = sessions.map((s, idx) => {
    const loginStr = new Date(s.loginAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${idx + 1}. Token: <code>${escapeHtml(s.tokenPreview)}</code> | IP: <code>${escapeHtml(s.ip)}</code> | Login: ${loginStr}`;
  });

  const msg = [
    `🔐 <b>Daftar Sesi Admin Web Aktif (${sessions.length})</b>`,
    '',
    ...sessionLines,
    '',
    '<i>Ketik /revoke_all_sesi jika ingin mencabut semua sesi sekaligus.</i>',
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

// -------------------------------------------------------------
// CONTROL COMMAND PROMPTS (Bagian 3)
// -------------------------------------------------------------

async function promptKillswitch(chatId: number, userId: number, targetLevel: MaintenanceLevel): Promise<void> {
  const current = await getMaintenanceLevel();
  if (current === targetLevel) {
    const currentName =
      targetLevel === 'full_lockdown'
        ? 'LOCKDOWN TOTAL'
        : targetLevel === 'upload_only'
        ? 'TUTUP UPLOAD'
        : 'NORMAL';
    await sendTelegramMessage(
      chatId,
      `ℹ️ Kill switch sudah dalam status <b>${currentName}</b>. Tidak ada perubahan yang diperlukan.`
    );
    return;
  }

  let actionType: PendingActionType;
  let title: string;
  let desc: string;

  if (targetLevel === 'full_lockdown') {
    actionType = 'killswitch_lockdown';
    title = 'AKTIVASI LOCKDOWN TOTAL';
    desc = 'Mengaktifkan Lockdown Total (tutup seluruh unggahan baru DAN akses tautan share publik dengan HTTP 503)';
  } else if (targetLevel === 'upload_only') {
    actionType = 'killswitch_on';
    title = 'AKTIVASI TUTUP UNGGAHAN';
    desc = 'Mengaktifkan Tutup Unggahan (tutup seluruh unggahan baru dengan HTTP 503, tautan share yang ada tetap aktif)';
  } else {
    actionType = 'killswitch_off';
    title = 'DEAKTIVASI KILL SWITCH (LAYANAN NORMAL)';
    desc = 'Menonaktifkan Kill Switch (membuka kembali seluruh layanan unggahan dan akses berkas secara normal)';
  }

  const confirmationId = await createPendingAction(userId, {
    type: actionType,
    description: desc,
  });

  const msg = [
    `⚠️ <b>KONFIRMASI ${title}</b>`,
    '',
    `Aksi yang akan dilakukan:`,
    `<b>${desc}</b>`,
    '',
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`,
    '',
    '<i>Abaikan pesan ini untuk membatalkan aksi.</i>',
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function promptHapusPermanen(chatId: number, userId: number, fileId?: string): Promise<void> {
  if (!fileId || fileId.trim().length === 0) {
    await sendTelegramMessage(chatId, '❌ Format salah. Gunakan: <code>/hapus_permanen &lt;ID_BERKAS&gt;</code>');
    return;
  }

  const cleanId = fileId.trim();
  const mediaRepo = getMediaRepository();

  // Look up file in repo or recent uploads
  let media = await mediaRepo.getByIdForAdmin(cleanId);
  if (!media) {
    const recents = await analyticsRepository.getRecentUploads(200);
    const found = recents.find((r) => r.id === cleanId);
    if (found) {
      media = {
        id: found.id,
        name: found.name,
        originalFileName: found.originalFileName,
        size: found.size,
        formattedSize: found.formattedSize,
        type: found.type,
        mimeType: found.mimeType,
        shareUrl: found.shareUrl,
        provider: 'catbox',
        createdAt: found.createdAt,
        sessionId: 'unknown',
      };
    }
  }

  if (!media) {
    await sendTelegramMessage(chatId, `❌ Berkas dengan ID <code>${escapeHtml(cleanId)}</code> tidak ditemukan di repositori.`);
    return;
  }

  const confirmationId = await createPendingAction(userId, {
    type: 'hapus_permanen',
    description: `Hapus permanen berkas "${media.name}" (${media.id})`,
    payload: {
      id: media.id,
      name: media.name,
      shareUrl: media.shareUrl,
      size: media.size,
      formattedSize: media.formattedSize,
    },
  });

  const msg = [
    '⚠️ <b>KONFIRMASI HAPUS PERMANEN BERKAS</b>',
    '',
    `• Nama Berkas: <code>${escapeHtml(media.name)}</code>`,
    `• Ukuran: <b>${media.formattedSize}</b>`,
    `• ID: <code>${escapeHtml(media.id)}</code>`,
    `• Tautan: ${escapeHtml(media.shareUrl)}`,
    '',
    '<i>Berkas akan dihapus secara permanen dari server Catbox dan database. Aksi ini tidak dapat dibatalkan.</i>',
    '',
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function promptRevokeAllSessions(chatId: number, userId: number): Promise<void> {
  const sessions = await getAllActiveSessions();
  const count = sessions.length;

  if (count === 0) {
    await sendTelegramMessage(chatId, 'ℹ️ Tidak ada sesi admin aktif yang perlu dicabut.');
    return;
  }

  const confirmationId = await createPendingAction(userId, {
    type: 'revoke_all_sesi',
    description: `Cabut seluruh ${count} sesi admin aktif`,
    payload: { count },
  });

  const msg = [
    '⚠️ <b>KONFIRMASI PENCABUTAN SELURUH SESI ADMIN</b>',
    '',
    `Aksi ini akan mencabut <b>${count} sesi admin web</b> yang saat ini aktif. Semua admin yang sedang login di browser akan langsung ter-logout dan wajib memasukkan password kembali.`,
    '',
    `Balas dengan perintah berikut dalam 60 detik untuk melanjutkan:`,
    `<code>/confirm ${confirmationId}</code>`,
    '',
    '<i>Abaikan pesan ini untuk membatalkan aksi.</i>',
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function promptBulkCleanup(
  chatId: number,
  userId: number,
  daysArg?: string,
  viewsArg?: string
): Promise<void> {
  const days = parseInt(daysArg || '', 10);
  const maxViews = parseInt(viewsArg || '', 10);

  if (isNaN(days) || isNaN(maxViews) || days < 0 || maxViews < 0) {
    await sendTelegramMessage(
      chatId,
      '❌ Format salah. Gunakan: <code>/bulk_cleanup &lt;hari&gt; &lt;maxViews&gt;</code>\nContoh: <code>/bulk_cleanup 30 0</code> (berkas usia > 30 hari dengan 0 views)'
    );
    return;
  }

  const now = Date.now();
  const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1000 : now;

  // Run preview on recent uploads
  const allRecent = await analyticsRepository.getRecentUploads(500);
  const candidates: { id: string; name: string; size: number; shareUrl: string }[] = [];
  let totalBytes = 0;

  for (const item of allRecent) {
    if (days > 0 && item.createdAt > cutoffTime) continue;
    const views = await analyticsRepository.getViewCount(item.id);
    if (views <= maxViews) {
      candidates.push({
        id: item.id,
        name: item.name,
        size: item.size || 0,
        shareUrl: item.shareUrl,
      });
      totalBytes += item.size || 0;
    }
  }

  if (candidates.length === 0) {
    await sendTelegramMessage(
      chatId,
      `ℹ️ Tidak ditemukan berkas yang memenuhi kriteria (usia > ${days} hari dan views <= ${maxViews}).`
    );
    return;
  }

  const sampleNames = candidates
    .slice(0, 3)
    .map((c) => `• <code>${escapeHtml(c.name.slice(0, 35))}</code> (${formatBytes(c.size)})`)
    .join('\n');

  const confirmationId = await createPendingAction(userId, {
    type: 'bulk_cleanup',
    description: `Pembersihan massal (${days} hari, views <= ${maxViews})`,
    payload: {
      olderThanDays: days,
      maxViews,
      candidates,
    },
  });

  const msg = [
    '⚠️ <b>KONFIRMASI PEMBERSIHAN MASSAL (BULK CLEANUP)</b>',
    '',
    `Kriteria: Usia > <b>${days} hari</b> &amp; Views &le; <b>${maxViews}</b>`,
    `Jumlah Kandidat: <b>${candidates.length} berkas</b>`,
    `Total Ruang Dibebaskan: <b>${formatBytes(totalBytes)}</b>`,
    '',
    '<b>Contoh berkas yang akan dihapus:</b>',
    sampleNames,
    candidates.length > 3 ? `<i>...dan ${candidates.length - 3} berkas lainnya</i>` : '',
    '',
    '<i>Seluruh berkas ini akan dihapus secara permanen dari Catbox. Aksi ini tidak dapat dibatalkan.</i>',
    '',
    `Balas dengan perintah berikut dalam 60 detik untuk mengeksekusi:`,
    `<code>/confirm ${confirmationId}</code>`,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

async function promptAnnouncement(chatId: number, userId: number, text?: string): Promise<void> {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    await sendTelegramMessage(
      chatId,
      '❌ Format salah. Gunakan: <code>/announcement &lt;pesan pengumuman&gt;</code>\nContoh: <code>/announcement Server akan maintenance malam ini pukul 23:00 WIB</code>'
    );
    return;
  }

  const confirmationId = await createPendingAction(userId, {
    type: 'announcement',
    description: `Banner pengumuman: "${cleanText}"`,
    payload: { message: cleanText },
  });

  const msg = [
    '📢 <b>PRATINJAU BANNER PENGUMUMAN</b>',
    '',
    'Pesan yang akan ditampilkan ke publik:',
    `<blockquote>${escapeHtml(cleanText)}</blockquote>`,
    '',
    'Tipe: <b>Info (Biru)</b> | Status: <b>Aktif</b>',
    '',
    'Periksa kembali teks di atas untuk menghindari typo pada tampilan publik.',
    `Balas dengan perintah berikut dalam 60 detik untuk mengaktifkan:`,
    `<code>/confirm ${confirmationId}</code>`,
  ].join('\n');

  await sendTelegramMessage(chatId, msg);
}

// -------------------------------------------------------------
// CONFIRMATION EXECUTION (Bagian 3)
// -------------------------------------------------------------

async function handleConfirm(
  chatId: number,
  userId: number,
  username: string | undefined,
  confirmationId?: string
): Promise<void> {
  if (!confirmationId || confirmationId.trim().length === 0) {
    await sendTelegramMessage(
      chatId,
      '❌ Kode konfirmasi tidak disertakan. Format: <code>/confirm &lt;KODE&gt;</code>'
    );
    return;
  }

  const pending = await getPendingAction(confirmationId);

  if (!pending) {
    await sendTelegramMessage(
      chatId,
      '⚠️ Konfirmasi tidak ditemukan atau sudah kedaluwarsa (batas waktu 60 detik). Silakan ulangi perintah dari awal.'
    );
    return;
  }

  if (pending.userId !== userId) {
    await sendTelegramMessage(
      chatId,
      '⚠️ Perintah ini hanya dapat dikonfirmasi oleh pengguna Telegram yang memintanya.'
    );
    return;
  }

  // Clear confirmation so it cannot be replayed
  await clearPendingAction(confirmationId);

  const adminTag = username ? `@${username}` : `ID: ${userId}`;

  try {
    switch (pending.type) {
      case 'killswitch_on': {
        await setMaintenanceLevel('upload_only');
        await auditLogRepository.recordAction({
          type: 'telegram_killswitch_toggle',
          detail: `Kill Switch diubah ke TUTUP UPLOAD SAJA oleh Telegram user ${adminTag}`,
          ip: 'telegram-api',
        });
        await alertMaintenanceModeChanged('upload_only', 'telegram', adminTag);
        await sendTelegramMessage(
          chatId,
          '✅ <b>Kill Switch BERHASIL DIAKTIFKAN (TUTUP UPLOAD).</b>\nSeluruh unggahan baru kini ditolak (503). Tautan share yang sudah ada tetap aktif.'
        );
        break;
      }

      case 'killswitch_lockdown': {
        await setMaintenanceLevel('full_lockdown');
        await auditLogRepository.recordAction({
          type: 'telegram_killswitch_toggle',
          detail: `Kill Switch diubah ke LOCKDOWN TOTAL oleh Telegram user ${adminTag}`,
          ip: 'telegram-api',
        });
        await alertMaintenanceModeChanged('full_lockdown', 'telegram', adminTag);
        await sendTelegramMessage(
          chatId,
          '✅ <b>Kill Switch BERHASIL DIAKTIFKAN (LOCKDOWN TOTAL).</b>\nSeluruh unggahan baru DAN akses tautan share publik kini diblokir (503).'
        );
        break;
      }

      case 'killswitch_off': {
        await setMaintenanceLevel('off');
        await auditLogRepository.recordAction({
          type: 'telegram_killswitch_toggle',
          detail: `Kill Switch DINONAKTIFKAN oleh Telegram user ${adminTag}`,
          ip: 'telegram-api',
        });
        await alertMaintenanceModeChanged('off', 'telegram', adminTag);
        await sendTelegramMessage(
          chatId,
          '✅ <b>Kill Switch BERHASIL DINONAKTIFKAN.</b>\nSeluruh layanan unggahan dan akses tautan telah dibuka kembali secara normal.'
        );
        break;
      }

      case 'hapus_permanen': {
        const payload = pending.payload;
        const mediaRepo = getMediaRepository();

        await storageProvider.delete(payload.shareUrl || payload.id);
        await mediaRepo.deleteForAdmin(payload.id);
        await analyticsRepository.removeRecentUpload(payload.id);
        await removeSyncCheckItem(payload.id);

        await auditLogRepository.recordAction({
          type: 'telegram_permanent_delete',
          detail: `Berkas "${payload.name}" (${payload.id}) dihapus permanen oleh Telegram user ${adminTag}`,
          ip: 'telegram-api',
        });

        await sendTelegramMessage(
          chatId,
          `✅ Berkas <code>${escapeHtml(payload.name)}</code> (${payload.id}) telah <b>berhasil dihapus secara permanen</b> dari Catbox dan repositori.`
        );
        break;
      }

      case 'revoke_all_sesi': {
        const revokedCount = await revokeAllAdminSessions();
        await auditLogRepository.recordAction({
          type: 'telegram_session_revoke_all',
          detail: `Pencabutan seluruh (${revokedCount}) sesi admin web oleh Telegram user ${adminTag}`,
          ip: 'telegram-api',
        });

        await sendTelegramMessage(
          chatId,
          `✅ Berhasil mencabut <b>${revokedCount} sesi admin web</b> yang aktif. Semua sesi telah dibatalkan.`
        );
        break;
      }

      case 'bulk_cleanup': {
        const { olderThanDays, maxViews, candidates } = pending.payload;
        const mediaRepo = getMediaRepository();

        let succeeded = 0;
        let failed = 0;
        let freedBytes = 0;

        for (const item of candidates) {
          try {
            await storageProvider.delete(item.shareUrl || item.id);
            await mediaRepo.deleteForAdmin(item.id);
            await analyticsRepository.removeRecentUpload(item.id);
            await removeSyncCheckItem(item.id);
            succeeded++;
            freedBytes += item.size || 0;
          } catch {
            failed++;
          }
        }

        await auditLogRepository.recordAction({
          type: 'telegram_bulk_cleanup',
          detail: `Pembersihan massal oleh Telegram user ${adminTag} (> ${olderThanDays} hari, views <= ${maxViews}): Sukses ${succeeded}, gagal ${failed}. Total: ${formatBytes(freedBytes)}`,
          ip: 'telegram-api',
        });

        await sendTelegramMessage(
          chatId,
          [
            '✅ <b>Pembersihan Massal Berhasil Dieksekusi!</b>',
            '',
            `• Berkas Terhapus: <b>${succeeded}</b>`,
            `• Gagal: <b>${failed}</b>`,
            `• Ruang Dibebaskan: <b>${formatBytes(freedBytes)}</b>`,
          ].join('\n')
        );
        break;
      }

      case 'announcement': {
        const { message } = pending.payload;
        await setAnnouncement({
          message,
          type: 'info',
          enabled: true,
          updatedAt: Date.now(),
          expiresAt: null,
        });

        await auditLogRepository.recordAction({
          type: 'telegram_announcement_update',
          detail: `Pengumuman publik diperbarui oleh Telegram user ${adminTag}: "${message}"`,
          ip: 'telegram-api',
        });

        await sendTelegramMessage(
          chatId,
          `✅ <b>Banner Pengumuman Berhasil Disimpan &amp; Diaktifkan!</b>\nPesan kini tampil pada halaman publik AirShare Pro.`
        );
        break;
      }

      default:
        await sendTelegramMessage(chatId, '❌ Jenis aksi tidak valid.');
        break;
    }
  } catch (err) {
    console.error('[TELEGRAM_CONFIRM_ERROR] Gagal mengeksekusi aksi terkonfirmasi:', err);
    await sendTelegramMessage(
      chatId,
      `❌ Terjadi kesalahan saat mengeksekusi perintah: ${err instanceof Error ? err.message : 'Kesalahan sistem'}`
    );
  }
}
