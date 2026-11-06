// NexDown - Content Script (Sortfeed + Video Downloader + AI Repurposer)
// Injeta Radar Viral, Ordenador de Feed (SortFeed), Detecção de Outliers e Botões Flutuantes.

(function () {
  'use strict';

  let inspectedVideos = new WeakSet();
  let currentPlatform = detectPlatform();

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('youtube.com')) return 'YouTube';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'X';
    if (host.includes('threads.net')) return 'Threads';
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('facebook.com')) return 'Facebook';
    return 'Web';
  }

  // Converte strings de métricas ("1.2M", "450K", "15.3 mil") em números
  function parseMetricNumber(text) {
    if (!text) return 0;
    const clean = text.toLowerCase().replace(/\s+/g, '').replace(',', '.');
    const match = clean.match(/([\d\.]+)([k|m|b|mil|mi|bi]?)/);
    if (!match) return 0;
    let num = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 'k' || unit === 'mil') num *= 1000;
    else if (unit === 'm' || unit === 'mi') num *= 1000000;
    else if (unit === 'b' || unit === 'bi') num *= 1000000000;
    return isNaN(num) ? 0 : num;
  }

  // Extrai informações do post / reel ativo
  function extractPostContext(videoElement) {
    let caption = '';
    let title = document.title || 'Vídeo';
    let metrics = '';
    const platform = detectPlatform();

    if (platform === 'Instagram') {
      const article = videoElement?.closest('article') || document.querySelector('article') || document.querySelector('div[role="dialog"]');
      if (article) {
        const textNodes = article.querySelectorAll('h1, span._ap3a, div._a9zs');
        textNodes.forEach(node => {
          if (node.innerText && node.innerText.length > 5) caption += node.innerText + ' ';
        });
        const likesEl = article.querySelector('section span, div._aacl');
        if (likesEl) metrics = likesEl.innerText;
      }
    } else if (platform === 'TikTok') {
      const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
      if (desc) caption = desc.innerText;
      const likes = document.querySelector('[data-e2e="like-count"]');
      if (likes) metrics = `${likes.innerText} curtidas`;
    } else if (platform === 'YouTube') {
      const shortsTitle = document.querySelector('ytd-reel-video-renderer[is-active] #title, ytd-shorts-video-title');
      if (shortsTitle) caption = shortsTitle.innerText;
    } else if (platform === 'X') {
      const tweet = videoElement?.closest('article');
      if (tweet) {
        const tweetText = tweet.querySelector('div[data-testid="tweetText"]');
        if (tweetText) caption = tweetText.innerText;
      }
    }

    if (!caption) {
      const meta = document.querySelector('meta[property="og:description"]');
      if (meta) caption = meta.content;
    }

    const context = {
      platform,
      title,
      caption: caption.trim(),
      metrics: metrics.trim(),
      url: videoElement?.src || videoElement?.currentSrc || window.location.href
    };

    // Notifica background do post ativo
    chrome.runtime.sendMessage({
      action: 'SET_ACTIVE_POST_CONTEXT',
      context
    }).catch(() => {});

    return context;
  }

  // Adiciona badge flutuante sobre qualquer vídeo em reprodução
  function attachBadgeToVideo(video) {
    if (inspectedVideos.has(video)) return;
    inspectedVideos.add(video);

    const parent = video.parentElement;
    if (!parent) return;
    if (parent.querySelector('.nexdown-badge-container')) return;

    const computedPos = window.getComputedStyle(parent).position;
    if (computedPos === 'static') {
      parent.style.position = 'relative';
    }

    const badge = document.createElement('div');
    badge.className = 'nexdown-badge-container';
    badge.innerHTML = `
      <span class="nexdown-logo-text">⚡ NexDown</span>
      <div class="nexdown-actions-row">
        <button class="nexdown-btn nexdown-btn-download" title="Baixar Vídeo (MP4)">📥 Baixar</button>
        <button class="nexdown-btn nexdown-btn-ai" title="Recriar Vídeo com IA (Hooks & Roteiro)">🧠 Recriar IA</button>
        <button class="nexdown-btn nexdown-btn-panel" title="Abrir Side Panel">📐 Painel</button>
      </div>
    `;

    // Download
    badge.querySelector('.nexdown-btn-download').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const videoSrc = video.src || video.currentSrc;
      if (!videoSrc || videoSrc.startsWith('blob:')) {
        alert('⚡ NexDown: Vídeo em streaming HLS/DASH detectado! Clique no ícone do NexDown na barra do navegador ou abra o Painel Lateral para baixar a faixa MP4.');
        return;
      }
      const host = window.location.hostname.replace('www.', '').split('.')[0];
      const filename = `nexdown_${host}_${Date.now()}.mp4`;
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MEDIA',
        url: videoSrc,
        filename: filename
      });
    });

    // Recriar com IA (In-Page Modal)
    badge.querySelector('.nexdown-btn-ai').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openInPageAIRepurposer(video);
    });

    // Abrir Side Panel
    badge.querySelector('.nexdown-btn-panel').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      extractPostContext(video);
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    });

    parent.appendChild(badge);
  }

  // --- SORTFEED / RADAR VIRAL ENGINE ---
  // Injeta barra superior em perfis (Instagram, TikTok, YouTube) para ordenar posts por views/likes
  function injectFeedSorterBar() {
    if (document.getElementById('nexdown-sorter-bar')) return;

    // Detecta se estamos num perfil ou grid de vídeos
    const isProfilePage = 
      (window.location.href.includes('instagram.com') && !window.location.href.includes('/p/')) ||
      (window.location.href.includes('tiktok.com/@')) ||
      (window.location.href.includes('youtube.com/@') || window.location.href.includes('/shorts'));

    if (!isProfilePage) return;

    const bar = document.createElement('div');
    bar.id = 'nexdown-sorter-bar';
    bar.className = 'nexdown-sorter-bar';
    bar.innerHTML = `
      <div class="nexdown-sorter-content">
        <div class="nexdown-sorter-brand">
          <span style="font-size:16px;">⚡</span>
          <strong>NexDown Radar</strong>
          <span class="nexdown-sorter-tag">SortFeed AI</span>
        </div>
        <div class="nexdown-sorter-controls">
          <span style="font-size:12px; color:#94A3B8;">Ordenar por:</span>
          <button class="nexdown-sort-btn active" data-sort="views">🔥 Mais Vistos (Views)</button>
          <button class="nexdown-sort-btn" data-sort="outliers">💎 Outliers Virais (>3x)</button>
          <button class="nexdown-sort-btn" data-sort="reset">↺ Restaurar Ordem</button>
        </div>
        <button class="nexdown-sorter-sidepanel" id="nexdown-open-sidepanel-btn">
          📐 Abrir Estúdio IA
        </button>
      </div>
    `;

    document.body.prepend(bar);

    // Eventos de ordenação
    bar.querySelectorAll('.nexdown-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.nexdown-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sortType = btn.getAttribute('data-sort');
        executeFeedSort(sortType);
      });
    });

    bar.querySelector('#nexdown-open-sidepanel-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    });
  }

  // Executa o ordenamento dos itens do feed na página
  function executeFeedSort(type) {
    let items = [];
    let container = null;

    // Instagram Profile Grid
    if (window.location.href.includes('instagram.com')) {
      const posts = document.querySelectorAll('article a[href*="/p/"], article a[href*="/reel/"], div._ac7v > div');
      if (posts.length > 0) {
        container = posts[0].parentElement?.parentElement;
        items = Array.from(posts);
      }
    }
    // TikTok Profile Grid
    else if (window.location.href.includes('tiktok.com')) {
      const posts = document.querySelectorAll('[data-e2e="user-post-item"]');
      if (posts.length > 0) {
        container = posts[0].parentElement;
        items = Array.from(posts);
      }
    }
    // YouTube Shorts / Videos
    else if (window.location.href.includes('youtube.com')) {
      const shorts = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer');
      if (shorts.length > 0) {
        container = shorts[0].parentElement;
        items = Array.from(shorts);
      }
    }

    if (!items.length || !container) {
      alert('⚡ NexDown: Role a página para carregar mais publicações antes de ordenar.');
      return;
    }

    // Salva ordem original se ainda não tiver
    items.forEach((item, index) => {
      if (!item.dataset.originalOrder) item.dataset.originalOrder = index;
      
      // Tenta achar texto de visualizações
      const text = item.innerText || '';
      const viewCount = parseMetricNumber(text);
      item.dataset.nexMetric = viewCount;
    });

    if (type === 'reset') {
      items.sort((a, b) => parseInt(a.dataset.originalOrder) - parseInt(b.dataset.originalOrder));
      items.forEach(item => container.appendChild(item));
      return;
    }

    // Ordena por métrica decrescente
    items.sort((a, b) => parseFloat(b.dataset.nexMetric || 0) - parseFloat(a.dataset.nexMetric || 0));

    // Calcula média para destacar Outliers (> 2.5x a média)
    const totalViews = items.reduce((acc, curr) => acc + parseFloat(curr.dataset.nexMetric || 0), 0);
    const avgViews = items.length > 0 ? totalViews / items.length : 0;

    items.forEach(item => {
      const views = parseFloat(item.dataset.nexMetric || 0);
      const isOutlier = views > (avgViews * 2.2) && views > 5000;

      // Adiciona badge de Outlier
      let badge = item.querySelector('.nexdown-outlier-tag');
      if (isOutlier && !badge) {
        badge = document.createElement('div');
        badge.className = 'nexdown-outlier-tag';
        badge.innerHTML = `🔥 VIRAL OUTLIER (${(views / 1000).toFixed(0)}k)`;
        item.style.position = 'relative';
        item.appendChild(badge);
      }

      container.appendChild(item);
    });
  }

  // Monitora vídeos e mídias
  function scanMedia() {
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      if (v.offsetWidth > 160 && v.offsetHeight > 160) {
        attachBadgeToVideo(v);
      }
    });

    injectFeedSorterBar();
  }

  // Modal in-page de IA
  function openInPageAIRepurposer(video) {
    const existing = document.querySelector('.nexdown-modal-backdrop');
    if (existing) existing.remove();

    const context = extractPostContext(video);

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
          <span style="font-size:12px; color:#64748B;">Origem: ${context.platform}</span>
          <div style="display:flex; gap:8px;">
            <button class="nexdown-btn" id="nexdown-copy-result" style="display:none;">📋 Copiar Tudo</button>
            <button class="nexdown-btn" id="nexdown-btn-close-action">Fechar</button>
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
              Para que a inteligência artificial recrie o roteiro e os ganchos sedutores, insira sua chave gratuita do <strong>Google Gemini</strong>, <strong>Groq</strong> ou <strong>OpenAI</strong>.
            </p>
            <button class="nexdown-btn nexdown-btn-ai" id="nexdown-open-opts-btn" style="padding: 6px 12px;">⚙️ Abrir Configurações do NexDown</button>
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

  const observer = new MutationObserver(() => scanMedia());
  observer.observe(document.body, { childList: true, subtree: true });

  scanMedia();
  window.addEventListener('scroll', scanMedia, { passive: true });
})();
