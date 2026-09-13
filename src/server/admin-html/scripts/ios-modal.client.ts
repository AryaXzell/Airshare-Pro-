/**
 * Client-side iOS Modal confirmation and alert utilities.
 */
export function getIosModalScript(): string {
  return `
    // Global iOS-style confirmation modal handler
    window.showIosConfirm = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          resolve(confirm((options.title ? options.title + '\\n\\n' : '') + (options.message || '')));
          return;
        }

        titleEl.textContent = options.title || 'Konfirmasi Tindakan';
        msgEl.textContent = options.message || '';

        const isDestructive = options.isDestructive !== false;
        const iconType = options.icon || (isDestructive ? 'danger' : 'warning');
        
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-cancel" id="ios-btn-cancel">' + (options.cancelText || 'Batal') + '</button>' +
          '<button type="button" class="ios-modal-btn ' + (isDestructive ? 'ios-modal-btn-danger' : 'ios-modal-btn-primary') + '" id="ios-btn-confirm">' + (options.confirmText || (isDestructive ? 'Ya, Lanjutkan' : 'Konfirmasi')) + '</button>';

        function cleanup(result) {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve(result);
        }

        function handleKey(e) {
          if (e.key === 'Escape') cleanup(false);
        }

        const btnCancel = document.getElementById('ios-btn-cancel');
        const btnConfirm = document.getElementById('ios-btn-confirm');
        if (btnCancel) btnCancel.onclick = function() { cleanup(false); };
        if (btnConfirm) btnConfirm.onclick = function() { cleanup(true); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    // Global iOS-style statement/alert modal handler
    window.showIosAlert = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          alert((options.title ? options.title + '\\n\\n' : '') + (options.message || ''));
          resolve();
          return;
        }

        titleEl.textContent = options.title || 'Pemberitahuan';
        msgEl.textContent = options.message || '';

        const iconType = options.icon || 'info';
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-primary" id="ios-btn-ok">' + (options.buttonText || 'Mengerti') + '</button>';

        function cleanup() {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve();
        }

        function handleKey(e) {
          if (e.key === 'Escape' || e.key === 'Enter') cleanup();
        }

        const btnOk = document.getElementById('ios-btn-ok');
        if (btnOk) btnOk.onclick = function() { cleanup(); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    // Aliases for admin operational components
    window.showIosAdminConfirm = function(options) {
      if (typeof options === 'object' && options !== null && (options.title || options.message)) {
        return window.showIosConfirm(options);
      }
      return window.showIosConfirm({
        title: arguments[0] || 'Konfirmasi',
        message: arguments[1] || '',
        isDestructive: arguments[2] !== false,
        confirmText: arguments[3] || 'Konfirmasi'
      });
    };

    window.showIosAdminAlert = function(title, message, type) {
      return window.showIosAlert({
        title: title || 'Pemberitahuan',
        message: message || '',
        icon: type || 'info'
      });
    };
  `;
}
