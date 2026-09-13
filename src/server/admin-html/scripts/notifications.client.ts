/**
 * Client-side script for Admin Notification Center:
 * - 1-Click Copy Error message to clipboard with instant visual feedback
 * - Notification category filtering (all, error, warning, success, info)
 * - Read/Unread state tracking and badge updates
 * - Clear and refresh notification history synchronized with server
 */
export function getNotificationsScript(fullAdminPath: string): string {
  return `
    // Clipboard 1-Click Copy Handler for Error Messages
    async function copyToClipboard(text, triggerEl, successLabel) {
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }

        if (triggerEl) {
          const btn = triggerEl.classList.contains('btn-copy-error-badge') || triggerEl.classList.contains('btn-copy-raw-box')
            ? triggerEl
            : triggerEl.querySelector('.btn-copy-error-badge, .btn-copy-raw-box');

          if (btn) {
            const originalContent = btn.innerHTML;
            btn.classList.add('copied');
            btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>' + (successLabel || 'Berhasil Disalin!') + '</span>';
            setTimeout(function() {
              btn.classList.remove('copied');
              btn.innerHTML = originalContent;
            }, 2000);
          }
        }

        // Tampilkan feedback toast iOS singkat
        if (typeof window.showToast === 'function') {
          window.showToast('Pesan error disalin ke papan klip.', false, false, undefined, 'Tersalin', false);
        }
      } catch (err) {
        console.error('Gagal menyalin pesan error:', err);
      }
    }

    // Event delegation for 1-click error copying
    document.addEventListener('click', function(e) {
      // 1. Copy error box or button click
      const copyBox = e.target.closest('.notif-error-clickable-box, .btn-copy-error-badge, .btn-copy-raw-box');
      if (copyBox) {
        // Don't duplicate if clicking button inside box
        const copyText = copyBox.getAttribute('data-copy-text');
        if (copyText) {
          e.stopPropagation();
          copyToClipboard(copyText, copyBox, 'Tersalin!');
        }
      }

      // 2. Mark single notification read
      const markSingleBtn = e.target.closest('.btn-mark-single-read');
      if (markSingleBtn) {
        e.preventDefault();
        const notifId = markSingleBtn.getAttribute('data-id');
        if (notifId) {
          markNotificationRead(notifId, markSingleBtn.closest('.notif-card'));
        }
      }
    });

    // Mark single notification read
    async function markNotificationRead(id, cardEl) {
      try {
        const res = await fetch('${fullAdminPath}/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data && data.success) {
          if (cardEl) {
            cardEl.classList.remove('unread');
            const singleBtn = cardEl.querySelector('.btn-mark-single-read');
            if (singleBtn) singleBtn.remove();
          }
          updateNotificationBadges(data.unreadCount || 0);
        }
      } catch (e) {
        console.warn('Gagal menandai notifikasi dibaca:', e);
      }
    }

    // Filter Notifications
    const filterBtns = document.querySelectorAll('.notif-filter-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        const filter = btn.getAttribute('data-filter') || 'all';
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');

        const cards = document.querySelectorAll('#notif-list-container .notif-card');
        cards.forEach(function(card) {
          const level = card.getAttribute('data-level');
          if (filter === 'all' || level === filter) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    // Mark All Read Button
    const btnMarkAll = document.getElementById('btn-mark-all-read');
    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', async function() {
        try {
          btnMarkAll.disabled = true;
          btnMarkAll.textContent = 'Menyimpan...';
          const res = await fetch('${fullAdminPath}/api/notifications/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          const data = await res.json();
          if (data && data.success) {
            const cards = document.querySelectorAll('#notif-list-container .notif-card');
            cards.forEach(function(c) {
              c.classList.remove('unread');
              const btn = c.querySelector('.btn-mark-single-read');
              if (btn) btn.remove();
            });
            updateNotificationBadges(0);
            if (typeof window.showToast === 'function') {
              window.showToast('Semua notifikasi ditandai sebagai telah dibaca.', false, false, undefined, 'Notifikasi Dibaca', false);
            }
          }
        } catch (err) {
          console.error('Gagal menandai semua dibaca:', err);
        } finally {
          btnMarkAll.disabled = false;
          btnMarkAll.textContent = 'Tandai Semua Dibaca';
        }
      });
    }

    // Clear Notifications Button
    const btnClearNotif = document.getElementById('btn-clear-notifications');
    if (btnClearNotif) {
      btnClearNotif.addEventListener('click', async function() {
        let confirmed = false;
        if (typeof window.showIosConfirm === 'function') {
          confirmed = await window.showIosConfirm({
            title: 'Bersihkan Riwayat Notifikasi?',
            message: 'Seluruh riwayat pemberitahuan dan pesan kesalahan akan dihapus dari server secara permanen.',
            confirmText: 'Bersihkan Semua',
            cancelText: 'Batal',
            isDestructive: true,
            icon: 'warning'
          });
        } else {
          confirmed = confirm('Bersihkan seluruh riwayat notifikasi dari server?');
        }

        if (!confirmed) return;

        try {
          btnClearNotif.disabled = true;
          btnClearNotif.textContent = 'Membersihkan...';
          const res = await fetch('${fullAdminPath}/api/notifications/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data && data.success) {
            updateNotificationBadges(0);
            const container = document.getElementById('notif-list-container');
            if (container) {
              container.innerHTML = '<div id="notif-empty-state" style="text-align: center; padding: 3.5rem 1.5rem; background: var(--surface-primary); border: 1px dashed var(--border-subtle); border-radius: 1rem; color: var(--text-muted);"><svg style="margin: 0 auto 1rem; opacity: 0.35;" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">Tidak Ada Riwayat Notifikasi</div><p style="font-size: 0.8rem; margin: 0;">Seluruh riwayat notifikasi telah dibersihkan.</p></div>';
            }
            if (typeof window.showToast === 'function') {
              window.showToast('Riwayat notifikasi berhasil dibersihkan.', false, false, undefined, 'Riwayat Bersih', false);
            }
          }
        } catch (err) {
          console.error('Gagal membersihkan notifikasi:', err);
        } finally {
          btnClearNotif.disabled = false;
          btnClearNotif.textContent = 'Bersihkan Riwayat';
        }
      });
    }

    // Refresh Notifications Button
    const btnRefreshNotif = document.getElementById('btn-refresh-notifications');
    if (btnRefreshNotif) {
      btnRefreshNotif.addEventListener('click', function() {
        refreshNotificationList(true);
      });
    }

    // Update Notification Badges in UI
    function updateNotificationBadges(count) {
      const badges = document.querySelectorAll('#sidebar-notif-badge, #mobile-notif-badge, .notif-badge-pill');
      badges.forEach(function(badge) {
        if (count > 0) {
          badge.style.display = 'inline-flex';
          badge.textContent = count > 99 ? '99+' : String(count);
        } else {
          badge.style.display = 'none';
          badge.textContent = '0';
        }
      });
    }
    window.updateNotificationBadges = updateNotificationBadges;

    // Fetch and render latest notifications from server
    async function refreshNotificationList(showToastFeedback) {
      const container = document.getElementById('notif-list-container');
      if (!container) return;

      try {
        if (btnRefreshNotif) btnRefreshNotif.style.opacity = '0.5';
        const res = await fetch('${fullAdminPath}/api/notifications?limit=60');
        const data = await res.json();
        if (data && data.success && Array.isArray(data.notifications)) {
          updateNotificationBadges(data.unreadCount || 0);

          if (data.notifications.length === 0) {
            container.innerHTML = '<div id="notif-empty-state" style="text-align: center; padding: 3.5rem 1.5rem; background: var(--surface-primary); border: 1px dashed var(--border-subtle); border-radius: 1rem; color: var(--text-muted);"><svg style="margin: 0 auto 1rem; opacity: 0.35;" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">Tidak Ada Riwayat Notifikasi</div><p style="font-size: 0.8rem; margin: 0;">Pemberitahuan baru akan muncul di sini secara otomatis.</p></div>';
            return;
          }

          let html = '';
          data.notifications.forEach(function(item) {
            const isError = item.level === 'error';
            const isWarn = item.level === 'warning';
            const isSuccess = item.level === 'success';

            const tagClass = isError ? 'notif-tag-error' : isWarn ? 'notif-tag-warning' : isSuccess ? 'notif-tag-success' : 'notif-tag-info';
            const levelLabel = isError ? 'Error' : isWarn ? 'Peringatan' : isSuccess ? 'Sukses' : 'Info';
            const categoryLabel = item.category === 'ai' ? 'Gemini AI' : item.category === 'security' ? 'Keamanan' : item.category === 'sync' ? 'Sinkronisasi' : item.category === 'storage' ? 'Penyimpanan' : 'Sistem';

            const diffSec = Math.max(0, Math.floor((Date.now() - (item.timestamp || Date.now())) / 1000));
            let timeRelative = diffSec + ' dtk lalu';
            if (diffSec >= 60 && diffSec < 3600) timeRelative = Math.floor(diffSec / 60) + ' mnt lalu';
            else if (diffSec >= 3600 && diffSec < 86400) timeRelative = Math.floor(diffSec / 3600) + ' jam lalu';
            else if (diffSec >= 86400) timeRelative = Math.floor(diffSec / 86400) + ' hari lalu';

            const payloadToCopy = item.rawDetails ? item.message + '\\n\\n[Original Details]\\n' + item.rawDetails : item.message;
            const safeMsg = (item.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const safeTitle = (item.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const safePayload = payloadToCopy.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            html += '<div class="notif-card ' + (!item.read ? 'unread' : '') + ' ' + (isError ? 'is-error' : '') + '" data-id="' + item.id + '" data-level="' + item.level + '">';
            html += '  <div class="notif-header-row">';
            html += '    <div class="notif-meta-left">';
            html += '      <span class="notif-tag ' + tagClass + '">' + levelLabel + '</span>';
            html += '      <span style="font-size: 0.725rem; font-weight: 600; color: var(--text-muted); background: var(--surface-secondary); padding: 0.15rem 0.5rem; border-radius: 4px;">' + categoryLabel + '</span>';
            html += '      <span class="notif-time-badge">' + timeRelative + '</span>';
            html += '    </div>';
            if (!item.read) {
              html += '    <button type="button" class="btn-mark-single-read" data-id="' + item.id + '" style="background: none; border: none; color: var(--text-muted); font-size: 0.7rem; cursor: pointer; text-decoration: underline;">Tandai Dibaca</button>';
            }
            html += '  </div>';
            html += '  <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">' + safeTitle + '</div>';

            if (isError) {
              html += '  <div class="notif-error-clickable-box" title="Klik 1x untuk menyalin pesan error ini" data-copy-text="' + safePayload + '" role="button" tabindex="0">';
              html += '    <div style="flex: 1; min-width: 0;">';
              html += '      <div style="font-size: 0.825rem; color: #fca5a5; line-height: 1.45; font-weight: 500;">' + safeMsg + '</div>';
              html += '      <div style="font-size: 0.7rem; color: #f87171; margin-top: 0.35rem; display: flex; align-items: center; gap: 0.3rem;">';
              html += '        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
              html += '        Klik area ini 1x untuk salin pesan error ke clipboard';
              html += '      </div>';
              html += '    </div>';
              html += '    <button type="button" class="btn-copy-error-badge" data-copy-text="' + safePayload + '">';
              html += '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
              html += '      <span>Salin</span>';
              html += '    </button>';
              html += '  </div>';
            } else {
              html += '  <div style="font-size: 0.825rem; color: var(--text-muted); line-height: 1.45;">' + safeMsg + '</div>';
            }

            if (item.rawDetails) {
              const safeRaw = (item.rawDetails || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
              html += '  <details class="notif-raw-details">';
              html += '    <summary><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Lihat Versi Lengkap &amp; Respon Original (Raw Server Response)</summary>';
              html += '    <pre class="notif-raw-box">' + safeRaw + '</pre>';
              html += '    <div style="padding: 0.5rem 0.85rem; background: rgba(0,0,0,0.2); border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end;">';
              html += '      <button type="button" class="btn-copy-raw-box" data-copy-text="' + safeRaw + '" style="background: var(--surface-primary); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.25rem 0.65rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;">';
              html += '        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
              html += '        <span>Salin Detail Lengkap</span>';
              html += '      </button>';
              html += '    </div>';
              html += '  </details>';
            }

            html += '</div>';
          });

          container.innerHTML = html;
          if (showToastFeedback && typeof window.showToast === 'function') {
            window.showToast('Riwayat notifikasi berhasil disinkronkan.', false, false, undefined, 'Sinkronisasi Selesai', false);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat ulang notifikasi:', err);
      } finally {
        if (btnRefreshNotif) btnRefreshNotif.style.opacity = '1';
      }
    }
    window.refreshNotificationList = refreshNotificationList;
  `;
}
