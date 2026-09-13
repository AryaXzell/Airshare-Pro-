/**
 * Real-time polling and live stats updating script for Admin Dashboard.
 */
export function getLiveStatsScript(fullAdminPath: string): string {
  return `
    // Real-time live stats polling handler
    async function fetchLiveStats() {
      try {
        const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/live-stats', {
          headers: { 'Accept': 'application/json' }
        });

        if (res.status === 401) {
          window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
          return;
        }

        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }

        const json = await res.json();
        if (!json || !json.today) return;

        // Update metric numbers
        const elUploads = document.getElementById('stat-uploads');
        if (elUploads && json.today.uploads !== undefined) {
          elUploads.textContent = Number(json.today.uploads).toLocaleString('id-ID');
        }

        const elBytes = document.getElementById('stat-bytes');
        if (elBytes && json.today.formattedBytes) {
          elBytes.textContent = json.today.formattedBytes;
        }

        const elViews = document.getElementById('stat-views');
        if (elViews && json.today.totalViews !== undefined) {
          elViews.textContent = Number(json.today.totalViews).toLocaleString('id-ID');
        }

        const elAvg = document.getElementById('stat-avg');
        if (elAvg && json.today.formattedAverageSize) {
          elAvg.textContent = json.today.formattedAverageSize;
        }

        const elTotalStored = document.getElementById('stat-total-stored');
        if (elTotalStored && json.totalItemsInRepo !== undefined) {
          const monitoredCount = (json.recentUploads && json.recentUploads.length) || 0;
          elTotalStored.textContent = 'Total Tersimpan: ' + Number(json.totalItemsInRepo).toLocaleString('id-ID') + ' item (' + monitoredCount + ' termonitor)';
        }

        // Update Status tab health status
        const elTabCatboxVal = document.getElementById('status-tab-catbox-val');
        const elTabCatboxDot = document.getElementById('status-tab-catbox-dot');
        const elTabCatboxSub = document.getElementById('status-tab-catbox-sub');
        if (json.catbox) {
          if (elTabCatboxVal) {
            elTabCatboxVal.textContent = json.catbox.available ? 'Tersedia (' + (json.catbox.latencyMs || 0) + 'ms)' : 'Tidak Tersedia';
          }
          if (elTabCatboxDot) {
            elTabCatboxDot.className = 'status-indicator ' + (json.catbox.available ? 'status-ok' : 'status-warn');
          }
          if (elTabCatboxSub) {
            elTabCatboxSub.textContent = json.catbox.available ? 'Endpoint https://catbox.moe/user/api.php beroperasi normal' : 'Penyedia Catbox tidak dapat dijangkau';
          }
        }

        const elTabStorageVal = document.getElementById('status-tab-storage-val');
        const elTabStorageDot = document.getElementById('status-tab-storage-dot');
        const elTabStorageSub = document.getElementById('status-tab-storage-sub');
        if (json.redis) {
          const isOk = json.redis.connected || (!json.redis.configured);
          if (elTabStorageVal) {
            elTabStorageVal.textContent = json.redis.mode || 'In-Memory (Fallback)';
          }
          if (elTabStorageDot) {
            elTabStorageDot.className = 'status-indicator ' + (isOk ? 'status-ok' : 'status-warn');
          }
          if (elTabStorageSub) {
            elTabStorageSub.textContent = json.redis.connected ? 'Koneksi aktif ke cluster Upstash Redis' : (!json.redis.configured ? 'Penyimpanan lokal RAM in-memory aktif' : 'Gangguan koneksi - fallback in-memory');
          }
        }

        const elTabUptimeVal = document.getElementById('status-tab-uptime-val');
        if (elTabUptimeVal && json.uptimeFormatted) {
          elTabUptimeVal.textContent = json.uptimeFormatted;
        }

        const elTabServerTime = document.getElementById('status-tab-server-time');
        if (elTabServerTime) {
          const d = new Date();
          elTabServerTime.textContent = d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
        }

        // Update sync badge to success
        const badgeDot = document.getElementById('live-sync-dot');
        const badgeTitle = document.getElementById('live-sync-title');
        const badgeTime = document.getElementById('live-sync-time');
        if (badgeDot) {
          badgeDot.style.background = 'var(--success)';
          badgeDot.style.boxShadow = '0 0 8px var(--success)';
        }
        if (badgeTitle) badgeTitle.textContent = 'Diperbarui otomatis setiap 20 detik';
        if (badgeTime) {
          const now = new Date();
          const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                          String(now.getMinutes()).padStart(2, '0') + ':' +
                          String(now.getSeconds()).padStart(2, '0');
          badgeTime.textContent = 'Terakhir sinkron: ' + timeStr;
        }
      } catch (err) {
        const badgeDot = document.getElementById('live-sync-dot');
        const badgeTitle = document.getElementById('live-sync-title');
        if (badgeDot) {
          badgeDot.style.background = '#ef4444';
          badgeDot.style.boxShadow = '0 0 8px #ef4444';
        }
        if (badgeTitle) badgeTitle.textContent = 'Gagal memperbarui — periksa koneksi';
      }
    }

    // Expose for immediate trigger after file deletion
    window.fetchLiveStats = fetchLiveStats;

    setInterval(fetchLiveStats, 20000);
  `;
}
