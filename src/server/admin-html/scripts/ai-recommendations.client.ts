/**
 * Gemini AI real-time recommendation client logic.
 */
export function getAiRecommendationsScript(fullAdminPath: string): string {
  return `
    // Gemini AI Real-Time System Recommendations Engine
    function renderGeminiMarkup(raw) {
      if (!raw) return '';
      // 1. Escape HTML special characters for strict XSS prevention
      var str = String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      // 2. Headings (### or ##)
      var nl = String.fromCharCode(10);
      var lines = str.split(nl);
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('### ') === 0) {
          lines[i] = '<h4 class="ai-heading-3">' + lines[i].substring(4) + '</h4>';
        } else if (lines[i].indexOf('## ') === 0) {
          lines[i] = '<h3 class="ai-heading-3">' + lines[i].substring(3) + '</h3>';
        }
      }
      str = lines.join(nl);

      // 3. Inline code blocks using backtick char code (96)
      var tick = String.fromCharCode(96);
      if (str.indexOf(tick) !== -1) {
        str = str.split(tick).map(function(part, idx) {
          return idx % 2 === 1 ? '<code class="ai-code">' + part + '</code>' : part;
        }).join('');
      }

      // 4. Bold text: split by '**'
      if (str.indexOf('**') !== -1) {
        str = str.split('**').map(function(part, idx) {
          return idx % 2 === 1 ? '<strong class="ai-bold">' + part + '</strong>' : part;
        }).join('');
      }

      // 5. Bold text: split by '__'
      if (str.indexOf('__') !== -1) {
        str = str.split('__').map(function(part, idx) {
          return idx % 2 === 1 ? '<strong class="ai-bold">' + part + '</strong>' : part;
        }).join('');
      }

      // 6. Italic text: split by remaining single '*'
      if (str.indexOf('*') !== -1) {
        str = str.split('*').map(function(part, idx) {
          return idx % 2 === 1 ? '<em class="ai-italic">' + part + '</em>' : part;
        }).join('');
      }

      return str;
    }

    const recSkeleton = document.getElementById('ai-rec-skeleton');
    const recContent = document.getElementById('ai-rec-content');
    const recError = document.getElementById('ai-rec-error');
    const recErrorMsg = document.getElementById('ai-rec-error-msg');
    const recSummaryText = document.getElementById('ai-rec-summary-text');
    const recList = document.getElementById('ai-rec-list');
    const recModelLabel = document.getElementById('ai-rec-model-label');
    const recTimestamp = document.getElementById('ai-rec-timestamp');
    const btnRefreshAi = document.getElementById('btn-refresh-ai-rec');
    const aiRefreshIcon = document.getElementById('ai-refresh-icon');
    const aiRefreshText = document.getElementById('ai-refresh-text');
    const btnAiRetry = document.getElementById('btn-ai-retry');
    const btnAiFallback = document.getElementById('btn-ai-use-fallback');

    function setAiLoading(isLoading) {
      if (isLoading) {
        if (recSkeleton) recSkeleton.style.display = 'flex';
        if (recContent) recContent.style.display = 'none';
        if (recError) recError.style.display = 'none';
        if (btnRefreshAi) btnRefreshAi.disabled = true;
        if (aiRefreshIcon) aiRefreshIcon.style.animation = 'spin 1s infinite linear';
        if (aiRefreshText) aiRefreshText.textContent = 'Menganalisis...';
      } else {
        if (recSkeleton) recSkeleton.style.display = 'none';
        if (btnRefreshAi) btnRefreshAi.disabled = false;
        if (aiRefreshIcon) aiRefreshIcon.style.animation = '';
        if (aiRefreshText) aiRefreshText.textContent = 'Analisis AI';
      }
    }

    async function fetchAiRecommendations() {
      setAiLoading(true);
      try {
        const res = await fetch('/' + ${JSON.stringify(fullAdminPath)} + '/api/ai-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
          throw new Error('Server mengembalikan HTTP ' + res.status);
        }

        const data = await res.json();

        if (!data || (!data.summary && (!data.recommendations || data.recommendations.length === 0))) {
          throw new Error(data && data.error ? data.error : 'Respon rekomendasi kosong.');
        }

        // Render Executive Summary
        if (recSummaryText && data.summary) {
          recSummaryText.innerHTML = renderGeminiMarkup(data.summary);
        }

        // Render Recommendations List
        if (recList && Array.isArray(data.recommendations)) {
          recList.innerHTML = data.recommendations
            .map(function(item) {
              const formatted = renderGeminiMarkup(item);
              return '<li class="ai-list-item"><span class="ai-bullet">✦</span><div class="ai-item-body">' + formatted + '</div></li>';
            })
            .join('');
        }

        // Update Model Badge
        if (recModelLabel) {
          var rawModel = data.model || 'gemini-2.5-flash';
          var formattedModel = 'Gemini 2.5 Flash';
          if (rawModel.indexOf('2.5') !== -1) {
            formattedModel = 'Gemini 2.5 Flash';
          } else if (rawModel.indexOf('gemini') === 0) {
            formattedModel = rawModel.split('-').map(function(w) {
              return w.charAt(0).toUpperCase() + w.slice(1);
            }).join(' ');
          }
          recModelLabel.textContent = data.isAi ? (formattedModel + ' • Real-Time AI') : 'Mesin Heuristik Sistem';
        }

        // Update Timestamp
        if (recTimestamp) {
          const now = new Date();
          const timeFormatted = String(now.getHours()).padStart(2, '0') + ':' +
                                String(now.getMinutes()).padStart(2, '0') + ':' +
                                String(now.getSeconds()).padStart(2, '0');
          recTimestamp.textContent = (data.isAi ? 'Dianalisis secara real-time oleh Gemini: ' : 'Status heuristik lokal: ') + timeFormatted;
        }

        if (recContent) recContent.style.display = 'block';
        if (recError) recError.style.display = 'none';

        if (data.error && !data.isAi) {
          showToast(data.error, false, true);
        }
      } catch (err) {
        console.error('[AI_RECOMMENDATION_ERROR]', err);
        if (recContent) recContent.style.display = 'none';
        if (recError) {
          recError.style.display = 'block';
          if (recErrorMsg) {
            recErrorMsg.textContent = 'Kendala: ' + (err.message || 'Gagal terhubung ke layanan AI Gemini.');
          }
        }
      } finally {
        setAiLoading(false);
      }
    }

    if (btnRefreshAi) {
      btnRefreshAi.addEventListener('click', function() {
        fetchAiRecommendations();
      });
    }

    if (btnAiRetry) {
      btnAiRetry.addEventListener('click', function() {
        fetchAiRecommendations();
      });
    }

    if (btnAiFallback) {
      btnAiFallback.addEventListener('click', function() {
        if (recError) recError.style.display = 'none';
        if (recContent) recContent.style.display = 'block';
        if (recModelLabel) recModelLabel.textContent = 'Mesin Heuristik Bawaan';
      });
    }

    // Automatically trigger initial AI analysis in background on page load
    setTimeout(function() {
      fetchAiRecommendations();
    }, 400);
  `;
}
