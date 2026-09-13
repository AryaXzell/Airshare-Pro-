import { NotificationItem, NotificationLevel } from '../../repository/notification-repository';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(timestampMs: number): { relative: string; absolute: string } {
  if (!timestampMs || isNaN(timestampMs)) {
    return { relative: '-', absolute: '-' };
  }
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  let relative = `${diffSec} dtk lalu`;
  if (diffSec >= 60 && diffSec < 3600) {
    relative = `${Math.floor(diffSec / 60)} mnt lalu`;
  } else if (diffSec >= 3600 && diffSec < 86400) {
    relative = `${Math.floor(diffSec / 3600)} jam lalu`;
  } else if (diffSec >= 86400) {
    relative = `${Math.floor(diffSec / 86400)} hari lalu`;
  }

  const d = new Date(timestampMs);
  const absolute = d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return { relative, absolute };
}

export function renderNotificationsPanelHtml(notifications: NotificationItem[], unreadCount: number): string {
  const totalCount = notifications.length;
  const errorCount = notifications.filter((n) => n.level === 'error').length;
  const warnCount = notifications.filter((n) => n.level === 'warning').length;
  const successCount = notifications.filter((n) => n.level === 'success').length;
  const infoCount = notifications.filter((n) => n.level === 'info').length;

  return `
    <!-- 8. Kategori: Pusat Riwayat Notifikasi -->
    <div class="category-panel" id="panel-notifikasi" data-category-panel="notifikasi" role="tabpanel" aria-labelledby="sidebar-btn-notifikasi">
      <section class="panel" style="margin-bottom: 1.5rem;">
        <div class="panel-header" style="flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h2 class="panel-title" style="display: flex; align-items: center; gap: 0.5rem; margin: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              Pusat Riwayat Notifikasi
            </h2>
            <p style="font-size: 0.775rem; color: var(--text-muted); margin: 0.25rem 0 0;">
              Riwayat lengkap pemberitahuan sistem dan pesan kesalahan yang tersinkronisasi dengan server.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" id="btn-refresh-notifications" style="background: var(--surface-primary); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.4rem 0.75rem; border-radius: 0.6rem; font-size: 0.775rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              Muat Ulang
            </button>
            <button type="button" id="btn-mark-all-read" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 0.4rem 0.75rem; border-radius: 0.6rem; font-size: 0.775rem; font-weight: 600; cursor: pointer;">
              Tandai Semua Dibaca
            </button>
            <button type="button" id="btn-clear-notifications" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; padding: 0.4rem 0.75rem; border-radius: 0.6rem; font-size: 0.775rem; font-weight: 600; cursor: pointer;">
              Bersihkan Riwayat
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="notif-filter-bar">
          <button type="button" class="notif-filter-btn active" data-filter="all">
            Semua <span style="opacity: 0.75;">(${totalCount})</span>
          </button>
          <button type="button" class="notif-filter-btn" data-filter="error">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>
            Error <span style="opacity: 0.75;">(${errorCount})</span>
          </button>
          <button type="button" class="notif-filter-btn" data-filter="warning">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>
            Peringatan <span style="opacity: 0.75;">(${warnCount})</span>
          </button>
          <button type="button" class="notif-filter-btn" data-filter="success">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
            Sukses <span style="opacity: 0.75;">(${successCount})</span>
          </button>
          <button type="button" class="notif-filter-btn" data-filter="info">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #38bdf8;"></span>
            Info <span style="opacity: 0.75;">(${infoCount})</span>
          </button>
        </div>

        <!-- Notification List Container -->
        <div id="notif-list-container" style="display: flex; flex-direction: column;">
          ${
            notifications.length === 0
              ? `
            <div id="notif-empty-state" style="text-align: center; padding: 3.5rem 1.5rem; background: var(--surface-primary); border: 1px dashed var(--border-subtle); border-radius: 1rem; color: var(--text-muted);">
              <svg style="margin: 0 auto 1rem; opacity: 0.35;" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">Tidak Ada Riwayat Notifikasi</div>
              <p style="font-size: 0.8rem; margin: 0;">Seluruh pemberitahuan baru akan muncul di sini dan tersinkronisasi otomatis dengan server.</p>
            </div>
            `
              : notifications
                  .map((item) => {
                    const time = formatTime(item.timestamp);
                    const isError = item.level === 'error';
                    const isWarn = item.level === 'warning';
                    const isSuccess = item.level === 'success';

                    const tagClass = isError
                      ? 'notif-tag-error'
                      : isWarn
                      ? 'notif-tag-warning'
                      : isSuccess
                      ? 'notif-tag-success'
                      : 'notif-tag-info';

                    const levelLabel = isError
                      ? 'Error'
                      : isWarn
                      ? 'Peringatan'
                      : isSuccess
                      ? 'Sukses'
                      : 'Info';

                    const categoryLabel =
                      item.category === 'ai'
                        ? 'Gemini AI'
                        : item.category === 'security'
                        ? 'Keamanan'
                        : item.category === 'sync'
                        ? 'Sinkronisasi'
                        : item.category === 'storage'
                        ? 'Penyimpanan'
                        : 'Sistem';

                    const payloadToCopy = item.rawDetails ? `${item.message}\n\n[Original Details]\n${item.rawDetails}` : item.message;

                    return `
              <div class="notif-card ${!item.read ? 'unread' : ''} ${isError ? 'is-error' : ''}" data-id="${escapeHtml(item.id)}" data-level="${item.level}">
                <div class="notif-header-row">
                  <div class="notif-meta-left">
                    <span class="notif-tag ${tagClass}">${levelLabel}</span>
                    <span style="font-size: 0.725rem; font-weight: 600; color: var(--text-muted); background: var(--surface-secondary); padding: 0.15rem 0.5rem; border-radius: 4px;">${categoryLabel}</span>
                    <span class="notif-time-badge" title="${escapeHtml(time.absolute)}">${escapeHtml(time.relative)}</span>
                  </div>
                  ${
                    !item.read
                      ? `<button type="button" class="btn-mark-single-read" data-id="${escapeHtml(item.id)}" style="background: none; border: none; color: var(--text-muted); font-size: 0.7rem; cursor: pointer; text-decoration: underline;" title="Tandai telah dibaca">Tandai Dibaca</button>`
                      : ''
                  }
                </div>

                <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">
                  ${escapeHtml(item.title)}
                </div>

                ${
                  isError
                    ? `
                  <!-- 1-Click Copy Error Box -->
                  <div class="notif-error-clickable-box" title="Klik 1x untuk menyalin pesan error ini" data-copy-text="${escapeHtml(payloadToCopy)}" role="button" tabindex="0">
                    <div style="flex: 1; min-width: 0;">
                      <div style="font-size: 0.825rem; color: #fca5a5; line-height: 1.45; font-weight: 500;">
                        ${escapeHtml(item.message)}
                      </div>
                      <div style="font-size: 0.7rem; color: #f87171; margin-top: 0.35rem; display: flex; align-items: center; gap: 0.3rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Klik area ini 1x untuk salin pesan error ke clipboard
                      </div>
                    </div>
                    <button type="button" class="btn-copy-error-badge" data-copy-text="${escapeHtml(payloadToCopy)}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      <span>Salin</span>
                    </button>
                  </div>
                  `
                    : `
                  <div style="font-size: 0.825rem; color: var(--text-muted); line-height: 1.45;">
                    ${escapeHtml(item.message)}
                  </div>
                  `
                }

                ${
                  item.rawDetails
                    ? `
                <!-- Expandable Original Raw Details -->
                <details class="notif-raw-details">
                  <summary>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    Lihat Versi Lengkap &amp; Respon Original (Raw Server Response)
                  </summary>
                  <pre class="notif-raw-box">${escapeHtml(item.rawDetails)}</pre>
                  <div style="padding: 0.5rem 0.85rem; background: rgba(0,0,0,0.2); border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end;">
                    <button type="button" class="btn-copy-raw-box" data-copy-text="${escapeHtml(item.rawDetails)}" style="background: var(--surface-primary); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.25rem 0.65rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      <span>Salin Detail Lengkap</span>
                    </button>
                  </div>
                </details>
                `
                    : ''
                }
              </div>
            `;
                  })
                  .join('')
          }
        </div>
      </section>
    </div>
  `;
}
