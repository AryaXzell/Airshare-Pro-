/**
 * Dashboard navigation, tab switching, toast notifications, and logout handling.
 */
export function getDashboardNavScript(fullAdminPath: string): string {
  return `
    // Intercept Logout Form with iOS Modal Confirmation
    const formLogout = document.getElementById('form-logout');
    if (formLogout) {
      formLogout.addEventListener('submit', async function(e) {
        e.preventDefault();
        const confirmed = await window.showIosConfirm({
          title: 'Keluar dari Panel Admin?',
          message: 'Sesi administrasi Anda akan diakhiri dan Anda harus memasukkan PIN kembali untuk masuk.',
          confirmText: 'Keluar',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'warning'
        });
        if (confirmed) {
          formLogout.submit();
        }
      });
    }

    // Helper to format error messages concisely and user-friendly
    function simplifyErrorMessage(msg) {
      if (!msg) return 'Terjadi kendala sistem. Silakan periksa kembali beberapa saat lagi.';
      let s = String(msg).trim();

      // Check if it's JSON string
      if (s.startsWith('{') && s.endsWith('}')) {
        try {
          const parsed = JSON.parse(s);
          if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
            return simplifyErrorMessage(parsed.error.message);
          }
          if (parsed.message) return simplifyErrorMessage(parsed.message);
          if (parsed.error && typeof parsed.error === 'string') return simplifyErrorMessage(parsed.error);
        } catch (_) {}
      }

      if (/429|RESOURCE_EXHAUSTED|quota|limit exceeded/i.test(s)) {
        return 'Kuota Gemini AI habis untuk sementara. Silakan coba beberapa saat lagi.';
      }
      if (/API_KEY_INVALID|INVALID_ARGUMENT.*api.*key/i.test(s)) {
        return 'Kunci API Gemini tidak valid atau belum diset dengan benar.';
      }
      if (/Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(s)) {
        return 'Koneksi jaringan terputus atau server upstream tidak merespons.';
      }
      if (/catbox|upstream.*404|upstream.*502|upstream.*503/i.test(s)) {
        return 'Kendala sementara pada server penyimpanan Catbox upstream.';
      }

      // Compact if too verbose
      if (s.length > 120) {
        return s.slice(0, 115) + '... (klik tab Notifikasi untuk detail lengkap)';
      }
      return s;
    }

    /**
     * iOS-Style Floating Pill Toast Notification (Auto-Dismiss)
     * Automatically disappears like iPhone iOS dynamic banner
     */
    function showToast(msg, isError, isWarn, rawDetails, customTitle, shouldLogToServer, customLevel) {
      let message = msg;
      let level = 'success';
      let title = customTitle || '';
      let logToServer = shouldLogToServer;
      let originalDetails = rawDetails;

      if (typeof msg === 'object' && msg !== null) {
        // Options object pattern: { title, message, level, icon, rawDetails, shouldLogToServer }
        message = msg.message || msg.msg || '';
        title = msg.title || '';
        const iconType = msg.level || msg.icon || (msg.isError ? 'error' : msg.isWarn ? 'warning' : 'success');
        if (iconType === 'danger' || iconType === 'error') level = 'error';
        else if (iconType === 'warning' || iconType === 'warn') level = 'warning';
        else if (iconType === 'info') level = 'info';
        else level = 'success';
        if (msg.shouldLogToServer !== undefined) logToServer = msg.shouldLogToServer;
        if (msg.rawDetails !== undefined) originalDetails = msg.rawDetails;
      } else {
        if (customLevel) {
          level = (customLevel === 'danger' ? 'error' : customLevel);
        } else if (typeof isError === 'string') {
          level = (isError === 'danger' ? 'error' : isError);
        } else if (isError) {
          level = 'error';
        } else if (isWarn) {
          level = 'warning';
        } else {
          level = 'success';
        }
      }

      // 1. Get or create fixed top toast container
      let container = document.getElementById('ios-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'ios-toast-container';
        container.className = 'ios-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
      }

      const isErrLevel = level === 'error';
      const isWarnLevel = level === 'warning';
      const isInfoLevel = level === 'info';
      const originalMsg = String(message || '');
      const displayMsg = isErrLevel ? simplifyErrorMessage(originalMsg) : originalMsg;
      
      if (!title) {
        if (isErrLevel) title = 'Pemberitahuan Kesalahan';
        else if (isWarnLevel) title = 'Peringatan Sistem';
        else if (isInfoLevel) title = 'Informasi';
        else title = 'Berhasil';
      }

      // 2. Create iOS-style toast pill element
      const toast = document.createElement('div');
      toast.className = 'ios-toast level-' + level;
      toast.setAttribute('role', 'alert');

      let iconSvg = '';
      if (isErrLevel) {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      } else if (isWarnLevel) {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      } else if (isInfoLevel) {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      } else {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      }

      const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeMsg = displayMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      toast.innerHTML = 
        '<div class="ios-toast-icon">' + iconSvg + '</div>' +
        '<div class="ios-toast-body">' +
          '<div class="ios-toast-title">' +
            '<span>' + safeTitle + '</span>' +
            '<span class="ios-toast-time">sekarang</span>' +
          '</div>' +
          '<div class="ios-toast-msg">' + safeMsg + '</div>' +
          (isErrLevel ? '<div class="ios-toast-hint"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Ketuk untuk tutup &bull; Detail di tab Notifikasi</div>' : '') +
        '</div>' +
        '<div class="ios-toast-bar"></div>';

      // Limit active visible toasts to 2 for cleaner iOS-like presentation
      while (container.children.length >= 2) {
        const oldest = container.firstElementChild;
        if (oldest) {
          oldest.classList.add('toast-exit');
          setTimeout(function() {
            if (oldest.parentNode) oldest.parentNode.removeChild(oldest);
          }, 240);
        }
      }

      container.appendChild(toast);

      // Dismiss helper with seamless spring-out animation
      let isDismissed = false;
      let dismissTimer = null;
      let startTime = Date.now();
      let remainingTime = 1800; // 1.8 detik sesuai standar iOS quick notification

      function dismissToast() {
        if (isDismissed) return;
        isDismissed = true;
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.add('toast-exit');
        setTimeout(function() {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 240);
      }

      // Tap / Click to instantly dismiss
      toast.addEventListener('click', function() {
        dismissToast();
      });

      // Pause timer on hover, resume on mouse leave
      toast.addEventListener('mouseenter', function() {
        if (dismissTimer) clearTimeout(dismissTimer);
        remainingTime = Math.max(400, remainingTime - (Date.now() - startTime));
      });

      toast.addEventListener('mouseleave', function() {
        startTime = Date.now();
        dismissTimer = setTimeout(dismissToast, remainingTime);
      });

      // Auto-dismiss automatically in 1.8 seconds (1,5 - 2 detik)
      dismissTimer = setTimeout(function() {
        dismissToast();
      }, 1800);

      // Keep legacy banner hidden but synchronized in case other scripts check its existence
      const legacyBanner = document.getElementById('admin-toast-banner');
      if (legacyBanner) {
        legacyBanner.textContent = displayMsg;
      }

      // 3. Asynchronously synchronize with server notification repository
      if (logToServer !== false) {
        const payloadRaw = originalDetails || (originalMsg !== displayMsg ? originalMsg : undefined);
        let cat = 'system';
        if (/ai|gemini|model/i.test(originalMsg + ' ' + (originalDetails || ''))) cat = 'ai';
        else if (/sync|catbox|orphan/i.test(originalMsg + ' ' + (originalDetails || ''))) cat = 'storage';
        else if (/auth|session|pin|login/i.test(originalMsg + ' ' + (originalDetails || ''))) cat = 'security';

        fetch('${fullAdminPath}/api/notifications/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: level,
            title: title,
            message: displayMsg,
            rawDetails: payloadRaw,
            category: cat
          })
        }).then(function(r) { return r.json(); })
          .then(function(res) {
            if (res && res.success && typeof res.unreadCount === 'number') {
              if (typeof window.updateNotificationBadges === 'function') {
                window.updateNotificationBadges(res.unreadCount);
              }
              // If notification panel is currently visible, refresh it
              const notifPanel = document.getElementById('panel-notifikasi');
              if (notifPanel && notifPanel.classList.contains('active') && typeof window.refreshNotificationList === 'function') {
                window.refreshNotificationList(false);
              }
            }
          }).catch(function(err) {
            console.warn('[TOAST_SYNC] Gagal mensinkronkan notifikasi ke server:', err);
          });
      }
    }
    window.showToast = showToast;

    // Category Switching & High-Performance Touch Navigation Handler
    const VALID_CATEGORIES = ['ringkasan', 'analitik', 'status', 'kontrol', 'keamanan', 'data', 'terhapus', 'notifikasi'];

    function switchCategory(catName, shouldUpdateHash) {
      if (!catName) return;
      const normalized = String(catName).toLowerCase().trim().replace(/^#/, '');
      const targetCat = VALID_CATEGORIES.includes(normalized) ? normalized : 'ringkasan';

      // If user switches to notifikasi tab, auto mark as read and refresh
      if (targetCat === 'notifikasi') {
        if (typeof window.updateNotificationBadges === 'function') {
          window.updateNotificationBadges(0);
        }
        fetch('${fullAdminPath}/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }).catch(function() {});
        if (typeof window.refreshNotificationList === 'function') {
          window.refreshNotificationList(false);
        }
      }

      // Update active panels
      const panels = document.querySelectorAll('.category-panel');
      panels.forEach(function(panel) {
        if (panel.getAttribute('data-category-panel') === targetCat) {
          panel.classList.add('active');
          panel.setAttribute('aria-hidden', 'false');
        } else {
          panel.classList.remove('active');
          panel.setAttribute('aria-hidden', 'true');
        }
      });

      // Update sidebar nav buttons
      const sBtns = document.querySelectorAll('.admin-sidebar-btn');
      sBtns.forEach(function(btn) {
        const isActive = btn.getAttribute('data-category') === targetCat;
        if (isActive) {
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        }
      });

      // Update mobile horizontal tabs
      const tBtns = document.querySelectorAll('.admin-tab-btn');
      tBtns.forEach(function(btn) {
        const isActive = btn.getAttribute('data-category') === targetCat;
        if (isActive) {
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          try {
            btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          } catch (e) {}
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        }
      });

      // Save preference in localStorage
      try {
        localStorage.setItem('airshare_admin_active_cat', targetCat);
      } catch (e) {}

      // Sync URL hash without jumping
      if (shouldUpdateHash !== false) {
        try {
          if (window.location.hash !== '#' + targetCat) {
            history.replaceState(null, '', '#' + targetCat);
          }
        } catch (e) {}
      }
    }

    // Expose globally for inline onclick or console/external triggers
    window.switchCategory = switchCategory;
    window.switchAdminCategory = switchCategory;

    // Event delegation on document to guarantee clicks on buttons, SVGs, or spans are ALWAYS caught
    document.addEventListener('click', function(e) {
      const trigger = e.target.closest('.admin-sidebar-btn, .admin-tab-btn, [data-category]');
      if (trigger) {
        const cat = trigger.getAttribute('data-category');
        if (cat) {
          e.preventDefault();
          switchCategory(cat, true);
        }
      }
    });

    // Handle browser back/forward navigation or direct hash links
    window.addEventListener('hashchange', function() {
      try {
        const hashCat = (window.location.hash || '').replace(/^#/, '').trim();
        if (hashCat) {
          switchCategory(hashCat, false);
        }
      } catch (e) {}
    });

    // Resolve initial category on page load:
    (function resolveInitialCategory() {
      let initialCat = '';
      try {
        const hashVal = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        if (hashVal && VALID_CATEGORIES.includes(hashVal)) {
          initialCat = hashVal;
        }
      } catch (e) {}

      if (!initialCat) {
        try {
          const params = new URLSearchParams(window.location.search);
          const queryVal = (params.get('tab') || params.get('category') || params.get('cat') || '').trim().toLowerCase();
          if (queryVal && VALID_CATEGORIES.includes(queryVal)) {
            initialCat = queryVal;
          }
        } catch (e) {}
      }

      if (!initialCat) {
        try {
          const savedCat = (localStorage.getItem('airshare_admin_active_cat') || '').trim().toLowerCase();
          if (savedCat && VALID_CATEGORIES.includes(savedCat)) {
            initialCat = savedCat;
          }
        } catch (e) {}
      }

      if (!initialCat) {
        initialCat = 'ringkasan';
      }

      switchCategory(initialCat, false);
    })();
  `;
}
