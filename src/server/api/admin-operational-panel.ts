import { SystemConfig } from '../security/system-config';
import { AdminSessionInfo } from '../security/admin-auth';
import { AuditLogEntry } from '../repository/audit-log-repository';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'Baru saja';
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSecs < 60) return 'Baru saja';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} menit lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function formatAbsoluteTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '-';
  const d = new Date(timestamp);
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function renderOperationalControlsHtml(config: SystemConfig): string {
  const isMaintenance = config.maintenanceMode;
  const announcement = config.announcement || { message: '', type: 'info' as const, enabled: false, updatedAt: 0 };
  const maxMb = Math.round(config.maxUploadSize / (1024 * 1024));

  return `
  <!-- Kontrol Operasional & Konfigurasi Dinamis Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="operational-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        Kontrol Operasional &amp; Konfigurasi Dinamis (Redis-Backed)
      </h2>
      <span class="panel-badge">Tanpa Redeploy</span>
    </div>

    <!-- Kill Switch Section -->
    <div style="background: ${isMaintenance ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${isMaintenance ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.25)'}; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <span class="status-indicator ${isMaintenance ? 'status-err pulsing' : 'status-ok'}"></span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: ${isMaintenance ? '#f87171' : '#34d399'};">
            ${isMaintenance ? 'KILL SWITCH AKTIF — Unggahan Dinonaktifkan (503)' : 'Layanan Normal — Unggahan Terbuka'}
          </div>
          <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem;">
            ${isMaintenance ? 'Pengguna yang mencoba mengunggah akan menerima respon HTTP 503 Maintenance Mode.' : 'Semua pengguna dapat mengunggah berkas sesuai kapasitas yang ditentukan.'}
          </div>
        </div>
      </div>
      <button type="button" id="btn-toggle-maintenance" class="${isMaintenance ? 'btn-maint-disable' : 'btn-maint-enable'}" data-active="${isMaintenance ? 'true' : 'false'}">
        ${isMaintenance ? 'Nonaktifkan Maintenance Mode' : 'Aktifkan Kill Switch (Tutup Unggah)'}
      </button>
    </div>

    <!-- 2 Column Config Forms -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
      <!-- Announcement Banner Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
          Banner Pengumuman Sistem
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Teks Pengumuman</label>
            <textarea id="announcement-message" rows="3" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.6rem 0.75rem; font-size: 0.825rem; resize: vertical;" placeholder="Contoh: Pemeliharaan server dijadwalkan pukul 23:00 WIB...">${escapeHtml(announcement.message || '')}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Tipe Tampilan</label>
              <select id="announcement-type" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;">
                <option value="info" ${announcement.type === 'info' ? 'selected' : ''}>Info (Biru)</option>
                <option value="warning" ${announcement.type === 'warning' ? 'selected' : ''}>Peringatan (Kuning/Oranye)</option>
                <option value="success" ${announcement.type === 'success' ? 'selected' : ''}>Sukses (Hijau)</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Status Banner</label>
              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.825rem; font-weight: 600; height: 36px; cursor: pointer;">
                <input type="checkbox" id="announcement-enabled" ${announcement.enabled ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent);" />
                <span>Tampilkan Banner</span>
              </label>
            </div>
          </div>

          <button type="button" id="btn-save-announcement" class="btn-primary-config" style="margin-top: 0.5rem;">
            Simpan Pengumuman
          </button>
        </div>
      </div>

      <!-- Limit & Feature Flags Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Batas Unggah &amp; Feature Flags
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Maksimal Ukuran (MB)</label>
              <input type="number" id="cfg-max-upload" min="1" max="500" value="${maxMb}" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
              <span style="font-size: 0.7rem; color: var(--muted);">Catbox max: 200-500 MB</span>
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Rate Limit (Upload/menit)</label>
              <input type="number" id="cfg-rate-limit" min="1" max="200" value="${config.rateLimit.limit}" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
              <span style="font-size: 0.7rem; color: var(--muted);">Per IP klien per menit</span>
            </div>
          </div>

          <div style="padding-top: 0.5rem; border-top: 1px solid var(--border);">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--muted); margin-bottom: 0.5rem;">Feature Toggles Frontend:</div>
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-paste" ${config.featureFlags.pasteToUpload ? 'checked' : ''} style="accent-color: var(--accent);" />
                <span>Paste-to-Upload (Ctrl+V di halaman)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-qrcode" ${config.featureFlags.qrCode ? 'checked' : ''} style="accent-color: var(--accent);" />
                <span>Tombol &amp; Modal Kode QR Publik</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-pwa" ${config.featureFlags.pwaInstallPrompt ? 'checked' : ''} style="accent-color: var(--accent);" />
                <span>Prompt Instalasi PWA di Header</span>
              </label>
            </div>
          </div>

          <button type="button" id="btn-save-limits-flags" class="btn-primary-config" style="margin-top: 0.5rem;">
            Simpan Konfigurasi Dinamis
          </button>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderActiveSessionsHtml(sessions: AdminSessionInfo[]): string {
  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return `
  <!-- Manajemen Sesi Admin Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="sessions-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Sesi Admin Aktif (${sessions.length} Sesi Terbuka)
      </h2>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span class="panel-badge">TTL: 1 Jam</span>
        ${
          otherSessionsCount > 0
            ? `<button type="button" id="btn-revoke-all-sessions" class="btn-revoke-all" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">Cabut Semua Sesi Lain (${otherSessionsCount})</button>`
            : ''
        }
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Token Sesi</th>
            <th>Waktu Login</th>
            <th>IP Klien</th>
            <th>User Agent</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${
            sessions.length === 0
              ? `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 1.5rem;">Tidak ada sesi aktif.</td></tr>`
              : sessions
                  .map((s) => `
            <tr id="session-row-${escapeHtml(s.token)}">
              <td>
                <code style="background: rgba(255,255,255,0.06); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.75rem; color: #a5b4fc;">
                  ${escapeHtml(s.tokenPreview)}
                </code>
              </td>
              <td>
                <div style="font-weight: 600; font-size: 0.8rem;">${formatRelativeTime(s.loginAt)}</div>
                <div style="font-size: 0.7rem; color: var(--muted);">${formatAbsoluteTime(s.loginAt)}</div>
              </td>
              <td style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(s.ip)}</td>
              <td style="font-size: 0.75rem; color: var(--muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(s.userAgent)}">
                ${escapeHtml(s.userAgent)}
              </td>
              <td>
                ${
                  s.isCurrent
                    ? `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">Sesi Ini</span>`
                    : `<span style="background: rgba(255, 255, 255, 0.08); color: var(--muted); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">Perangkat Lain</span>`
                }
              </td>
              <td>
                ${
                  s.isCurrent
                    ? `<span style="font-size: 0.75rem; color: var(--muted);">-</span>`
                    : `<button type="button" class="btn-revoke-single" data-token="${escapeHtml(s.token)}" style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">Cabut</button>`
                }
              </td>
            </tr>`)
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderBulkCleanupHtml(): string {
  return `
  <!-- Pembersihan Massal (Bulk Cleanup) Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="bulk-cleanup-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        Pembersihan Massal Berkas (Bulk Cleanup Berdasarkan Kriteria)
      </h2>
      <span class="panel-badge">Two-Phase Safe Execution</span>
    </div>

    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
      <p style="font-size: 0.8rem; color: var(--muted); margin-bottom: 1rem;">
        Bersihkan berkas lama yang tidak aktif dalam jumlah banyak sekaligus. Setiap eksekusi wajib melalui tahap <strong>Pratinjau Dampak</strong> dan <strong>Ketik Konfirmasi Teks</strong> sebelum penghapusan permanen dijalankan.
      </p>

      <!-- Filter Controls -->
      <div style="display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
        <div style="flex: 1; min-width: 160px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Usia Berkas (Diunggah Sebelum)</label>
          <select id="cleanup-older-than" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;">
            <option value="7">Lebih dari 7 Hari Lalu</option>
            <option value="30" selected>Lebih dari 30 Hari Lalu</option>
            <option value="60">Lebih dari 60 Hari Lalu</option>
            <option value="90">Lebih dari 90 Hari Lalu</option>
            <option value="0">Semua Usia Berkas</option>
          </select>
        </div>

        <div style="flex: 1; min-width: 160px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Maksimal Jumlah Tayangan (Views)</label>
          <input type="number" id="cleanup-max-views" min="0" value="0" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
          <span style="font-size: 0.7rem; color: var(--muted);">0 = tidak pernah dilihat siapapun</span>
        </div>

        <button type="button" id="btn-preview-cleanup" style="background: var(--accent); color: var(--accent-text, #fff); border: none; padding: 0.55rem 1.25rem; border-radius: 6px; font-size: 0.825rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; height: 38px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Pratinjau Berkas Terdampak
        </button>
      </div>

      <!-- Preview Results Container (Hidden initially) -->
      <div id="cleanup-preview-container" style="display: none; border-top: 1px solid var(--border); padding-top: 1.25rem;">
        <div id="cleanup-preview-summary" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 1rem; margin-bottom: 1rem; font-size: 0.85rem; color: #fbbf24;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Matched Items List (Collapsible) -->
        <div id="cleanup-preview-items" style="max-height: 220px; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 1rem; padding: 0.5rem;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Safety Confirmation Input & Execute Button -->
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: #f87171;">
            PERINGATAN: Penghapusan bersifat ireversibel dari server Catbox &amp; database AirShare!
          </div>
          <div style="font-size: 0.75rem; color: var(--muted);">
            Ketik teks berikut persis untuk mengaktifkan tombol eksekusi: <code style="color: #fff; background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: 800;">KONFIRMASI HAPUS MASSAL</code>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <input type="text" id="cleanup-confirm-text" placeholder="KONFIRMASI HAPUS MASSAL" style="flex: 1; min-width: 240px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.75rem; font-size: 0.825rem;" />
            <button type="button" id="btn-execute-cleanup" disabled style="background: #ef4444; color: #fff; border: none; padding: 0.55rem 1.25rem; border-radius: 6px; font-size: 0.825rem; font-weight: 700; cursor: not-allowed; opacity: 0.5;">
              Jalankan Hapus Massal Permanen
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderAuditLogsHtml(logs: AuditLogEntry[]): string {
  return `
  <!-- Log Aktivitas Admin (Audit Log) Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="audit-log-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Log Aktivitas Keamanan &amp; Audit Admin (50 Tindakan Terakhir)
      </h2>
      <span class="panel-badge">Retensi 90 Hari</span>
    </div>

    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Jenis Tindakan</th>
            <th>Detail &amp; Dampak</th>
            <th>IP Admin</th>
          </tr>
        </thead>
        <tbody>
          ${
            logs.length === 0
              ? `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 2rem;">Belum ada log aktivitas yang tercatat.</td></tr>`
              : logs
                  .map((log) => {
                    let badgeColor = '#60a5fa';
                    let badgeBg = 'rgba(96, 165, 250, 0.15)';
                    if (log.type.includes('FAIL') || log.type.includes('REVOKE') || log.type.includes('DELETE') || log.type.includes('CLEANUP')) {
                      badgeColor = '#f87171';
                      badgeBg = 'rgba(239, 68, 68, 0.15)';
                    } else if (log.type.includes('MAINTENANCE')) {
                      badgeColor = '#fbbf24';
                      badgeBg = 'rgba(245, 158, 11, 0.15)';
                    } else if (log.type.includes('LOGIN') || log.type.includes('SYNC')) {
                      badgeColor = '#34d399';
                      badgeBg = 'rgba(16, 185, 129, 0.15)';
                    }

                    return `
            <tr>
              <td>
                <div style="font-weight: 600; font-size: 0.78rem;">${formatRelativeTime(log.timestamp)}</div>
                <div style="font-size: 0.68rem; color: var(--muted);">${formatAbsoluteTime(log.timestamp)}</div>
              </td>
              <td>
                <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">
                  ${escapeHtml(log.type)}
                </span>
              </td>
              <td style="font-size: 0.8rem; line-height: 1.4;">
                ${escapeHtml(log.detail)}
              </td>
              <td style="font-size: 0.78rem; font-weight: 600; color: var(--muted);">
                ${escapeHtml(log.ip || '-')}
              </td>
            </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </section>`;
}

export function getOperationalPanelStyles(): string {
  return `
    .btn-maint-enable {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
      padding: 0.45rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-maint-enable:hover {
      background: rgba(239, 68, 68, 0.35);
    }
    .btn-maint-disable {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 0.45rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-maint-disable:hover {
      background: rgba(16, 185, 129, 0.35);
    }
    .btn-primary-config {
      background: var(--accent);
      color: var(--accent-text, #fff);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn-primary-config:hover {
      opacity: 0.9;
    }
    .pulsing {
      animation: pulse-dot 1.5s infinite;
    }
    @keyframes pulse-dot {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
}

export function getOperationalPanelScripts(panelPath: string): string {
  return `
    // Operational Controls JS Handler
    (function() {
      const pPath = ${JSON.stringify(panelPath)};

      function showNotice(msg, isError) {
        alert(msg);
      }

      // 1. Toggle Maintenance Kill Switch
      const btnMaint = document.getElementById('btn-toggle-maintenance');
      if (btnMaint) {
        btnMaint.addEventListener('click', async function() {
          const currentlyActive = btnMaint.getAttribute('data-active') === 'true';
          const newTarget = !currentlyActive;
          const confirmMsg = newTarget
            ? 'PERINGATAN: Mengaktifkan Kill Switch akan menutup seluruh fitur unggah berkas untuk semua pengguna publik (HTTP 503). Lanjutkan?'
            : 'Aktifkan kembali layanan unggahan normal?';
          if (!confirm(confirmMsg)) return;

          try {
            btnMaint.disabled = true;
            btnMaint.textContent = 'Memproses...';
            const res = await fetch('/' + pPath + '/api/maintenance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: newTarget }),
            });
            const data = await res.json();
            if (data.success) {
              window.location.reload();
            } else {
              alert('Gagal mengubah mode maintenance: ' + (data.error?.message || 'Unknown error'));
              window.location.reload();
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
            window.location.reload();
          }
        });
      }

      // 2. Save Announcement Banner
      const btnSaveAnnounce = document.getElementById('btn-save-announcement');
      if (btnSaveAnnounce) {
        btnSaveAnnounce.addEventListener('click', async function() {
          const message = document.getElementById('announcement-message').value.trim();
          const type = document.getElementById('announcement-type').value;
          const enabled = document.getElementById('announcement-enabled').checked;

          try {
            btnSaveAnnounce.disabled = true;
            btnSaveAnnounce.textContent = 'Menyimpan...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                announcement: { message, type, enabled }
              }),
            });
            const data = await res.json();
            if (data.success) {
              alert('Banner pengumuman berhasil diperbarui.');
            } else {
              alert('Gagal menyimpan pengumuman: ' + (data.error?.message || 'Error'));
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
          } finally {
            btnSaveAnnounce.disabled = false;
            btnSaveAnnounce.textContent = 'Simpan Pengumuman';
          }
        });
      }

      // 3. Save Limits and Feature Flags
      const btnSaveLimits = document.getElementById('btn-save-limits-flags');
      if (btnSaveLimits) {
        btnSaveLimits.addEventListener('click', async function() {
          const maxUploadMb = parseInt(document.getElementById('cfg-max-upload').value, 10);
          const rateLimit = parseInt(document.getElementById('cfg-rate-limit').value, 10);
          const pasteToUpload = document.getElementById('flag-paste').checked;
          const qrCode = document.getElementById('flag-qrcode').checked;
          const pwaInstallPrompt = document.getElementById('flag-pwa').checked;

          if (isNaN(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 500) {
            alert('Ukuran berkas harus antara 1 sampai 500 MB.');
            return;
          }
          if (isNaN(rateLimit) || rateLimit < 1 || rateLimit > 200) {
            alert('Rate limit harus antara 1 sampai 200 upload/menit.');
            return;
          }

          try {
            btnSaveLimits.disabled = true;
            btnSaveLimits.textContent = 'Menyimpan...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                maxUploadSize: maxUploadMb * 1024 * 1024,
                rateLimit: { limit: rateLimit, windowMs: 60000 },
                featureFlags: { pasteToUpload, qrCode, pwaInstallPrompt }
              }),
            });
            const data = await res.json();
            if (data.success) {
              alert('Konfigurasi dinamis & feature flags berhasil diperbarui.');
            } else {
              alert('Gagal menyimpan konfigurasi: ' + (data.error?.message || 'Error'));
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
          } finally {
            btnSaveLimits.disabled = false;
            btnSaveLimits.textContent = 'Simpan Konfigurasi Dinamis';
          }
        });
      }

      // 4. Revoke Sessions
      document.querySelectorAll('.btn-revoke-single').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          const token = btn.getAttribute('data-token');
          if (!confirm('Cabut sesi admin ini? Sesi tersebut akan langsung logout.')) return;

          try {
            btn.disabled = true;
            btn.textContent = 'Mencabut...';
            const res = await fetch('/' + pPath + '/api/revoke-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokenToRevoke: token }),
            });
            const data = await res.json();
            if (data.success) {
              const row = document.getElementById('session-row-' + token);
              if (row) row.remove();
              alert('Sesi berhasil dicabut.');
            } else {
              alert('Gagal mencabut sesi.');
              btn.disabled = false;
              btn.textContent = 'Cabut';
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
            btn.disabled = false;
          }
        });
      });

      const btnRevokeAll = document.getElementById('btn-revoke-all-sessions');
      if (btnRevokeAll) {
        btnRevokeAll.addEventListener('click', async function() {
          if (!confirm('Cabut SEMUA sesi admin lain? Hanya sesi Anda saat ini yang akan tetap aktif.')) return;
          try {
            btnRevokeAll.disabled = true;
            btnRevokeAll.textContent = 'Memproses...';
            const res = await fetch('/' + pPath + '/api/revoke-all-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.success) {
              alert('Berhasil mencabut ' + data.revokedCount + ' sesi lain.');
              window.location.reload();
            } else {
              alert('Gagal mencabut semua sesi.');
              btnRevokeAll.disabled = false;
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
            btnRevokeAll.disabled = false;
          }
        });
      }

      // 5. Bulk Cleanup Two-Phase Handler
      let cachedCandidates = [];
      const btnPreviewCleanup = document.getElementById('btn-preview-cleanup');
      const previewContainer = document.getElementById('cleanup-preview-container');
      const previewSummary = document.getElementById('cleanup-preview-summary');
      const previewItems = document.getElementById('cleanup-preview-items');
      const confirmInput = document.getElementById('cleanup-confirm-text');
      const btnExecuteCleanup = document.getElementById('btn-execute-cleanup');

      if (btnPreviewCleanup) {
        btnPreviewCleanup.addEventListener('click', async function() {
          const olderThanDays = parseInt(document.getElementById('cleanup-older-than').value, 10);
          const maxViews = parseInt(document.getElementById('cleanup-max-views').value, 10);

          try {
            btnPreviewCleanup.disabled = true;
            btnPreviewCleanup.textContent = 'Memindai Database...';
            const res = await fetch('/' + pPath + '/api/bulk-cleanup/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ olderThanDays, maxViews }),
            });
            const data = await res.json();
            if (data.success) {
              cachedCandidates = data.data.items || [];
              previewContainer.style.display = 'block';
              previewSummary.innerHTML = '<strong>' + data.data.total + ' berkas</strong> memenuhi kriteria. Estimasi kapasitas storage yang akan dibebaskan: <strong>' + data.data.formattedTotalBytes + '</strong>.';

              if (cachedCandidates.length === 0) {
                previewItems.innerHTML = '<div style="color: var(--muted); font-size: 0.8rem; text-align: center; padding: 1rem;">Tidak ada berkas yang cocok dengan kriteria.</div>';
                confirmInput.disabled = true;
                btnExecuteCleanup.disabled = true;
              } else {
                confirmInput.disabled = false;
                confirmInput.value = '';
                btnExecuteCleanup.disabled = true;
                btnExecuteCleanup.style.opacity = '0.5';
                btnExecuteCleanup.style.cursor = 'not-allowed';

                previewItems.innerHTML = cachedCandidates.map(function(item) {
                  return '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">' +
                    '<span style="font-weight: 600; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (item.name || item.id) + '</span>' +
                    '<span style="color: var(--muted);">' + (item.formattedSize || '0 B') + ' | ' + (item.views || 0) + ' views</span>' +
                  '</div>';
                }).join('');
              }
            } else {
              alert('Gagal memuat pratinjau: ' + (data.error?.message || 'Error'));
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
          } finally {
            btnPreviewCleanup.disabled = false;
            btnPreviewCleanup.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> Pratinjau Berkas Terdampak';
          }
        });
      }

      if (confirmInput && btnExecuteCleanup) {
        confirmInput.addEventListener('input', function() {
          const val = confirmInput.value.trim();
          if (val === 'KONFIRMASI HAPUS MASSAL' && cachedCandidates.length > 0) {
            btnExecuteCleanup.disabled = false;
            btnExecuteCleanup.style.opacity = '1';
            btnExecuteCleanup.style.cursor = 'pointer';
          } else {
            btnExecuteCleanup.disabled = true;
            btnExecuteCleanup.style.opacity = '0.5';
            btnExecuteCleanup.style.cursor = 'not-allowed';
          }
        });

        btnExecuteCleanup.addEventListener('click', async function() {
          if (confirmInput.value.trim() !== 'KONFIRMASI HAPUS MASSAL') return;
          const olderThanDays = parseInt(document.getElementById('cleanup-older-than').value, 10);
          const maxViews = parseInt(document.getElementById('cleanup-max-views').value, 10);

          try {
            btnExecuteCleanup.disabled = true;
            btnExecuteCleanup.textContent = 'Menghapus Berkas...';
            const res = await fetch('/' + pPath + '/api/bulk-cleanup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ olderThanDays, maxViews, confirm: true }),
            });
            const data = await res.json();
            if (data.success) {
              alert('Pembersihan massal selesai! ' + data.data.succeeded + ' berkas berhasil dihapus permanen. Total storage dibebaskan: ' + data.data.formattedFreedBytes);
              window.location.reload();
            } else {
              alert('Gagal menjalankan pembersihan massal: ' + (data.error?.message || 'Error'));
              btnExecuteCleanup.disabled = false;
              btnExecuteCleanup.textContent = 'Jalankan Hapus Massal Permanen';
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
            btnExecuteCleanup.disabled = false;
          }
        });
      }

      // 6. Search files in Recent Uploads table & full database
      const searchInput = document.getElementById('search-files-input');
      const btnSearchDb = document.getElementById('btn-search-db');
      const btnResetSearch = document.getElementById('btn-reset-search');
      const searchCountLabel = document.getElementById('search-count-label');

      function filterTableLocally(term) {
        const rows = document.querySelectorAll('tr[id^="upload-row-"]');
        let matched = 0;
        rows.forEach(function(row) {
          const text = row.textContent.toLowerCase();
          if (!term || text.includes(term.toLowerCase())) {
            row.style.display = '';
            matched++;
          } else {
            row.style.display = 'none';
          }
        });
        if (searchCountLabel) {
          searchCountLabel.textContent = term ? ('Menampilkan ' + matched + ' hasil lokal') : '';
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          filterTableLocally(searchInput.value.trim());
        });
      }

      if (btnResetSearch) {
        btnResetSearch.addEventListener('click', function() {
          if (searchInput) searchInput.value = '';
          filterTableLocally('');
        });
      }

      if (btnSearchDb && searchInput) {
        btnSearchDb.addEventListener('click', async function() {
          const q = searchInput.value.trim();
          if (!q) {
            alert('Masukkan kata kunci pencarian.');
            return;
          }
          try {
            btnSearchDb.disabled = true;
            btnSearchDb.textContent = 'Mencari...';
            const res = await fetch('/' + pPath + '/api/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (data.success) {
              const items = data.data.items || [];
              alert('Ditemukan ' + items.length + ' berkas di seluruh database yang cocok dengan "' + q + '".');
              filterTableLocally(q);
            } else {
              alert('Pencarian gagal: ' + (data.error?.message || 'Error'));
            }
          } catch (err) {
            alert('Gagal menghubungi server.');
          } finally {
            btnSearchDb.disabled = false;
            btnSearchDb.textContent = 'Cari di Seluruh DB';
          }
        });
      }
    })();
  `;
}
