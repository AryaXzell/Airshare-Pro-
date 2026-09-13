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

    function showToast(msg, isError, isWarn) {
      const toast = document.getElementById('admin-toast-banner');
      if (!toast) return;
      toast.style.display = 'flex';
      if (isError) {
        toast.style.background = 'rgba(239, 68, 68, 0.15)';
        toast.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        toast.style.color = '#f87171';
      } else if (isWarn) {
        toast.style.background = 'rgba(245, 158, 11, 0.15)';
        toast.style.border = '1px solid rgba(245, 158, 11, 0.3)';
        toast.style.color = '#fbbf24';
      } else {
        toast.style.background = 'rgba(16, 185, 129, 0.15)';
        toast.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        toast.style.color = '#34d399';
      }

      toast.innerHTML = '';
      const msgSpan = document.createElement('span');
      msgSpan.textContent = msg;
      msgSpan.style.cssText = 'overflow-wrap: break-word; word-break: break-word; max-width: 100%; min-width: 0; flex: 1;';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.style.cssText = 'background:none; border:none; color:inherit; font-size:1.1rem; cursor:pointer; padding:0 0.5rem; flex-shrink: 0;';
      closeBtn.addEventListener('click', function() {
        toast.style.display = 'none';
      });
      toast.appendChild(msgSpan);
      toast.appendChild(closeBtn);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Category Switching & High-Performance Touch Navigation Handler
    const VALID_CATEGORIES = ['ringkasan', 'analitik', 'status', 'kontrol', 'keamanan', 'data', 'terhapus'];

    function switchCategory(catName, shouldUpdateHash) {
      if (!catName) return;
      const normalized = String(catName).toLowerCase().trim().replace(/^#/, '');
      const targetCat = VALID_CATEGORIES.includes(normalized) ? normalized : 'ringkasan';

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
