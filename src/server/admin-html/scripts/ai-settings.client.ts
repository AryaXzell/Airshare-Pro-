/**
 * Client-side script for Gemini AI settings control:
 * toggle on/off, dynamic model list selection, and connection test.
 */
export function getAiSettingsScript(fullAdminPath: string): string {
  return `
    // -------------------------------------------------------------
    // Gemini AI Settings: Toggle, Dynamic Model Dropdown, & Connection Test
    // -------------------------------------------------------------
    (function initAiSettings() {
      const adminBase = '/' + ${JSON.stringify(fullAdminPath)}.replace(/^\\/+|\\/+$/g, '');
      const aiToggle = document.getElementById('ai-enabled-toggle');
      const aiModelSection = document.getElementById('ai-model-section');
      const aiModelTrigger = document.getElementById('ai-model-trigger');
      const aiModelLabel = document.getElementById('ai-model-label');
      const aiModelLoadingHint = document.getElementById('ai-model-loading-hint');
      const btnTestAiConnection = document.getElementById('btn-test-ai-connection');
      const aiTestResult = document.getElementById('ai-test-result');

      if (!aiToggle && !aiModelTrigger && !btnTestAiConnection) return;

      let availableAiModels = [];

      // 1. Toggle Switch Handler (Server-Enforced)
      if (aiToggle) {
        aiToggle.addEventListener('change', async function() {
          const isEnabled = aiToggle.checked;
          const currentModel = (aiModelTrigger && aiModelTrigger.getAttribute('data-value')) || 'gemini-2.5-flash';

          try {
            const res = await fetch(adminBase + '/api/ai-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: isEnabled, model: currentModel }),
            });

            const data = await res.json().catch(function() { return null; });

            if (res.ok && data && data.success) {
              if (typeof showToast === 'function') {
                const msg = isEnabled
                  ? ('Ringkasan Gemini AI diaktifkan (Model: ' + currentModel + ').')
                  : 'Ringkasan Gemini AI dinonaktifkan.';
                showToast(msg, false);
              }
            } else {
              // Revert toggle state on failure
              aiToggle.checked = !isEnabled;
              const errMsg = (data && data.error && (data.error.message || data.error)) || ('Gagal menyimpan konfigurasi AI (HTTP ' + res.status + ').');
              if (typeof showToast === 'function') {
                showToast(errMsg, true);
              }
            }
          } catch (err) {
            aiToggle.checked = !isEnabled;
            if (typeof showToast === 'function') {
              showToast('Kesalahan jaringan saat menyimpan konfigurasi AI.', true);
            }
          }
        });
      }

      // 2. Dynamic Models Fetching (Selalu aktif, siap sebelum toggle dinyalakan)
      async function fetchAvailableAiModels() {
        if (!aiModelLoadingHint) return;
        aiModelLoadingHint.textContent = 'Memuat daftar model dari Google API...';
        aiModelLoadingHint.style.color = 'var(--text-muted)';

        try {
          const res = await fetch(adminBase + '/api/ai-models');
          const data = await res.json().catch(function() { return null; });

          if (res.ok && data && data.success && Array.isArray(data.models) && data.models.length > 0) {
            availableAiModels = data.models;
            aiModelLoadingHint.textContent = data.models.length + ' model terdeteksi dari Google API. Klik tombol di atas untuk mengganti.';
            aiModelLoadingHint.style.color = '#10b981';
          } else {
            const errMsg = (data && data.error && (data.error.message || data.error)) || 'Menggunakan model rekomendasi default.';
            aiModelLoadingHint.textContent = errMsg;
            aiModelLoadingHint.style.color = 'var(--text-muted)';
          }
        } catch (err) {
          aiModelLoadingHint.textContent = 'Menggunakan daftar model rekomendasi default.';
          aiModelLoadingHint.style.color = 'var(--text-muted)';
        }
      }

      // 3. Action Sheet Helper for AI Models
      function showAiModelActionSheet(opts) {
        return new Promise(function(resolve) {
          const title = opts.title || 'Pilih Model Gemini AI';
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
          modal.style.maxWidth = '520px';
          modal.style.maxHeight = '80vh';
          modal.style.display = 'flex';
          modal.style.flexDirection = 'column';
          modal.style.margin = '0 auto';

          let itemsHtml = '';
          choices.forEach(function(c) {
            const isSel = c.value === currentValue;
            itemsHtml += '<div class="ios-sheet-item ' + (isSel ? 'selected' : '') + '" data-value="' + c.value + '" tabindex="0" role="option" aria-selected="' + isSel + '" style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;cursor:pointer;border-bottom:1px solid var(--border-subtle);">' +
              '<div>' +
                '<div style="font-weight:600;font-size:0.85rem;color:var(--text-main);">' + c.label + '</div>' +
                (c.sublabel ? '<div style="font-size:0.725rem;color:var(--text-muted);font-family:var(--font-mono);">' + c.sublabel + '</div>' : '') +
              '</div>' +
              '<svg class="ios-sheet-check ' + (isSel ? 'visible' : '') + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="' + (isSel ? 'display:block;color:var(--accent);' : 'display:none;') + '"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</div>';
          });

          modal.innerHTML = 
            '<div class="ios-sheet-header" style="padding:1rem;border-bottom:1px solid var(--border);position:relative;text-align:center;">' +
              '<div class="ios-sheet-handle" style="width:36px;height:4px;background:var(--border-subtle);border-radius:2px;margin:0 auto 0.5rem;"></div>' +
              '<div class="ios-sheet-title" style="font-weight:700;font-size:0.95rem;">' + title + '</div>' +
            '</div>' +
            '<div class="ios-sheet-body" style="overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;">' + itemsHtml + '</div>' +
            '<div class="ios-sheet-footer" style="padding:0.75rem;border-top:1px solid var(--border);">' +
              '<button type="button" class="ios-sheet-btn-cancel" style="width:100%;padding:0.6rem;background:var(--surface-secondary);border:1px solid var(--border);border-radius:0.5rem;font-weight:600;cursor:pointer;color:var(--text-main);">Batal</button>' +
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

      // 4. Dropdown Click Trigger (Bisa diklik dan dipilih kapan saja)
      if (aiModelTrigger) {
        aiModelTrigger.addEventListener('click', async function() {
          const currentModel = aiModelTrigger.getAttribute('data-value') || 'gemini-2.5-flash';

          // Build choices list
          let choices = [];
          if (availableAiModels && availableAiModels.length > 0) {
            choices = availableAiModels.map(function(m) {
              return {
                value: m.name,
                label: m.displayName || m.name,
                sublabel: m.name !== m.displayName ? m.name : '',
              };
            });
          } else {
            // Standard recommended models
            const fallbackOptions = [
              { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', sublabel: 'Generasi terbaru, cepat & hemat latensi (Direkomendasikan)' },
              { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', sublabel: 'Penalaran kompleks & konteks mendalam' },
              { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', sublabel: 'Model stabil generasi sebelumnya' },
            ];

            if (!fallbackOptions.some(function(f) { return f.value === currentModel; })) {
              choices.push({
                value: currentModel,
                label: currentModel,
                sublabel: 'Model aktif saat ini',
              });
            }
            choices = choices.concat(fallbackOptions);
          }

          const selected = await showAiModelActionSheet({
            title: 'Pilih Model Gemini AI',
            currentValue: currentModel,
            choices: choices,
          });

          if (!selected || selected === currentModel) return;

          // Update trigger visual immediately
          const previousModel = currentModel;
          aiModelTrigger.setAttribute('data-value', selected);
          if (aiModelLabel) aiModelLabel.textContent = selected;

          // Persist to server (baik toggle sedang ON maupun OFF)
          try {
            const isEnabled = aiToggle ? aiToggle.checked : false;
            const res = await fetch(adminBase + '/api/ai-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: isEnabled, model: selected }),
            });
            const data = await res.json().catch(function() { return null; });

            if (res.ok && data && data.success) {
              if (typeof showToast === 'function') {
                showToast('Model Gemini AI dipilih: "' + selected + '".', false);
              }
            } else {
              // Revert
              aiModelTrigger.setAttribute('data-value', previousModel);
              if (aiModelLabel) aiModelLabel.textContent = previousModel;
              const errMsg = (data && data.error && (data.error.message || data.error)) || ('Gagal menyimpan model AI (HTTP ' + res.status + ').');
              if (typeof showToast === 'function') {
                showToast(errMsg, true);
              }
            }
          } catch (err) {
            aiModelTrigger.setAttribute('data-value', previousModel);
            if (aiModelLabel) aiModelLabel.textContent = previousModel;
            if (typeof showToast === 'function') {
              showToast('Kesalahan jaringan saat menyimpan model AI.', true);
            }
          }
        });
      }

      // 5. Test Connection Button Handler (Bisa diuji sebelum atau sesudah AI diaktifkan)
      if (btnTestAiConnection) {
        btnTestAiConnection.addEventListener('click', async function() {
          const originalText = btnTestAiConnection.textContent;
          btnTestAiConnection.disabled = true;
          btnTestAiConnection.textContent = 'Menguji koneksi ke Google API...';

          if (aiTestResult) {
            aiTestResult.style.display = 'none';
          }

          const modelToTest = (aiModelTrigger && aiModelTrigger.getAttribute('data-value')) || 'gemini-2.5-flash';

          try {
            const res = await fetch(adminBase + '/api/ai-test-connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: modelToTest }),
            });
            const data = await res.json().catch(function() { return null; });

            if (aiTestResult) {
              aiTestResult.style.display = 'block';
              aiTestResult.style.wordBreak = 'break-word';
              aiTestResult.style.overflowWrap = 'anywhere';
              aiTestResult.style.maxWidth = '100%';
              aiTestResult.style.boxSizing = 'border-box';
              if (res.ok && data && data.connected) {
                aiTestResult.style.background = 'rgba(16, 185, 129, 0.15)';
                aiTestResult.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                aiTestResult.style.color = '#34d399';
                aiTestResult.textContent = '✅ Terhubung ke Gemini API (' + data.latencyMs + 'ms) — Model "' + data.model + '" siap digunakan.';
              } else {
                aiTestResult.style.background = 'rgba(239, 68, 68, 0.15)';
                aiTestResult.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                aiTestResult.style.color = '#f87171';
                let msg = (data && data.error && (data.error.message || data.error)) || ('Gagal terhubung ke Gemini API (HTTP ' + res.status + ').');
                if (typeof msg === 'string' && (msg.indexOf('RESOURCE_EXHAUSTED') !== -1 || msg.indexOf('429') !== -1 || msg.indexOf('quota') !== -1)) {
                  msg = 'Kuota Gemini API terlampaui (429: Quota Exceeded) untuk model "' + modelToTest + '". Silakan pilih model alternatif di dropdown atau tunggu beberapa saat.';
                }
                aiTestResult.textContent = '❌ ' + msg;
              }
            }
          } catch (err) {
            if (aiTestResult) {
              aiTestResult.style.display = 'block';
              aiTestResult.style.background = 'rgba(239, 68, 68, 0.15)';
              aiTestResult.style.border = '1px solid rgba(239, 68, 68, 0.3)';
              aiTestResult.style.color = '#f87171';
              aiTestResult.textContent = '❌ Terjadi kesalahan jaringan saat menguji koneksi AI.';
            }
          } finally {
            btnTestAiConnection.disabled = false;
            btnTestAiConnection.textContent = originalText;
          }
        });
      }

      // Initial Fetch of Models
      fetchAvailableAiModels();
    })();
  `;
}
