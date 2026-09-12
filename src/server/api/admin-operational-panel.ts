import { SystemConfig, AnnouncementBanner, MaintenanceLevel } from '../security/system-config';
import { AdminSessionInfo } from '../security/admin-auth';
import { AuditLogEntry } from '../repository/audit-log-repository';
import { isUpstashConfigured } from '../storage/redis-client';

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

export interface IosDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  badgeColor?: string;
}

export function renderIosDropdown(
  id: string,
  labelText: string,
  options: IosDropdownOption[],
  selectedValue: string
): string {
  const selectedOption = options.find((o) => o.value === selectedValue) || options[0];
  const optionsHtml = options
    .map((opt) => {
      const isSel = opt.value === selectedOption.value;
      return `
      <div class="ios-sheet-item ${isSel ? 'selected' : ''}" role="option" aria-selected="${isSel}" data-value="${escapeHtml(opt.value)}" data-label="${escapeHtml(opt.label)}" tabindex="0">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          ${opt.badgeColor ? `<span class="ios-sheet-dot" style="background: ${opt.badgeColor};"></span>` : ''}
          <div>
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(opt.label)}</div>
            ${opt.sublabel ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.1rem;">${escapeHtml(opt.sublabel)}</div>` : ''}
          </div>
        </div>
        <svg class="ios-sheet-check ${isSel ? 'visible' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    `;
    })
    .join('');

  return `
    <div class="ios-select-wrapper" data-dropdown-id="${escapeHtml(id)}">
      <input type="hidden" id="${escapeHtml(id)}" value="${escapeHtml(selectedOption.value)}" />
      <button type="button" class="ios-select-trigger" id="${escapeHtml(id)}-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(labelText)}">
        <span class="ios-select-trigger-label" id="${escapeHtml(id)}-trigger-label">
          ${selectedOption.badgeColor ? `<span class="ios-sheet-dot" style="background: ${selectedOption.badgeColor}; margin-right: 0.4rem;"></span>` : ''}
          <span>${escapeHtml(selectedOption.label)}</span>
        </span>
        <svg class="ios-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      <!-- Desktop Popover & Mobile Action Sheet -->
      <div class="ios-sheet-backdrop" id="${escapeHtml(id)}-backdrop" style="display: none;"></div>
      <div class="ios-sheet-modal" id="${escapeHtml(id)}-modal" role="listbox" aria-label="${escapeHtml(labelText)}" style="display: none;">
        <div class="ios-sheet-header">
          <div class="ios-sheet-handle"></div>
          <div class="ios-sheet-title">${escapeHtml(labelText)}</div>
        </div>
        <div class="ios-sheet-body">
          ${optionsHtml}
        </div>
        <div class="ios-sheet-footer">
          <button type="button" class="ios-sheet-btn-cancel">Batal</button>
        </div>
      </div>
    </div>
  `;
}

