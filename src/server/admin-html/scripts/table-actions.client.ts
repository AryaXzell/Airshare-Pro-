/**
 * Client handlers for file management, search, permanent deletion, sync checks, and purge.
 */
export function getTableActionsScript(fullAdminPath: string): string {
  return `
    // Quick Table Search & Filter for Uploads
    const searchInput = document.getElementById('search-files-input');
    const btnResetSearch = document.getElementById('btn-reset-search');
    const searchCountLabel = document.getElementById('search-count-label');
    const btnSearchDb = document.getElementById('btn-search-db');

    function filterUploadRows() {
      if (!searchInput) return;
      const query = searchInput.value.toLowerCase().trim();
      const rows = document.querySelectorAll('tr[id^="upload-row-"]');
      let visibleCount = 0;

      rows.forEach(function(row) {
        if (!query) {
          row.style.display = '';
          visibleCount++;
        } else {
          const text = row.textContent.toLowerCase();
          if (text.includes(query)) {
            row.style.display = '';
            visibleCount++;
          } else {
            row.style.display = 'none';
          }
        }
      });

      if (searchCountLabel) {
        if (query) {
          searchCountLabel.textContent = visibleCount + ' berkas cocok';
        } else {
          searchCountLabel.textContent = '';
        }
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', filterUploadRows);
    }

    if (btnResetSearch) {
      btnResetSearch.addEventListener('click', function() {
        if (searchInput) {
          searchInput.value = '';
          filterUploadRows();
          searchInput.focus();
        }
      });
    }

    if (btnSearchDb) {
      btnSearchDb.addEventListener('click', function() {
        const q = searchInput ? searchInput.value.trim() : '';
        if (!q) {
          showToast('Silakan masukkan kata kunci pencarian.', false, true);
          return;
        }
        filterUploadRows();
      });
    }

    // Permanent Deletion handler (with iOS confirm dialog)
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.btn-delete-perm');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name') || id;

      const confirmed = await window.showIosConfirm({
        title: 'Hapus Permanen dari Catbox?',
        message: 'Penghapusan dari server Catbox bersifat PERMANEN dan TIDAK DAPAT DIBATALKAN.\\\\n\\\\nBerkas "' + name + '" (' + id + ') akan dihapus selamanya dan tautan tidak akan bisa diakses lagi oleh siapapun.',
        confirmText: 'Hapus Permanen',
        cancelText: 'Batal',
        isDestructive: true,
        icon: 'danger'
      });

      if (!confirmed) {
        return;
      }

      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Menghapus...';

      try {
        const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/delete-permanent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ id })
        });

        if (res.status === 401) {
          window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
          return;
        }

        const data = await res.json();
        if (data.success) {
          showToast(data.message, false, data.warning);
          const row = document.getElementById('upload-row-' + id);
          if (row) {
            row.style.opacity = '0.35';
            const actionCell = row.querySelector('td:last-child');
            if (actionCell) {
              actionCell.innerHTML = '<span style="font-size:0.75rem; color:#ef4444; font-weight:700;">Dihapus Permanen</span>';
            }
          }
          if (typeof fetchLiveStats === 'function') fetchLiveStats();
        } else {
          showToast(data.error?.message || 'Gagal menghapus berkas permanen.', true);
          btn.disabled = false;
          btn.textContent = origText;
        }
      } catch (err) {
        showToast('Terjadi kesalahan jaringan saat mencoba menghapus permanen.', true);
        btn.disabled = false;
        btn.textContent = origText;
      }
    });

    // Health-Check Synchronization handler
    const btnSync = document.getElementById('btn-run-sync');
    const syncSpinner = document.getElementById('sync-spinner-icon');
    const syncText = document.getElementById('sync-btn-text');
    const syncSummaryContainer = document.getElementById('sync-summary-container');
    const syncLastLabel = document.getElementById('sync-last-checked-label');

    if (btnSync) {
      btnSync.addEventListener('click', async function() {
        btnSync.disabled = true;
        if (syncSpinner) syncSpinner.style.display = 'inline-block';
        if (syncText) syncText.textContent = 'Memeriksa ke Catbox...';

        try {
          const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/sync-check', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            if (syncLastLabel) {
              syncLastLabel.textContent = 'Terakhir diperiksa: Baru saja (' + new Date().toLocaleTimeString('id-ID') + ')';
            }

            if (data.brokenCount === 0) {
              syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.totalChecked + ' dari ' + data.totalChecked + ' berkas terbaru berhasil diverifikasi aktif di server Catbox (HTTP 200 OK). Tidak ada berkas yatim yang terdeteksi.</div></div></div>';
              showToast('Pemeriksaan selesai: Seluruh ' + data.totalChecked + ' berkas terverifikasi aktif di Catbox.', false);
            } else {
              let html = '<div class="sync-banner sync-banner-warn"><div><strong>Ditemukan Berkas Bermasalah: ' + data.brokenCount + ' Berkas Rusak / Yatim!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.healthyCount + ' dari ' + data.totalChecked + ' berkas aktif. Terdapat <strong>' + data.brokenCount + ' tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error).</div></div></div>';
              html += '<div class="table-container" style="margin-top: 1rem;"><table><thead><tr><th>Berkas Bermasalah</th><th>Ukuran</th><th>Tautan Catbox Asli</th><th>Waktu Unggah</th><th>Aksi Perbaikan</th></tr></thead><tbody id="sync-broken-tbody">';
              data.brokenItems.forEach(function(item) {
                html += '<tr id="sync-row-' + item.id + '"><td><div style="font-weight: 700; color: #f87171;">' + (item.name || item.id) + '</div><div style="font-size: 0.7rem; color: var(--muted);">' + item.id + '</div></td><td>' + (item.formattedSize || '-') + '</td><td><a href="' + item.shareUrl + '" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted);">' + item.shareUrl + '</a></td><td>Baru saja</td><td><button type="button" class="btn-delete-history" data-id="' + item.id + '" data-name="' + (item.name || item.id) + '">Hapus dari Riwayat</button></td></tr>';
              });
              html += '</tbody></table></div>';
              syncSummaryContainer.innerHTML = html;
              showToast('Pemeriksaan selesai: Ditemukan ' + data.brokenCount + ' berkas yatim/rusak yang tidak ada di Catbox.', false, true);
            }
          } else {
            showToast(data.error?.message || 'Gagal menjalankan pemeriksaan sinkronisasi.', true);
          }
        } catch (err) {
          showToast('Terjadi kesalahan koneksi saat menjalankan pemeriksaan sinkronisasi.', true);
        } finally {
          btnSync.disabled = false;
          if (syncSpinner) syncSpinner.style.display = 'none';
          if (syncText) syncText.textContent = 'Jalankan Pemeriksaan Sinkronisasi';
        }
      });
    }

    // Delete History Only handler (without calling Catbox API)
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.btn-delete-history');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name') || id;

      const confirmed = await window.showIosConfirm({
        title: 'Bersihkan dari Riwayat?',
        message: 'Hapus entri berkas "' + name + '" (' + id + ') dari riwayat repositori AirShare?\\\\n\\\\nFile ini memang sudah tidak ada di Catbox, aksi ini hanya membersihkan sisa riwayat di database.',
        confirmText: 'Bersihkan Entri',
        cancelText: 'Batal',
        isDestructive: false,
        icon: 'warning'
      });

      if (!confirmed) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Membersihkan...';

      try {
        const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/delete-history-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ id })
        });

        if (res.status === 401) {
          window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
          return;
        }

        const data = await res.json();
        if (data.success) {
          showToast(data.message, false);
          const syncRow = document.getElementById('sync-row-' + id);
          if (syncRow) {
            syncRow.remove();
          }
          const mainRow = document.getElementById('upload-row-' + id);
          if (mainRow) {
            mainRow.style.opacity = '0.35';
            const actionCell = mainRow.querySelector('td:last-child');
            if (actionCell) {
              actionCell.innerHTML = '<span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">Dibersihkan dari Riwayat</span>';
            }
          }
          if (typeof fetchLiveStats === 'function') fetchLiveStats();
        } else {
          showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
          btn.disabled = false;
          btn.textContent = 'Hapus dari Riwayat';
        }
      } catch (err) {
        showToast('Terjadi kesalahan jaringan saat membersihkan riwayat.', true);
        btn.disabled = false;
        btn.textContent = 'Hapus dari Riwayat';
      }
    });

    // Purge All Broken 404 files handler
    document.addEventListener('click', async function(e) {
      const btnPurgeAll = e.target.closest('#btn-purge-all-broken');
      if (!btnPurgeAll) return;

      const confirmed = await window.showIosConfirm({
        title: 'Bersihkan Seluruh Berkas Rusak (404)?',
        message: 'Bersihkan SEMUA berkas rusak (404) dan sisa data uji dari riwayat database & analitik?\\\\n\\\\nBerkas aktif yang valid akan tetap aman tersimpan.',
        confirmText: 'Bersihkan Semua (404)',
        cancelText: 'Batal',
        isDestructive: true,
        icon: 'danger'
      });

      if (!confirmed) {
        return;
      }

      btnPurgeAll.disabled = true;
      btnPurgeAll.textContent = 'Membersihkan Semua...';

      try {
        const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/purge-broken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        if (res.status === 401) {
          window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
          return;
        }

        const data = await res.json();
        if (data.success) {
          showToast('Pembersihan selesai: ' + data.data.purgedCount + ' berkas 404/orphan dibersihkan.', false);
          syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">Pembersihan selesai. ' + data.data.healthyCount + ' berkas valid dipertahankan dan ' + data.data.purgedCount + ' berkas 404 dibersihkan.</div></div></div>';
          setTimeout(function() { window.location.reload(); }, 1200);
        } else {
          showToast(data.error?.message || 'Gagal membersihkan berkas rusak.', true);
          btnPurgeAll.disabled = false;
          btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi saat membersihkan berkas rusak.', true);
        btnPurgeAll.disabled = false;
        btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
      }
    });

    // Deleted Files Tab Handlers (Filter & Clear History)
    const searchDeletedInput = document.getElementById('search-deleted-input');
    const btnResetDeletedSearch = document.getElementById('btn-reset-deleted-search');
    const deletedSearchCountLabel = document.getElementById('deleted-search-count-label');
    const btnClearDeleted = document.getElementById('btn-clear-deleted-history');

    function filterDeletedRows() {
      if (!searchDeletedInput) return;
      const query = searchDeletedInput.value.toLowerCase().trim();
      const rows = document.querySelectorAll('tr[id^="deleted-row-"]');
      let visibleCount = 0;

      rows.forEach(function(row) {
        if (!query) {
          row.style.display = '';
          visibleCount++;
        } else {
          const text = row.textContent.toLowerCase();
          if (text.includes(query)) {
            row.style.display = '';
            visibleCount++;
          } else {
            row.style.display = 'none';
          }
        }
      });

      if (deletedSearchCountLabel) {
        if (query) {
          deletedSearchCountLabel.textContent = visibleCount + ' berkas cocok';
        } else {
          deletedSearchCountLabel.textContent = '';
        }
      }
    }

    if (searchDeletedInput) {
      searchDeletedInput.addEventListener('input', filterDeletedRows);
    }

    if (btnResetDeletedSearch) {
      btnResetDeletedSearch.addEventListener('click', function() {
        if (searchDeletedInput) {
          searchDeletedInput.value = '';
          filterDeletedRows();
          searchDeletedInput.focus();
        }
      });
    }

    if (btnClearDeleted) {
      btnClearDeleted.addEventListener('click', async function() {
        const confirmed = await window.showIosConfirm({
          title: 'Bersihkan Seluruh Riwayat Terhapus?',
          message: 'Seluruh arsip riwayat berkas terhapus akan dibersihkan dari database admin.',
          confirmText: 'Bersihkan Riwayat',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'danger'
        });

        if (!confirmed) {
          return;
        }

        btnClearDeleted.disabled = true;
        btnClearDeleted.textContent = 'Membersihkan...';

        try {
          const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/clear-deleted-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + ${JSON.stringify(fullAdminPath)} + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast(data.message, false);
            const tbody = document.getElementById('deleted-files-tbody');
            if (tbody) {
              tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2.5rem 1rem;"><div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text);">Tidak ada riwayat berkas terhapus</div><div style="font-size: 0.8rem;">Riwayat arsip berkas terhapus telah dibersihkan secara penuh.</div></td></tr>';
            }
            const countBadge = document.getElementById('deleted-count-badge');
            if (countBadge) countBadge.textContent = '0 Berkas Tercatat';
            btnClearDeleted.style.display = 'none';
            const tabBtn = document.getElementById('tab-btn-terhapus');
            if (tabBtn) tabBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>Berkas Terhapus (0)</span>';
            const sidebarBtnDesc = document.querySelector('#sidebar-btn-terhapus .sidebar-btn-desc');
            if (sidebarBtnDesc) sidebarBtnDesc.textContent = 'Arsip Terhapus (0)';
          } else {
            showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
            btnClearDeleted.disabled = false;
            btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
          }
        } catch (err) {
          showToast('Terjadi kesalahan koneksi saat membersihkan riwayat.', true);
          btnClearDeleted.disabled = false;
          btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
        }
      });
    }
  `;
}
