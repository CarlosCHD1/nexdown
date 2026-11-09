// NexDown - Content Script
// Ativo EXCLUSIVAMENTE em: TikTok, Reels do Instagram e YouTube Shorts.

(function () {
  'use strict';

  let currentFloatingPill = null;
  let activeVideoElement = null;
  let mediaRecorderInstance = null;
  let recordingChunks = [];

  // Verifica se a página atual é um dos 3 alvos exatos
  function isTargetPage() {
    const url = window.location.href;

    // 1. YouTube Shorts (apenas /shorts ou contêiner de Shorts ativo)
    if (url.includes('youtube.com')) {
      return url.includes('/shorts') || !!document.querySelector('ytd-reel-video-renderer[is-active], ytd-shorts');
    }

    // 2. Instagram Reels (apenas /reel, /reels ou quando visualizando Reels)
    if (url.includes('instagram.com')) {
      return url.includes('/reel') || url.includes('/reels') || !!document.querySelector('article video, div[role="dialog"] video');
    }

    // 3. TikTok (vídeos do feed ou detalhe de vídeo)
    if (url.includes('tiktok.com')) {
      return true;
    }

    return false;
  }

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('youtube.com')) return 'YouTube';
    return null;
  }

  // Remove parâmetros que quebram o arquivo MP4 em fragmentos (bytestart, byteend)
  function cleanMediaUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      u.searchParams.delete('bytestart');
      u.searchParams.delete('byteend');
      u.searchParams.delete('bytelength');
      return u.toString();
    } catch (e) {
      return rawUrl.replace(/([?&])(bytestart|byteend|bytelength)=\d+/g, '').replace(/&&/g, '&');
    }
  }

  // Extrai a URL progressiva completa HD do Instagram Reels
  function findInstagramHDVideoUrl(video) {
    if (!video) return null;

    const directSrc = video.src || video.currentSrc;
    if (directSrc && directSrc.startsWith('http') && !directSrc.startsWith('blob:') && !directSrc.includes('.vtt')) {
      return cleanMediaUrl(directSrc);
    }

    const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
    for (const s of scripts) {
      const txt = s.textContent || '';
      if (txt.includes('browser_native_hd_url') || txt.includes('video_versions')) {
        const hdMatch = txt.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
                        txt.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/) ||
                        txt.match(/"video_versions"\s*:\s*\[\s*\{\s*"[^"]*"\s*:\s*[^,]*,\s*"url"\s*:\s*"([^"]+)"/);
        if (hdMatch && hdMatch[1]) {
          const unescaped = hdMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          if (unescaped.startsWith('http')) {
            return cleanMediaUrl(unescaped);
          }
        }
      }
    }

    try {
      const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
      if (fiberKey) {
        let node = video[fiberKey];
        while (node) {
          const props = node.memoizedProps || node.pendingProps;
          if (props?.videoData?.video_versions?.[0]?.url) {
            return cleanMediaUrl(props.videoData.video_versions[0].url);
          }
          if (props?.src && typeof props.src === 'string' && props.src.startsWith('http')) {
            return cleanMediaUrl(props.src);
          }
          node = node.return;
        }
      }
    } catch (e) {}

    return null;
  }

  // Extrai a URL real do vídeo do TikTok (evita pegar arquivo de legenda WebVTT)
  function findTikTokHDVideoUrl(video) {
    if (!video) return null;

    const directSrc = video.src || video.currentSrc;
    if (directSrc && directSrc.startsWith('http') && !directSrc.startsWith('blob:') && !directSrc.includes('.vtt') && !directSrc.includes('caption')) {
      return directSrc;
    }

    const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if (script && script.textContent) {
      const txt = script.textContent;
      const playMatch = txt.match(/"playAddr"\s*:\s*"([^"]+)"/) || txt.match(/"downloadAddr"\s*:\s*"([^"]+)"/);
      if (playMatch && playMatch[1]) {
        const unescaped = playMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (unescaped.startsWith('http') && !unescaped.includes('.vtt')) {
          return unescaped;
        }
      }
    }

    const allScripts = document.querySelectorAll('script');
    for (const s of allScripts) {
      const content = s.textContent || '';
      if (content.includes('playAddr') && !content.includes('.vtt')) {
        const match = content.match(/"playAddr"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          if (url.startsWith('http')) return url;
        }
      }
    }

    return null;
  }

  // Captura direta em alta definição no navegador para YouTube Shorts
  function recordAndSaveYouTubeShort(video, buttonEl, title) {
    if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
      mediaRecorderInstance.stop();
      return;
    }

    try {
      const stream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
      if (!stream) {
        alert('⚡ NexDown: O navegador não permitiu acesso ao stream deste short.');
        return;
      }

      const preferredMimes = [
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4',
        'video/webm; codecs=vp9,opus',
        'video/webm'
      ];
      const selectedMime = preferredMimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

      recordingChunks = [];
      mediaRecorderInstance = new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 6000000 });

      mediaRecorderInstance.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.push(e.data);
      };

      mediaRecorderInstance.onstop = () => {
        const blob = new Blob(recordingChunks, { type: selectedMime });
        const url = URL.createObjectURL(blob);
        const isMp4 = selectedMime.includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';
        const cleanTitle = (title || 'nexdown_short').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
        const filename = `${cleanTitle}_${Date.now()}.${ext}`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);

        buttonEl.innerHTML = `<span>✅ Salvo!</span>`;
        setTimeout(() => {
          buttonEl.innerHTML = `<span>📥 Baixar Short</span>`;
          buttonEl.disabled = false;
        }, 3000);
        mediaRecorderInstance = null;
      };

      video.currentTime = 0;
      video.play().catch(() => {});

      mediaRecorderInstance.start(250);

      const duration = Math.ceil(video.duration) || 30;
      buttonEl.innerHTML = `<span>⏹️ Salvar (${duration}s)</span>`;

      const progressTimer = setInterval(() => {
        if (!mediaRecorderInstance || mediaRecorderInstance.state !== 'recording') {
          clearInterval(progressTimer);
          return;
        }
        const remaining = Math.max(0, Math.ceil(duration - video.currentTime));
        buttonEl.innerHTML = `<span>⏹️ Salvar (${remaining}s)</span>`;

        if (video.currentTime >= duration - 0.4 || video.ended) {
          clearInterval(progressTimer);
          if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
            mediaRecorderInstance.stop();
          }
        }
      }, 500);

    } catch (err) {
      console.error('Erro na gravação do short:', err);
      alert('⚡ NexDown: Erro ao capturar o vídeo: ' + err.message);
      buttonEl.innerHTML = `<span>📥 Baixar Short</span>`;
      buttonEl.disabled = false;
    }
  }

  // Extrai título, legenda e contexto do post ativo
  function extractActivePostContext(video) {
    let caption = '';
    let title = document.title || 'Vídeo';
    let metrics = '';
    const platform = detectPlatform();

    if (platform === 'YouTube') {
      const activeRenderer = document.querySelector('ytd-reel-video-renderer[is-active]');
      if (activeRenderer) {
        const titleEl = activeRenderer.querySelector('#title, .yt-core-attributed-string, #text');
        if (titleEl) caption = titleEl.innerText;
        const channelEl = activeRenderer.querySelector('#channel-name, .ytd-channel-name');
        if (channelEl) title = `YouTube Shorts - ${channelEl.innerText.trim()}`;
      } else {
        const titleTag = document.querySelector('h1.ytd-watch-metadata, #title h1');
        if (titleTag) caption = titleTag.innerText;
      }
    } else if (platform === 'Instagram') {
      const activeCard = video?.closest('article') || document.querySelector('article') || document.querySelector('div[role="dialog"]');
      if (activeCard) {
        const textNodes = activeCard.querySelectorAll('h1, span._ap3a, div._a9zs');
        textNodes.forEach(node => {
          if (node.innerText && node.innerText.length > 5) caption += node.innerText + ' ';
        });
      }
      title = `Instagram Reel - ${document.title.split('•')[0] || ''}`;
    } else if (platform === 'TikTok') {
      const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
      if (desc) caption = desc.innerText;
      title = `TikTok - ${document.title}`;
    }

    if (!caption) {
      const meta = document.querySelector('meta[property="og:description"]');
      if (meta) caption = meta.content;
    }

    const context = {
      platform,
      title: title.trim(),
      caption: caption.trim(),
      metrics: metrics.trim(),
      url: window.location.href,
      videoSrc: video?.src || video?.currentSrc || ''
    };

    chrome.runtime.sendMessage({
      action: 'SET_ACTIVE_POST_CONTEXT',
      context
    }).catch(() => {});

    return context;
  }

  // Encontra o contêiner adequado
  function findTargetContainer(video) {
    const platform = detectPlatform();

    if (platform === 'YouTube') {
      const activeShort = document.querySelector('ytd-reel-video-renderer[is-active]');
      if (activeShort) {
        return activeShort.querySelector('#player-container') || activeShort;
      }
      return video.closest('.html5-video-player') || video.parentElement;
    }

    if (platform === 'Instagram') {
      return video.closest('article') || video.closest('div[role="dialog"]') || video.closest('div.x1qjc9v5') || video.parentElement;
    }

    if (platform === 'TikTok') {
      return video.closest('[data-e2e="feed-video"]') || video.parentElement;
    }

    return video.parentElement;
  }

  // Cria e posiciona a pílula flutuante discreta
  function showFloatingPill(video) {
    if (!isTargetPage()) {
      if (currentFloatingPill) {
        currentFloatingPill.remove();
        currentFloatingPill = null;
      }
      return;
    }

    if (!video || !video.isConnected) return;
    activeVideoElement = video;

    const targetContainer = findTargetContainer(video);
    if (!targetContainer) return;

    if (currentFloatingPill && currentFloatingPill.parentElement === targetContainer) {
      return;
    }

    if (currentFloatingPill) {
      currentFloatingPill.remove();
      currentFloatingPill = null;
    }

    const computedPos = window.getComputedStyle(targetContainer).position;
    if (computedPos === 'static') {
      targetContainer.style.position = 'relative';
    }

    const platform = detectPlatform();
    const downloadLabel = platform === 'YouTube' ? '📥 Baixar Short' : '📥 Baixar MP4';

    const pill = document.createElement('div');
    pill.className = 'nexdown-floating-pill';
    pill.innerHTML = `
      <div class="nexdown-pill-brand">
        <span>⚡ NexDown</span>
      </div>
      <button class="nexdown-pill-btn nexdown-btn-download" title="Baixar Vídeo (Sem abas externas)">
        <span>${downloadLabel}</span>
      </button>
      <button class="nexdown-pill-btn nexdown-pill-btn-ai" title="Criar Roteiro e 5 Hooks Sedutores com IA">
        <span>🧠 Recriar IA</span>
      </button>
      <button class="nexdown-pill-btn nexdown-btn-sidepanel" title="Abrir Estúdio Lateral">
        <span>📐 Estúdio</span>
      </button>
    `;

    // 1. Download
    const downloadBtn = pill.querySelector('.nexdown-btn-download');
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const context = extractActivePostContext(video);

      // No YouTube Shorts
      if (platform === 'YouTube') {
        recordAndSaveYouTubeShort(video, downloadBtn, context.title);
        return;
      }

      // No Instagram Reels e TikTok
      downloadBtn.innerHTML = `<span>⏳ Baixando...</span>`;
      downloadBtn.disabled = true;

      let directUrl = null;
      if (platform === 'Instagram') {
        directUrl = findInstagramHDVideoUrl(video);
      } else if (platform === 'TikTok') {
        directUrl = findTikTokHDVideoUrl(video);
      }

      const host = window.location.hostname.replace('www.', '').split('.')[0];
      const filename = `nexdown_${host}_${Date.now()}.mp4`;

      chrome.runtime.sendMessage({
        action: 'SMART_DOWNLOAD_ACTIVE_VIDEO',
        directSrc: directUrl,
        pageUrl: window.location.href,
        platform: platform,
        filename: filename
      }, (res) => {
        downloadBtn.disabled = false;
        if (res && res.success) {
          downloadBtn.innerHTML = `<span>✅ Baixado!</span>`;
          setTimeout(() => {
            downloadBtn.innerHTML = `<span>${downloadLabel}</span>`;
          }, 2500);
        } else {
          downloadBtn.innerHTML = `<span>❌ Erro</span>`;
          alert('⚡ NexDown: ' + (res?.error || 'Não foi possível baixar o vídeo diretamente.'));
          setTimeout(() => {
            downloadBtn.innerHTML = `<span>${downloadLabel}</span>`;
          }, 2500);
        }
      });
    });

    // 2. Recriar IA
    const aiBtn = pill.querySelector('.nexdown-pill-btn-ai');
    aiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openInPageAIRepurposer(video);
    });

    // 3. SidePanel
    const sidepanelBtn = pill.querySelector('.nexdown-btn-sidepanel');
    sidepanelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      extractActivePostContext(video);
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    });

    targetContainer.appendChild(pill);
    currentFloatingPill = pill;
  }

  // Detecta o vídeo ativo
  function detectActiveVideo() {
    if (!isTargetPage()) {
      if (currentFloatingPill) {
        currentFloatingPill.remove();
        currentFloatingPill = null;
      }
      return;
    }

    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return;

    let playingVideo = videos.find(v => !v.paused && v.offsetWidth > 150 && v.offsetHeight > 150);

    const platform = detectPlatform();
    if (platform === 'YouTube') {
      const activeShort = document.querySelector('ytd-reel-video-renderer[is-active] video');
      if (activeShort) playingVideo = activeShort;
    }

    if (!playingVideo) {
      const windowCenterY = window.innerHeight / 2;
      let minDistance = Infinity;

      for (const v of videos) {
        if (v.offsetWidth > 160 && v.offsetHeight > 160) {
          const rect = v.getBoundingClientRect();
          const videoCenterY = rect.top + (rect.height / 2);
          const distance = Math.abs(windowCenterY - videoCenterY);

          if (rect.top < window.innerHeight && rect.bottom > 0) {
            if (distance < minDistance) {
              minDistance = distance;
              playingVideo = v;
            }
          }
        }
      }
    }

    if (playingVideo && playingVideo !== activeVideoElement) {
      showFloatingPill(playingVideo);
    }
  }

  // Modal in-page de IA
  function openInPageAIRepurposer(video) {
    const existing = document.querySelector('.nexdown-modal-backdrop');
    if (existing) existing.remove();

    const context = extractActivePostContext(video);

    const backdrop = document.createElement('div');
    backdrop.className = 'nexdown-modal-backdrop';
    backdrop.innerHTML = `
      <div class="nexdown-modal-card">
        <div class="nexdown-modal-header">
          <div class="nexdown-modal-title">
            <span>⚡ NexDown AI Repurposer Studio</span>
          </div>
          <button class="nexdown-modal-close" id="nexdown-close-modal">✕</button>
        </div>
        <div class="nexdown-modal-body" id="nexdown-modal-content">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <span class="nexdown-spinner"></span>
            <strong>Extraindo núcleo da ideia e criando roteiro viral...</strong>
          </div>
          <p style="color:#94A3B8; font-size:13px;">Formatando 5 hooks sedutores, tese central e estrutura de gravação de 45s a 60s.</p>
        </div>
        <div class="nexdown-modal-footer">
          <span style="font-size:12px; color:#64748B;">Plataforma: ${context.platform}</span>
          <div style="display:flex; gap:8px;">
            <button class="nexdown-pill-btn" id="nexdown-copy-result" style="display:none;">📋 Copiar Tudo</button>
            <button class="nexdown-pill-btn" id="nexdown-btn-close-action">Fechar</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.querySelector('#nexdown-close-modal').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#nexdown-btn-close-action').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    chrome.storage.local.get(['nexdown_provider', 'nexdown_apikey', 'nexdown_model', 'nexdown_tone'], (res) => {
      const provider = res.nexdown_provider || 'gemini';
      const apiKey = res.nexdown_apikey || '';
      const model = res.nexdown_model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
      const toneMode = res.nexdown_tone || 'Autoridade Descontraída & Magnética';

      const contentBox = backdrop.querySelector('#nexdown-modal-content');

      if (!apiKey) {
        contentBox.innerHTML = `
          <div style="padding: 16px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px;">
            <h4 style="color: #F87171; margin: 0 0 8px 0;">🔑 API Key não configurada</h4>
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #CBD5E1;">
              Para a IA gerar os 5 hooks sedutores e o roteiro, insira sua chave gratuita do <strong>Google Gemini</strong>, <strong>Groq</strong> ou <strong>OpenAI</strong>.
            </p>
            <button class="nexdown-pill-btn nexdown-pill-btn-ai" id="nexdown-open-opts-btn" style="padding: 6px 12px;">⚙️ Abrir Configurações do NexDown</button>
          </div>
        `;
        contentBox.querySelector('#nexdown-open-opts-btn')?.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
          backdrop.remove();
        });
        return;
      }

      chrome.runtime.sendMessage({
        action: 'CALL_LLM_REPURPOSER',
        payload: {
          provider,
          apiKey,
          model,
          mediaContext: context,
          toneMode
        }
      }, (response) => {
        if (!response || !response.success) {
          contentBox.innerHTML = `
            <div style="padding: 16px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px;">
              <h4 style="color: #F87171; margin: 0 0 8px 0;">❌ Erro ao contatar a IA</h4>
              <p style="margin: 0; font-size: 13px; color: #CBD5E1;">${response?.error || 'Erro inesperado.'}</p>
            </div>
          `;
          return;
        }

        const rawMarkdown = response.data;
        contentBox.innerHTML = `
          <div class="nexdown-markdown-content">
            ${simpleMarkdownParser(rawMarkdown)}
          </div>
        `;

        const copyBtn = backdrop.querySelector('#nexdown-copy-result');
        copyBtn.style.display = 'inline-flex';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(rawMarkdown);
          copyBtn.innerText = '✅ Copiado!';
          setTimeout(() => { copyBtn.innerText = '📋 Copiar Tudo'; }, 2000);
        });
      });
    });
  }

  function simpleMarkdownParser(md) {
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/\n\n/gim, '</p><p>')
      .replace(/\n/gim, '<br>');
    return `<p>${html}</p>`;
  }

  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      showFloatingPill(e.target);
    }
  }, true);

  window.addEventListener('scroll', () => {
    detectActiveVideo();
  }, { passive: true });

  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(detectActiveVideo, 500);
  });

  const observer = new MutationObserver(() => {
    detectActiveVideo();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(detectActiveVideo, 1200);
  setTimeout(detectActiveVideo, 600);
})();