export function renderOperationalControlsHtml(config: SystemConfig): string {
  const currentLevel: MaintenanceLevel = (config as any).maintenanceLevel || (config.maintenanceMode ? 'upload_only' : 'off');
  const announcement: AnnouncementBanner = config.announcement || { message: '', type: 'info' as const, enabled: false, updatedAt: 0, expiresAt: null };
  const maxMb = Math.round(config.maxUploadSize / (1024 * 1024));

  const announcementTypeOptions: IosDropdownOption[] = [
    { value: 'info', label: 'Info (Biru)', sublabel: 'Pemberitahuan umum & informasi rilis', badgeColor: '#38bdf8' },
    { value: 'warning', label: 'Peringatan (Kuning/Oranye)', sublabel: 'Jadwal pemeliharaan & limitasi', badgeColor: '#fbbf24' },
    { value: 'success', label: 'Sukses (Hijau)', sublabel: 'Pembaruan fitur & promosi', badgeColor: '#34d399' },
  ];

  const expiryOptions: IosDropdownOption[] = [
    { value: '0', label: 'Tanpa Batas Waktu (Permanen)', sublabel: 'Tetap tayang sampai dinonaktifkan manual' },
    { value: '3600000', label: '1 Jam', sublabel: 'Otomatis berakhir dalam 60 menit' },
    { value: '21600000', label: '6 Jam', sublabel: 'Otomatis berakhir dalam 6 jam' },
    { value: '43200000', label: '12 Jam', sublabel: 'Otomatis berakhir dalam 12 jam' },
    { value: '86400000', label: '24 Jam (1 Hari)', sublabel: 'Otomatis berakhir besok di jam yang sama' },
    { value: '259200000', label: '3 Hari', sublabel: 'Otomatis berakhir dalam 72 jam' },
    { value: '604800000', label: '7 Hari (1 Minggu)', sublabel: 'Otomatis berakhir dalam 7 hari' },
    { value: 'custom', label: 'Pilih Tanggal & Waktu Khusus...', sublabel: 'Tentukan tanggal kedaluwarsa spesifik' },
  ];

  let selectedExpiryValue = '0';
  let customExpiresIso = '';
  if (announcement.expiresAt && announcement.expiresAt > Date.now()) {
    selectedExpiryValue = 'custom';
    const expDate = new Date(announcement.expiresAt);
    customExpiresIso = expDate.toISOString().slice(0, 16);
  }

  const hasActiveAnnouncement = Boolean(announcement.message && announcement.message.trim().length > 0);
  const isExpired = Boolean(announcement.expiresAt && announcement.expiresAt <= Date.now());

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

    <!-- Redis Warning Banner (Shown if Upstash is not configured) -->
    ${
      !isUpstashConfigured()
        ? `
    <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.25rem; display: flex; align-items: flex-start; gap: 0.75rem; color: #fbbf24; font-size: 0.825rem; line-height: 1.5;">
      <svg style="flex-shrink: 0; margin-top: 2px;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <strong>Peringatan Database Persisten:</strong> Upstash Redis belum terhubung. Konfigurasi operasional saat ini berjalan dalam memori lokal dan <em>tidak tersinkronisasi lintas worker serverless Vercel</em>. Tambahkan <code>UPSTASH_REDIS_REST_URL</code> dan <code>UPSTASH_REDIS_REST_TOKEN</code> di Vercel Environment Variables.
      </div>
    </div>
    `
        : ''
    }

    <!-- Kill Switch Section -->
    <div id="kill-switch-card" style="background: ${currentLevel === 'full_lockdown' ? 'rgba(239, 68, 68, 0.16)' : currentLevel === 'upload_only' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${currentLevel === 'full_lockdown' ? 'rgba(239, 68, 68, 0.45)' : currentLevel === 'upload_only' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.25)'}; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; transition: all 0.3s ease;">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <span id="kill-switch-indicator" class="status-indicator ${currentLevel === 'off' ? 'status-ok' : 'status-err pulsing'}"></span>
        <div>
          <div id="kill-switch-title" style="font-weight: 700; font-size: 0.95rem; color: ${currentLevel === 'full_lockdown' ? '#f87171' : currentLevel === 'upload_only' ? '#fbbf24' : '#34d399'};">
            ${
              currentLevel === 'full_lockdown'
                ? 'LOCKDOWN TOTAL — Seluruh Akses Publik Ditutup (503)'
                : currentLevel === 'upload_only'
                ? 'TUTUP UPLOAD — Unggahan Dinonaktifkan (503), Share Link Tetap Aktif'
                : 'Layanan Normal — Unggahan &amp; Berbagi Terbuka'
            }
          </div>
          <div id="kill-switch-desc" style="font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem;">
            ${
              currentLevel === 'full_lockdown'
                ? 'Seluruh unggahan baru DAN akses share landing publik diblokir (503). Hanya admin yang dapat mengakses sistem.'
                : currentLevel === 'upload_only'
                ? 'Pengguna publik yang mencoba mengunggah akan menerima respon HTTP 503. Tautan share yang sudah ada tetap dapat dibuka.'
                : 'Semua pengguna dapat mengunggah dan mengakses berkas sesuai kapasitas yang ditentukan.'
            }
          </div>
        </div>
      </div>
      <div>
        <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Status Kill Switch</label>
        <button type="button" id="killswitch-level-trigger" class="ios-select-trigger" data-value="${currentLevel}">
          <span id="killswitch-level-label">${
            currentLevel === 'full_lockdown' ? 'Lockdown Total' :
            currentLevel === 'upload_only' ? 'Tutup Upload Saja' : 'Normal (Aktif)'
          }</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
    </div>

    <!-- 2 Column Config Forms -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
      <!-- Announcement Banner Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <h3 style="font-size: 0.9rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
            Banner Pengumuman Sistem
          </h3>
          ${
            announcement.expiresAt && !isExpired
              ? `<span id="banner-expiry-badge" style="font-size: 0.7rem; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px;">Berakhir: ${formatAbsoluteTime(announcement.expiresAt)}</span>`
              : isExpired
              ? `<span id="banner-expiry-badge" style="font-size: 0.7rem; font-weight: 700; color: #f87171; background: rgba(239, 68, 68, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px;">Expired (${formatRelativeTime(announcement.expiresAt!)})</span>`
              : ''
          }
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Teks Pengumuman</label>
            <textarea id="announcement-message" rows="3" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.6rem 0.75rem; font-size: 0.825rem; resize: vertical;" placeholder="Contoh: Pemeliharaan server dijadwalkan pukul 23:00 WIB...">${escapeHtml(announcement.message || '')}</textarea>
          </div>

          <div class="config-form-grid">
            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Tipe Tampilan</label>
              ${renderIosDropdown('announcement-type', 'Pilih Tipe Tampilan', announcementTypeOptions, announcement.type || 'info')}
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Batas Waktu Tayang (Expiry)</label>
              ${renderIosDropdown('announcement-expiry', 'Pilih Batas Waktu Tayang', expiryOptions, selectedExpiryValue)}
            </div>
          </div>

          <!-- Custom Expiry Datetime (Shown when custom is selected) -->
          <div id="announcement-custom-expiry-container" style="display: ${selectedExpiryValue === 'custom' ? 'block' : 'none'};">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.35rem;">Waktu Kedaluwarsa Spesifik</label>
            <input type="datetime-local" id="announcement-custom-expiry-input" value="${customExpiresIso}" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
            <span style="font-size: 0.7rem; color: var(--muted);">Banner otomatis hilang setelah melewati waktu ini.</span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 0.25rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.825rem; font-weight: 600; cursor: pointer;">
              <input type="checkbox" id="announcement-enabled" ${announcement.enabled ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent);" />
              <span>Tampilkan Banner di Frontend</span>
            </label>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
            <button type="button" id="btn-save-announcement" class="btn-primary-config" style="flex: 1; min-width: 140px;">
              Simpan Pengumuman
            </button>
            <button type="button" id="btn-delete-announcement" class="btn-danger-subtle" style="display: ${hasActiveAnnouncement ? 'inline-flex' : 'none'}; align-items: center; justify-content: center; gap: 0.35rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Hapus Pengumuman
            </button>
          </div>
        </div>
      </div>

      <!-- Limit & Feature Flags Config -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Batas Unggah &amp; Feature Flags
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div class="config-form-grid">
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
                <input type="checkbox" id="flag-paste" ${config.featureFlags.pasteToUpload ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent);" />
                <span>Aktifkan Paste-to-Upload (Ctrl+V)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-qrcode" ${config.featureFlags.qrCode ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent);" />
                <span>Tampilkan Generator QR Code Tautan</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; cursor: pointer;">
                <input type="checkbox" id="flag-pwa" ${config.featureFlags.pwaInstallPrompt ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent);" />
                <span>Tampilkan Banner Instalasi PWA</span>
              </label>
            </div>
          </div>

          <button type="button" id="btn-save-limits-flags" class="btn-primary-config" style="margin-top: 0.5rem;">
            Simpan Batas &amp; Flags
          </button>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderActiveSessionsHtml(sessions: AdminSessionInfo[], currentToken: string = ''): string {
  return `
  <!-- Sesi Admin Aktif Panel -->
  <section class="panel" style="margin-bottom: 1.5rem;" id="sessions-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Sesi Admin Aktif (${sessions.length})
      </h2>
      <button type="button" id="btn-revoke-all-sessions" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
        Cabut Semua Sesi Lain
      </button>
    </div>

    <div class="table-container">
      <table style="min-width: 600px;">
        <thead>
          <tr>
            <th>Status / Perangkat</th>
            <th>IP Address</th>
            <th>Waktu Login</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${
            sessions.length === 0
              ? `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 2rem;">Tidak ada sesi aktif lain.</td></tr>`
              : sessions
                  .map((s) => {
                    const isCurrent = s.isCurrent || s.token === currentToken;
                    return `
            <tr id="session-row-${s.token}">
              <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="status-indicator ${isCurrent ? 'status-ok' : 'status-warn'}"></span>
                  <div>
                    <div style="font-weight: 600; font-size: 0.8rem;">${isCurrent ? 'Sesi Ini (Perangkat Anda)' : 'Sesi Lain'}</div>
                    <div style="font-size: 0.7rem; color: var(--muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(s.userAgent)}">
                      ${escapeHtml(s.userAgent.split(' ')[0] || 'Unknown Client')}
                    </div>
                  </div>
                </div>
              </td>
              <td style="font-size: 0.8rem; font-weight: 600;">${escapeHtml(s.ip)}</td>
              <td style="font-size: 0.75rem; color: var(--muted);">${formatRelativeTime(s.loginAt)}</td>
              <td>
                ${
                  isCurrent
                    ? `<span style="font-size: 0.75rem; color: var(--muted); font-style: italic;">Sedang Digunakan</span>`
                    : `<button type="button" class="btn-revoke-single" data-token="${s.token}" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Cabut</button>`
                }
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

export function renderBulkCleanupHtml(): string {
  const cleanupAgeOptions: IosDropdownOption[] = [
    { value: '7', label: 'Lebih dari 7 Hari Lalu', sublabel: 'Unggahan yang lebih tua dari 1 minggu' },
    { value: '30', label: 'Lebih dari 30 Hari Lalu', sublabel: 'Unggahan yang lebih tua dari 1 bulan (Direkomendasikan)' },
    { value: '60', label: 'Lebih dari 60 Hari Lalu', sublabel: 'Unggahan yang lebih tua dari 2 bulan' },
    { value: '90', label: 'Lebih dari 90 Hari Lalu', sublabel: 'Unggahan yang lebih tua dari 3 bulan' },
    { value: '0', label: 'Semua Usia Berkas (Tanpa Batas)', sublabel: 'Hanya berdasarkan kriteria jumlah tayangan (views)' },
  ];

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

    <div style="background: var(--surface-primary); border: 1px solid var(--border-subtle); border-radius: 1.25rem; padding: 1.25rem;">
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
        Bersihkan berkas lama yang tidak aktif dalam jumlah banyak sekaligus. Setiap eksekusi wajib melalui tahap <strong>Pratinjau Dampak</strong> dan <strong>Ketik Konfirmasi Teks</strong> sebelum penghapusan permanen dijalankan.
      </p>

      <!-- Filter Controls -->
      <div style="display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
        <div style="flex: 1; min-width: 220px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Usia Berkas (Diunggah Sebelum)</label>
          ${renderIosDropdown('cleanup-older-than', 'Pilih Usia Berkas', cleanupAgeOptions, '30')}
        </div>

        <div style="flex: 1; min-width: 160px;">
          <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Maksimal Jumlah Tayangan (Views)</label>
          <input type="number" id="cleanup-max-views" min="0" value="0" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 0.75rem; color: var(--text-main); padding: 0.5rem 0.6rem; font-size: 0.825rem;" />
          <span style="font-size: 0.7rem; color: var(--text-muted);">0 = tidak pernah dilihat siapapun</span>
        </div>

        <button type="button" id="btn-preview-cleanup" style="background: var(--accent); color: var(--accent-text, #fff); border: none; padding: 0.55rem 1.25rem; border-radius: 0.75rem; font-size: 0.825rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; height: 38px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Pratinjau Berkas Terdampak
        </button>
      </div>

      <!-- Preview Results Container (Hidden initially) -->
      <div id="cleanup-preview-container" style="display: none; border-top: 1px solid var(--border-subtle); padding-top: 1.25rem;">
        <div id="cleanup-preview-summary" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1rem; font-size: 0.85rem; color: #fbbf24;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Matched Items List (Collapsible) -->
        <div id="cleanup-preview-items" style="max-height: 220px; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 0.75rem; margin-bottom: 1rem; padding: 0.5rem;">
          <!-- Populated dynamically via JS -->
        </div>

        <!-- Safety Confirmation Input & Execute Button -->
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.75rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: #f87171;">
            PERINGATAN: Penghapusan bersifat ireversibel dari server Catbox &amp; database AirShare!
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Ketik teks berikut persis untuk mengaktifkan tombol eksekusi: <code style="color: #fff; background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: 800;">KONFIRMASI HAPUS MASSAL</code>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <input type="text" id="cleanup-confirm-text" placeholder="KONFIRMASI HAPUS MASSAL" style="flex: 1; min-width: 240px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 0.75rem; color: var(--text-main); padding: 0.5rem 0.75rem; font-size: 0.825rem;" />
            <button type="button" id="btn-execute-cleanup" disabled style="background: #ef4444; color: #fff; border: none; padding: 0.55rem 1.25rem; border-radius: 0.75rem; font-size: 0.825rem; font-weight: 700; cursor: not-allowed; opacity: 0.5;">
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

    <div class="table-container" style="max-height: 420px; overflow-y: auto;">
      <table style="min-width: 680px;">
        <thead>
          <tr>
            <th>Waktu &amp; Tanggal</th>
            <th>Tipe Aksi</th>
            <th>Rincian Aktivitas</th>
            <th>IP Address</th>
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
                    if (
                      log.type.includes('FAIL') ||
                      log.type.includes('REVOKE') ||
                      log.type.includes('DELETE') ||
                      log.type.includes('CLEANUP')
                    ) {
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
              <td style="white-space: nowrap;">
                <div style="font-weight: 600; font-size: 0.78rem;">${formatRelativeTime(log.timestamp)}</div>
                <div style="font-size: 0.68rem; color: var(--muted);">${formatAbsoluteTime(log.timestamp)}</div>
              </td>
              <td>
                <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; white-space: nowrap;">
                  ${escapeHtml(log.type)}
                </span>
              </td>
              <td style="font-size: 0.8rem; line-height: 1.45; word-break: break-word;">
                ${escapeHtml(log.detail)}
              </td>
              <td style="font-size: 0.78rem; font-weight: 600; color: var(--muted); white-space: nowrap;">
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
    .config-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 640px) {
      .config-form-grid {
        grid-template-columns: 1fr;
      }
    }
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
    .btn-danger-subtle {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-danger-subtle:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.5);
    }
    .pulsing {
      animation: pulse-dot 1.5s infinite;
    }
    @keyframes pulse-dot {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* iOS Custom Action Sheet & Popover Select Styling */
    .ios-select-wrapper {
      position: relative;
      width: 100%;
    }
    .ios-select-trigger {
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      color: var(--text-main);
      padding: 0.55rem 0.75rem;
      font-size: 0.825rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .ios-select-trigger:hover, .ios-select-trigger:focus-visible {
      border-color: var(--accent);
      outline: none;
    }
    .ios-select-trigger-label {
      display: flex;
      align-items: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .ios-select-chevron {
      color: var(--text-muted);
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .ios-select-wrapper.open .ios-select-chevron {
      transform: rotate(180deg);
    }
    .ios-sheet-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    /* Desktop Popover mode (screen >= 641px) */
    @media (min-width: 641px) {
      .ios-sheet-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: transparent;
      }
      .ios-sheet-modal {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 1001;
        background: var(--surface-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: 0.75rem;
        box-shadow: var(--shadow-modal, 0 10px 25px -5px rgba(0, 0, 0, 0.2));
        padding: 0.35rem;
        max-height: 280px;
        overflow-y: auto;
        animation: iosDropdownFadeIn 0.15s ease-out;
      }
      .ios-sheet-header, .ios-sheet-footer {
        display: none !important;
      }
      .ios-sheet-item {
        padding: 0.5rem 0.65rem;
        border-radius: 0.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        transition: background-color 0.15s;
        outline: none;
        color: var(--text-main);
      }
      .ios-sheet-item:hover, .ios-sheet-item:focus-visible {
        background: var(--surface-hover);
      }
      .ios-sheet-item.selected {
        background: var(--accent-soft);
      }
      .ios-sheet-check {
        color: var(--accent);
        opacity: 0;
        transition: opacity 0.15s;
      }
      .ios-sheet-check.visible {
        opacity: 1;
      }
    }

    /* Mobile iOS Action Sheet mode (screen <= 640px) */
    @media (max-width: 640px) {
      .ios-sheet-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 1100;
        animation: iosBackdropFadeIn 0.25s ease-out;
      }
      .ios-sheet-modal {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1101;
        background: var(--surface-elevated);
        border-top: 1px solid var(--border-subtle);
        border-radius: 1.25rem 1.25rem 0 0;
        padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
        max-height: 80vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        animation: iosSheetSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: var(--shadow-modal, 0 -10px 30px rgba(0, 0, 0, 0.4));
      }
      .ios-sheet-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      .ios-sheet-handle {
        width: 36px;
        height: 4px;
        border-radius: 2px;
        background: var(--border-subtle);
        margin-bottom: 0.6rem;
      }
      .ios-sheet-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--text-main);
        text-align: center;
      }
      .ios-sheet-body {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.75rem;
      }
      .ios-sheet-item {
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        background: var(--surface-secondary);
        border: 1px solid var(--border-subtle);
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 48px;
        cursor: pointer;
        outline: none;
        color: var(--text-main);
      }
      .ios-sheet-item:active {
        background: var(--surface-hover);
      }
      .ios-sheet-item.selected {
        background: var(--accent-soft);
        border-color: var(--accent);
      }
      .ios-sheet-check {
        color: var(--accent);
        opacity: 0;
      }
      .ios-sheet-check.visible {
        opacity: 1;
      }
      .ios-sheet-footer {
        margin-top: 0.25rem;
      }
      .ios-sheet-btn-cancel {
        width: 100%;
        padding: 0.75rem;
        border-radius: 0.75rem;
        background: var(--surface-hover);
        border: 1px solid var(--border-subtle);
        color: var(--text-main);
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
        min-height: 44px;
      }
      .ios-sheet-btn-cancel:active {
        background: var(--surface-active);
      }
    }

    @keyframes iosDropdownFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes iosBackdropFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes iosSheetSlideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
  `;
}

export function getOperationalPanelScripts(panelPath: string): string {
  return `
    // Operational Controls JS Handler
    (function() {
      const pPath = "${panelPath}";

      // Initialize iOS Dropdowns
      function initIosDropdowns() {
        document.querySelectorAll('.ios-select-wrapper').forEach(function(wrapper) {
          const trigger = wrapper.querySelector('.ios-select-trigger');
          const hiddenInput = wrapper.querySelector('input[type="hidden"]');
          const triggerLabel = wrapper.querySelector('.ios-select-trigger-label');
          const backdrop = wrapper.querySelector('.ios-sheet-backdrop');
          const modal = wrapper.querySelector('.ios-sheet-modal');
          const cancelBtn = wrapper.querySelector('.ios-sheet-btn-cancel');
          const items = wrapper.querySelectorAll('.ios-sheet-item');
          const dropdownId = wrapper.getAttribute('data-dropdown-id');

          function openDropdown() {
            // Close other open dropdowns
            document.querySelectorAll('.ios-select-wrapper.open').forEach(function(other) {
              if (other !== wrapper) {
                const b = other.querySelector('.ios-sheet-backdrop');
                const m = other.querySelector('.ios-sheet-modal');
                const t = other.querySelector('.ios-select-trigger');
                other.classList.remove('open');
                if (b) b.style.display = 'none';
                if (m) m.style.display = 'none';
                if (t) t.setAttribute('aria-expanded', 'false');
              }
            });

            wrapper.classList.add('open');
            if (backdrop) backdrop.style.display = 'block';
            if (modal) modal.style.display = 'block';
            if (trigger) trigger.setAttribute('aria-expanded', 'true');
          }

          function closeDropdown() {
            wrapper.classList.remove('open');
            if (backdrop) backdrop.style.display = 'none';
            if (modal) modal.style.display = 'none';
            if (trigger) {
              trigger.setAttribute('aria-expanded', 'false');
              trigger.focus();
            }
          }

          if (trigger) {
            trigger.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              if (wrapper.classList.contains('open')) {
                closeDropdown();
              } else {
                openDropdown();
              }
            });
          }

          if (backdrop) {
            backdrop.addEventListener('click', function(e) {
              e.stopPropagation();
              closeDropdown();
            });
          }

          if (cancelBtn) {
            cancelBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              closeDropdown();
            });
          }

          items.forEach(function(item) {
            item.addEventListener('click', function(e) {
              e.stopPropagation();
              const val = item.getAttribute('data-value');
              const label = item.getAttribute('data-label');
              const dot = item.querySelector('.ios-sheet-dot');

              if (hiddenInput) {
                hiddenInput.value = val;
                // Dispatch change event
                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
              }

              if (triggerLabel) {
                let dotHtml = '';
                if (dot) {
                  const bg = dot.style.backgroundColor || dot.style.background;
                  dotHtml = '<span class="ios-sheet-dot" style="background: ' + bg + '; margin-right: 0.4rem;"></span>';
                }
                triggerLabel.innerHTML = dotHtml + '<span>' + label + '</span>';
              }

              items.forEach(function(i) {
                i.classList.remove('selected');
                i.setAttribute('aria-selected', 'false');
                const check = i.querySelector('.ios-sheet-check');
                if (check) check.classList.remove('visible');
              });

              item.classList.add('selected');
              item.setAttribute('aria-selected', 'true');
              const itemCheck = item.querySelector('.ios-sheet-check');
              if (itemCheck) itemCheck.classList.add('visible');

              closeDropdown();

              // Special trigger for Expiry Dropdown
              if (dropdownId === 'announcement-expiry') {
                const customContainer = document.getElementById('announcement-custom-expiry-container');
                if (customContainer) {
                  customContainer.style.display = val === 'custom' ? 'block' : 'none';
                }
              }
            });

            item.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
              }
            });
          });
        });

        // Global Esc key closes any open dropdown
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            document.querySelectorAll('.ios-select-wrapper.open').forEach(function(w) {
              const b = w.querySelector('.ios-sheet-backdrop');
              const m = w.querySelector('.ios-sheet-modal');
              const t = w.querySelector('.ios-select-trigger');
              w.classList.remove('open');
              if (b) b.style.display = 'none';
              if (m) m.style.display = 'none';
              if (t) t.setAttribute('aria-expanded', 'false');
            });
          }
        });
      }

      initIosDropdowns();

      // Dynamic iOS Action Sheet Modal Helper
      function showIosActionSheet(opts) {
        return new Promise(function(resolve) {
          const title = opts.title || 'Pilih Opsi';
          const currentValue = opts.currentValue;
          const choices = opts.choices || [];

          const overlay = document.createElement('div');
          overlay.className = 'ios-select-wrapper open';
          overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;';

          const backdrop = document.createElement('div');
          backdrop.className = 'ios-sheet-backdrop';
          backdrop.style.display = 'block';

          const modal = document.createElement('div');
          modal.className = 'ios-sheet-modal';
          modal.style.display = 'block';
          modal.style.width = '100%';
          modal.style.maxWidth = '480px';
          modal.style.margin = '0 auto';

          let itemsHtml = '';
          choices.forEach(function(c) {
            const isSel = c.value === currentValue;
            itemsHtml += '<div class="ios-sheet-item ' + (isSel ? 'selected' : '') + '" data-value="' + c.value + '" tabindex="0" role="option" aria-selected="' + isSel + '">' +
              '<div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">' + c.label + '</div>' +
              '<svg class="ios-sheet-check ' + (isSel ? 'visible' : '') + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</div>';
          });

          modal.innerHTML = 
            '<div class="ios-sheet-header">' +
              '<div class="ios-sheet-handle"></div>' +
              '<div class="ios-sheet-title">' + title + '</div>' +
            '</div>' +
            '<div class="ios-sheet-body">' + itemsHtml + '</div>' +
            '<div class="ios-sheet-footer">' +
              '<button type="button" class="ios-sheet-btn-cancel">Batal</button>' +
            '</div>';

          overlay.appendChild(backdrop);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          function cleanup(result) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(result);
          }

          backdrop.addEventListener('click', function() { cleanup(null); });
          const cancelBtn = modal.querySelector('.ios-sheet-btn-cancel');
          if (cancelBtn) cancelBtn.addEventListener('click', function() { cleanup(null); });

          modal.querySelectorAll('.ios-sheet-item').forEach(function(item) {
            item.addEventListener('click', function() {
              const val = item.getAttribute('data-value');
              cleanup(val);
            });
            item.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const val = item.getAttribute('data-value');
                cleanup(val);
              }
            });
          });
        });
      }

      // Native Alert & Confirm Fallbacks
      async function alertIos(title, message, type) {
        if (window.showIosAdminAlert) {
          return await window.showIosAdminAlert(title, message, type);
        } else {
          alert(title + '\\n\\n' + message);
        }
      }

      async function confirmIos(title, message, isDestructive, confirmLabel) {
        if (window.showIosAdminConfirm) {
          return await new Promise(function(resolve) {
            window.showIosAdminConfirm({
              title: title,
              message: message,
              isDestructive: isDestructive,
              confirmText: confirmLabel || 'Konfirmasi',
              cancelText: 'Batal',
              onConfirm: function() { resolve(true); },
              onCancel: function() { resolve(false); }
            });
          });
        } else {
          return confirm(title + '\\n\\n' + message);
        }
      }

      // 1. Kill Switch 3-Level Selector (In-place UI update without full reload)
      const killswitchTrigger = document.getElementById('killswitch-level-trigger');
      const killswitchLabel = document.getElementById('killswitch-level-label');
      const killCard = document.getElementById('kill-switch-card');
      const killTitle = document.getElementById('kill-switch-title');
      const killDesc = document.getElementById('kill-switch-desc');
      const killIndicator = document.getElementById('kill-switch-indicator');

      if (killswitchTrigger) {
        killswitchTrigger.addEventListener('click', async function() {
          const currentLevel = killswitchTrigger.getAttribute('data-value') || 'off';
          const selected = await showIosActionSheet({
            title: 'Pilih Status Kill Switch',
            currentValue: currentLevel,
            choices: [
              { value: 'off', label: 'Normal (Aktif)' },
              { value: 'upload_only', label: 'Tutup Upload Saja' },
              { value: 'full_lockdown', label: 'Lockdown Total' },
            ],
          });
          if (selected === null || selected === currentLevel) return;

          const levelWarnings = {
            off: { title: 'Aktifkan Layanan Normal?', desc: 'Seluruh fitur upload dan akses berkas akan kembali normal untuk publik.', danger: false, confirmLabel: 'Aktifkan Normal' },
            upload_only: { title: 'Tutup Upload Saja?', desc: 'Upload baru akan DITOLAK untuk semua pengguna publik (503). Berkas yang sudah dibagikan sebelumnya TETAP BISA diakses/didownload seperti biasa.', danger: true, confirmLabel: 'Tutup Upload' },
            full_lockdown: { title: 'Aktifkan Lockdown Total?', desc: 'PERINGATAN KERAS: Upload DAN seluruh akses share link akan DITOLAK TOTAL untuk semua pengguna publik (503), termasuk berkas yang sudah pernah dibagikan sebelumnya. Gunakan hanya untuk situasi darurat.', danger: true, confirmLabel: 'Aktifkan Lockdown' },
          }[selected];

          const confirmed = await confirmIos(levelWarnings.title, levelWarnings.desc, levelWarnings.danger, levelWarnings.confirmLabel);
          if (!confirmed) return;

          try {
            killswitchTrigger.disabled = true;
            const res = await fetch('/' + pPath + '/api/maintenance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ level: selected }),
            });
            const data = await res.json();
            if (data.success) {
              const newLevel = data.maintenanceLevel || selected;
              killswitchTrigger.setAttribute('data-value', newLevel);
              if (killswitchLabel) {
                killswitchLabel.textContent =
                  newLevel === 'full_lockdown' ? 'Lockdown Total' :
                  newLevel === 'upload_only' ? 'Tutup Upload Saja' : 'Normal (Aktif)';
              }

              if (killCard) {
                killCard.style.background = newLevel === 'full_lockdown' ? 'rgba(239, 68, 68, 0.16)' : newLevel === 'upload_only' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.08)';
                killCard.style.borderColor = newLevel === 'full_lockdown' ? 'rgba(239, 68, 68, 0.45)' : newLevel === 'upload_only' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.25)';
              }
              if (killTitle) {
                killTitle.style.color = newLevel === 'full_lockdown' ? '#f87171' : newLevel === 'upload_only' ? '#fbbf24' : '#34d399';
                killTitle.textContent =
                  newLevel === 'full_lockdown'
                    ? 'LOCKDOWN TOTAL — Seluruh Akses Publik Ditutup (503)'
                    : newLevel === 'upload_only'
                    ? 'TUTUP UPLOAD — Unggahan Dinonaktifkan (503), Share Link Tetap Aktif'
                    : 'Layanan Normal — Unggahan & Berbagi Terbuka';
              }
              if (killDesc) {
                killDesc.textContent =
                  newLevel === 'full_lockdown'
                    ? 'Seluruh unggahan baru DAN akses share landing publik diblokir (503). Hanya admin yang dapat mengakses sistem.'
                    : newLevel === 'upload_only'
                    ? 'Pengguna publik yang mencoba mengunggah akan menerima respon HTTP 503. Tautan share yang sudah ada tetap dapat dibuka.'
                    : 'Semua pengguna dapat mengunggah dan mengakses berkas sesuai kapasitas yang ditentukan.';
              }
              if (killIndicator) {
                killIndicator.className = 'status-indicator ' + (newLevel === 'off' ? 'status-ok' : 'status-err pulsing');
              }

              await alertIos(
                newLevel === 'off' ? 'Layanan Normal' : newLevel === 'upload_only' ? 'Tutup Upload Aktif' : 'Lockdown Total Aktif',
                data.message || 'Status Kill Switch berhasil diperbarui.',
                newLevel === 'off' ? 'success' : 'warning'
              );
            } else {
              await alertIos('Gagal Mengubah Status', data.error?.message || 'Status Kill Switch TIDAK berubah.', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server. Status Kill Switch TIDAK berubah.', 'danger');
          } finally {
            killswitchTrigger.disabled = false;
          }
        });
      }

      // 2. Save Announcement Banner
      const btnSaveAnnounce = document.getElementById('btn-save-announcement');
      const btnDeleteAnnounce = document.getElementById('btn-delete-announcement');

      if (btnSaveAnnounce) {
        btnSaveAnnounce.addEventListener('click', async function() {
          const message = document.getElementById('announcement-message').value.trim();
          const typeInput = document.getElementById('announcement-type');
          const type = typeInput ? typeInput.value : 'info';
          const enabled = document.getElementById('announcement-enabled').checked;
          const expiryVal = document.getElementById('announcement-expiry') ? document.getElementById('announcement-expiry').value : '0';

          let calculatedExpiresAt = null;
          if (expiryVal === 'custom') {
            const customInput = document.getElementById('announcement-custom-expiry-input');
            if (customInput && customInput.value) {
              const parsed = new Date(customInput.value).getTime();
              if (!isNaN(parsed) && parsed > Date.now()) {
                calculatedExpiresAt = parsed;
              } else {
                await alertIos('Waktu Tidak Valid', 'Waktu kedaluwarsa khusus harus berada di masa depan.', 'warning');
                return;
              }
            }
          } else {
            const durationMs = parseInt(expiryVal, 10);
            if (!isNaN(durationMs) && durationMs > 0) {
              calculatedExpiresAt = Date.now() + durationMs;
            }
          }

          try {
            btnSaveAnnounce.disabled = true;
            btnSaveAnnounce.textContent = 'Menyimpan...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                announcement: { 
                  message, 
                  type, 
                  enabled,
                  expiresAt: calculatedExpiresAt 
                }
              }),
            });
            const data = await res.json();
            if (data.success) {
              if (btnDeleteAnnounce) {
                btnDeleteAnnounce.style.display = message.length > 0 ? 'inline-flex' : 'none';
              }
              await alertIos('Pengumuman Disimpan', 'Banner pengumuman publik berhasil diperbarui.', 'success');
            } else {
              await alertIos('Gagal Menyimpan', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnSaveAnnounce.disabled = false;
            btnSaveAnnounce.textContent = 'Simpan Pengumuman';
          }
        });
      }

      // 2.1 Delete Announcement Banner Immediately
      if (btnDeleteAnnounce) {
        btnDeleteAnnounce.addEventListener('click', async function() {
          const confirmed = await confirmIos(
            'Hapus Pengumuman?',
            'Banner pengumuman publik akan langsung dihapus dan dinonaktifkan dari seluruh frontend.',
            true,
            'Hapus Pengumuman'
          );
          if (!confirmed) return;

          try {
            btnDeleteAnnounce.disabled = true;
            btnDeleteAnnounce.textContent = 'Menghapus...';
            const res = await fetch('/' + pPath + '/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clearAnnouncement: true }),
            });
            const data = await res.json();
            if (data.success) {
              document.getElementById('announcement-message').value = '';
              document.getElementById('announcement-enabled').checked = false;
              const badge = document.getElementById('banner-expiry-badge');
              if (badge) badge.remove();
              btnDeleteAnnounce.style.display = 'none';
              await alertIos('Pengumuman Dihapus', 'Banner pengumuman telah dihapus permanen.', 'success');
            } else {
              await alertIos('Gagal Menghapus', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnDeleteAnnounce.disabled = false;
            btnDeleteAnnounce.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Hapus Pengumuman';
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
            await alertIos('Ukuran Berkas Tidak Valid', 'Batas ukuran berkas harus bernilai antara 1 sampai 500 MB.', 'warning');
            return;
          }
          if (isNaN(rateLimit) || rateLimit < 1 || rateLimit > 200) {
            await alertIos('Rate Limit Tidak Valid', 'Rate limit harus bernilai antara 1 sampai 200 upload/menit.', 'warning');
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
                featureFlags: { pasteToUpload, qrCode, pwaInstallPrompt },
              }),
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Konfigurasi Disimpan', 'Konfigurasi batas dinamis & feature flags berhasil diperbarui.', 'success');
            } else {
              await alertIos('Gagal Menyimpan', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnSaveLimits.disabled = false;
            btnSaveLimits.textContent = 'Simpan Batas & Flags';
          }
        });
      }

      // 4. Revoke Sessions
      document.querySelectorAll('.btn-revoke-single').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          const token = btn.getAttribute('data-token');
          const confirmed = await confirmIos(
            'Cabut Sesi Admin Ini?',
            'Sesi pada perangkat tersebut akan langsung ditutup dan dipaksa logout.',
            true,
            'Cabut Sesi'
          );
          if (!confirmed) return;

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
              await alertIos('Sesi Dicabut', 'Sesi admin tersebut telah berhasil dinonaktifkan.', 'success');
            } else {
              await alertIos('Gagal Mencabut Sesi', data.error?.message || 'Gagal mencabut sesi.', 'danger');
              btn.disabled = false;
              btn.textContent = 'Cabut';
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            btn.disabled = false;
            btn.textContent = 'Cabut';
          }
        });
      });

      const btnRevokeAll = document.getElementById('btn-revoke-all-sessions');
      if (btnRevokeAll) {
        btnRevokeAll.addEventListener('click', async function() {
          const confirmed = await confirmIos(
            'Cabut Semua Sesi Lain?',
            'Seluruh sesi admin pada perangkat lain akan langsung logout. Hanya sesi Anda saat ini yang akan tetap aktif.',
            true,
            'Cabut Semua Sesi Lain'
          );
          if (!confirmed) return;

          try {
            btnRevokeAll.disabled = true;
            btnRevokeAll.textContent = 'Memproses...';
            const res = await fetch('/' + pPath + '/api/revoke-all-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.success) {
              await alertIos('Berhasil', 'Berhasil mencabut ' + data.revokedCount + ' sesi admin lainnya.', 'success');
              // Remove other rows from table without full reload
              document.querySelectorAll('tr[id^="session-row-"]').forEach(function(row) {
                const isCurrent = row.textContent.includes('Sesi Ini');
                if (!isCurrent) row.remove();
              });
            } else {
              await alertIos('Gagal', 'Gagal mencabut sesi admin lainnya.', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
          } finally {
            btnRevokeAll.disabled = false;
            btnRevokeAll.textContent = 'Cabut Semua Sesi Lain';
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
          const olderThanInput = document.getElementById('cleanup-older-than');
          const olderThanDays = olderThanInput ? parseInt(olderThanInput.value, 10) : 30;
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
                    '<span style="font-weight: 600; max-width: clamp(120px, 40vw, 250px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (item.name || item.id) + '</span>' +
                    '<span style="color: var(--muted);">' + (item.formattedSize || '0 B') + ' | ' + (item.views || 0) + ' views</span>' +
                  '</div>';
                }).join('');
              }
            } else {
              await alertIos('Gagal Memuat Pratinjau', data.error?.message || 'Error', 'danger');
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
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
          
          const confirmed = await confirmIos(
            'Hapus ' + cachedCandidates.length + ' Berkas Massal?',
            'PERINGATAN: Tindakan ini bersifat PERMANEN dan akan menghapus seluruh berkas terpilih dari server penyimpanan Catbox.',
            true,
            'Hapus Massal Sekarang'
          );
          if (!confirmed) return;

          const olderThanInput = document.getElementById('cleanup-older-than');
          const olderThanDays = olderThanInput ? parseInt(olderThanInput.value, 10) : 30;
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
              await alertIos('Pembersihan Selesai', data.data.succeeded + ' berkas berhasil dihapus permanen. Total storage dibebaskan: ' + data.data.formattedFreedBytes, 'success');
              // Clear preview container & refresh table
              previewContainer.style.display = 'none';
              cachedCandidates = [];
            } else {
              await alertIos('Gagal Eksekusi', data.error?.message || 'Error', 'danger');
              btnExecuteCleanup.disabled = false;
              btnExecuteCleanup.textContent = 'Jalankan Hapus Massal Permanen';
            }
          } catch (err) {
            await alertIos('Kesalahan Koneksi', 'Gagal menghubungi server.', 'danger');
            btnExecuteCleanup.disabled = false;
            btnExecuteCleanup.textContent = 'Jalankan Hapus Massal Permanen';
          }
        });
      }
    })();
  `;
}
