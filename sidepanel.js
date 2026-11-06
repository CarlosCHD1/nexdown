// NexDown Studio - SidePanel Controller

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabs = document.querySelectorAll('.nex-tab');
  const panes = document.querySelectorAll('.nex-tab-pane');
  const platformName = document.getElementById('platform-name');
  const mediaCountSpan = document.getElementById('media-count');
  
  // Studio Inputs
  const postTitle = document.getElementById('post-title');
  const postCaption = document.getElementById('post-caption');
  const postTranscript = document.getElementById('post-transcript');
  const toneSelect = document.getElementById('tone-select');
  const formatSelect = document.getElementById('format-select');
  const generateAiBtn = document.getElementById('generate-ai-btn');
  const resultsCard = document.getElementById('results-card');
  const aiOutputBox = document.getElementById('ai-output-box');
  const copyResultBtn = document.getElementById('copy-result-btn');
  const refreshContextBtn = document.getElementById('refresh-context-btn');

  // Media Inputs
  const mediaListContainer = document.getElementById('media-list');
  const refreshMediaBtn = document.getElementById('refresh-media-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');

  // Settings Inputs
  const settingsProvider = document.getElementById('settings-provider');
  const settingsApiKey = document.getElementById('settings-apikey');
  const settingsModel = document.getElementById('settings-model');
  const settingsCustomPrompt = document.getElementById('settings-custom-prompt');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const apikeyHelpLink = document.getElementById('apikey-help-link');

  let currentTabMedia = [];
  let currentActiveTabId = null;
  let rawAiOutput = '';

  // 1. Tab Navigation
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 2. Load Settings
  async function loadSettings() {
    const res = await chrome.storage.local.get([
      'nexdown_provider',
      'nexdown_apikey',
      'nexdown_model',
      'nexdown_custom_prompt',
      'nexdown_tone',
      'nexdown_format'
    ]);

    if (res.nexdown_provider) settingsProvider.value = res.nexdown_provider;
    if (res.nexdown_apikey) settingsApiKey.value = res.nexdown_apikey;
    if (res.nexdown_custom_prompt) settingsCustomPrompt.value = res.nexdown_custom_prompt;
    if (res.nexdown_tone) toneSelect.value = res.nexdown_tone;
    if (res.nexdown_format) formatSelect.value = res.nexdown_format;

    updateModelOptions(res.nexdown_provider || 'gemini', res.nexdown_model);
  }

  function updateModelOptions(provider, selectedModel) {
    settingsModel.innerHTML = '';
    if (provider === 'gemini') {
      settingsModel.innerHTML = `
        <option value="gemini-1.5-flash">gemini-1.5-flash (Mais Rápido & Gratuito)</option>
        <option value="gemini-2.0-flash">gemini-2.0-flash (Nova Geração)</option>
        <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio Profundo)</option>
      `;
      apikeyHelpLink.innerHTML = `<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#A78BFA;">Obter chave gratuita no Google AI Studio ↗</a>`;
    } else if (provider === 'openai') {
      settingsModel.innerHTML = `
        <option value="gpt-4o-mini">gpt-4o-mini (Econômico e Ágil)</option>
        <option value="gpt-4o">gpt-4o (Mais Completo)</option>
      `;
      apikeyHelpLink.innerHTML = `<a href="https://platform.openai.com/api-keys" target="_blank" style="color:#A78BFA;">Obter chave na OpenAI ↗</a>`;
    } else if (provider === 'groq') {
      settingsModel.innerHTML = `
        <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Extremamente Rápido)</option>
        <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
      `;
      apikeyHelpLink.innerHTML = `<a href="https://console.groq.com/keys" target="_blank" style="color:#A78BFA;">Obter chave gratuita na Groq ↗</a>`;
    }

    if (selectedModel) settingsModel.value = selectedModel;
  }

  settingsProvider.addEventListener('change', () => {
    updateModelOptions(settingsProvider.value);
  });

  saveSettingsBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      nexdown_provider: settingsProvider.value,
      nexdown_apikey: settingsApiKey.value.trim(),
      nexdown_model: settingsModel.value,
      nexdown_custom_prompt: settingsCustomPrompt.value.trim(),
      nexdown_tone: toneSelect.value,
      nexdown_format: formatSelect.value
    });
    saveSettingsBtn.innerHTML = '<span>✅ Salvo com Sucesso!</span>';
    setTimeout(() => {
      saveSettingsBtn.innerHTML = '<span>💾 Salvar Configurações</span>';
    }, 2000);
  });

  // 3. Detect Active Tab Context & Media
  async function syncActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    currentActiveTabId = tab.id;

    // Detecta plataforma
    const url = tab.url || '';
    let platform = 'Web';
    if (url.includes('instagram.com')) platform = 'Instagram';
    else if (url.includes('tiktok.com')) platform = 'TikTok';
    else if (url.includes('youtube.com')) platform = 'YouTube';
    else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'X';
    else if (url.includes('threads.net')) platform = 'Threads';
    else if (url.includes('linkedin.com')) platform = 'LinkedIn';
    platformName.innerText = platform;

    // Busca mídias e contexto do background
    chrome.runtime.sendMessage({
      action: 'GET_TAB_MEDIA',
      tabId: currentActiveTabId
    }, (res) => {
      if (res && res.success) {
        currentTabMedia = res.media || [];
        mediaCountSpan.innerText = currentTabMedia.length;
        renderMediaList(currentTabMedia);

        if (res.context) {
          if (!postTitle.value) postTitle.value = res.context.title || '';
          if (!postCaption.value) postCaption.value = res.context.caption || '';
        }
      }
    });
  }

  // Renderiza mídias capturadas
  function renderMediaList(mediaList) {
    if (!mediaList || mediaList.length === 0) {
      mediaListContainer.innerHTML = `
        <div class="nex-empty-state">
          Nenhuma mídia capturada ainda nesta aba.<br>
          Navegue pelo feed, abra um Reel ou vídeo para capturar automaticamente.
        </div>
      `;
      return;
    }

    mediaListContainer.innerHTML = '';
    mediaList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'nex-media-card';

      const isVid = item.type === 'video';
      const isImg = item.type === 'image';

      card.innerHTML = `
        <div style="font-size: 24px; padding: 0 4px;">${isVid ? '🎬' : (isImg ? '🖼️' : '🎵')}</div>
        <div class="nex-media-info">
          <span class="nex-media-type">${item.type} (${item.mimeType.split('/')[1] || 'mp4'})</span>
          <span class="nex-media-url" title="${item.url}">${item.url}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <button class="nex-btn-xs nex-btn-gradient-mini" data-action="download" data-idx="${index}">📥 Baixar</button>
          <button class="nex-btn-xs" data-action="send-studio" data-idx="${index}">🧠 Estúdio</button>
        </div>
      `;

      // Download
      card.querySelector('[data-action="download"]').addEventListener('click', () => {
        const ext = isVid ? 'mp4' : (isImg ? 'jpg' : 'mp3');
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MEDIA',
          url: item.url,
          filename: `nexdown_${Date.now()}.${ext}`
        });
      });

      // Enviar pro estúdio
      card.querySelector('[data-action="send-studio"]').addEventListener('click', () => {
        postTitle.value = `${item.type.toUpperCase()} capturado da página`;
        tabs[0].click(); // Troca para a aba de Estúdio
      });

      mediaListContainer.appendChild(card);
    });
  }

  // Baixar todas em lote (Bulk Download)
  downloadAllBtn.addEventListener('click', () => {
    if (!currentTabMedia.length) {
      alert('Nenhuma mídia encontrada para baixar.');
      return;
    }
    currentTabMedia.forEach((item, idx) => {
      const ext = item.type === 'video' ? 'mp4' : 'jpg';
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MEDIA',
        url: item.url,
        filename: `nexdown_lote_${idx + 1}_${Date.now()}.${ext}`
      });
    });
  });

  refreshMediaBtn.addEventListener('click', syncActiveTab);
  refreshContextBtn.addEventListener('click', syncActiveTab);

  // 4. Geração com IA (Repurposer)
  generateAiBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get(['nexdown_provider', 'nexdown_apikey', 'nexdown_model', 'nexdown_custom_prompt']);
    const provider = stored.nexdown_provider || 'gemini';
    const apiKey = stored.nexdown_apikey || '';
    const model = stored.nexdown_model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
    const customPrompt = stored.nexdown_custom_prompt || '';

    if (!apiKey) {
      alert('🔑 Atenção: Configure sua Chave de API na aba "Configurações" antes de gerar!');
      tabs[2].click();
      return;
    }

    const context = {
      platform: platformName.innerText,
      title: postTitle.value.trim(),
      caption: postCaption.value.trim(),
      transcript: postTranscript.value.trim()
    };

    if (!context.title && !context.caption && !context.transcript) {
      alert('Por favor, informe ao menos o tema, legenda ou transcrição do vídeo!');
      return;
    }

    // Loading State
    generateAiBtn.disabled = true;
    generateAiBtn.innerHTML = `<span>⏳ Analisando e gerando roteiro...</span>`;
    resultsCard.style.display = 'block';
    aiOutputBox.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #94A3B8;">
        <div style="font-size: 24px; margin-bottom: 8px;">🧠</div>
        <strong>A IA está destrinchando o núcleo viral e criando os ganchos...</strong>
      </div>
    `;

    chrome.runtime.sendMessage({
      action: 'CALL_LLM_REPURPOSER',
      payload: {
        provider,
        apiKey,
        model,
        mediaContext: context,
        formatMode: formatSelect.value,
        toneMode: toneSelect.value,
        userPromptCustom: customPrompt
      }
    }, (res) => {
      generateAiBtn.disabled = false;
      generateAiBtn.innerHTML = `<span>⚡ Gerar Novo Roteiro Viral</span>`;

      if (!res || !res.success) {
        aiOutputBox.innerHTML = `
          <div style="padding: 12px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; color: #FCA5A5;">
            <strong>Erro na geração:</strong> ${res?.error || 'Não foi possível se comunicar com o modelo de IA.'}
          </div>
        `;
        return;
      }

      rawAiOutput = res.data;
      aiOutputBox.innerHTML = parseMarkdownToHtml(rawAiOutput);
    });
  });

  // Copiar tudo
  copyResultBtn.addEventListener('click', () => {
    if (!rawAiOutput) return;
    navigator.clipboard.writeText(rawAiOutput);
    copyResultBtn.innerText = '✅ Copiado!';
    setTimeout(() => { copyResultBtn.innerText = '📋 Copiar Tudo'; }, 2000);
  });

  // Helper Markdown
  function parseMarkdownToHtml(md) {
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px;">$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/\n\n/gim, '</p><p>')
      .replace(/\n/gim, '<br>');
    return `<p>${html}</p>`;
  }

  // Inicializa
  await loadSettings();
  await syncActiveTab();
});
