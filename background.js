// NexDown - Background Service Worker
// Gerencia tráfego de rede, downloads de vídeos completos (não-corrompidos) e IA Repurposer.
// Ativo exclusivamente para: TikTok, Reels do Instagram e YouTube Shorts.

const tabMediaStore = new Map();
const tabContextStore = new Map();

// Habilita SidePanel se suportado
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Limpeza de abas fechadas
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaStore.delete(tabId);
  tabContextStore.delete(tabId);
});

// Remove parâmetros de fragmentação (bytestart, byteend) para baixar o arquivo COMPLETO
function sanitizeMediaUrl(rawUrl) {
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

// Sniffer focado estritamente em TikTok, Instagram e YouTube
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    let { tabId, url, responseHeaders } = details;
    if (tabId < 0) return;
    if (/(analytics|tracking|pixel|favicon|sprite|doubleclick|\.svg)/i.test(url)) return;

    let contentType = '';
    let contentLength = 0;

    if (responseHeaders) {
      for (const h of responseHeaders) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') contentType = (h.value || '').toLowerCase();
        if (name === 'content-length') contentLength = parseInt(h.value || '0', 10);
      }
    }

    // Identifica legendas (WebVTT/SRT) para NUNCA salvar como vídeo
    const isSubtitle = /\.(vtt|srt|webvtt)(\?|$)/i.test(url) || 
                       url.includes('caption') || 
                       url.includes('subtitle') || 
                       contentType.includes('vtt') || 
                       contentType.includes('subrip');

    // Se for legenda do TikTok ou YouTube, aproveita para auto-preencher a transcrição da IA
    if (isSubtitle && tabId) {
      fetch(url)
        .then(res => res.text())
        .then(text => {
          const cleanText = text.replace(/WEBVTT[\s\S]*?\n\n/g, '')
                                .replace(/\d{2}:\d{2}:\d{2}[\d\.\,>\-\s:]+/g, '')
                                .replace(/\n+/g, ' ')
                                .trim();
          if (cleanText.length > 10) {
            const ctx = tabContextStore.get(tabId) || {};
            ctx.transcript = cleanText;
            tabContextStore.set(tabId, ctx);
          }
        })
        .catch(() => {});
      return;
    }

    const isInstagram = url.includes('cdninstagram.com') || url.includes('fbcdn.net');
    const isTikTok = url.includes('tiktok.com') || url.includes('tiktokcdn.com');

    // Se for Instagram, remove cortes de fragmento
    if (isInstagram && (url.includes('.mp4') || contentType.includes('video'))) {
      url = sanitizeMediaUrl(url);
    }

    // Apenas vídeos legítimos das 3 redes
    const isRealVideo = !isSubtitle && (
      (isInstagram && (url.includes('.mp4') || contentType.includes('video'))) ||
      (isTikTok && (contentType.startsWith('video/') || url.includes('/video/tos/') || (url.includes('.mp4') && contentLength > 50000)))
    );

    if (isRealVideo) {
      if (!tabMediaStore.has(tabId)) tabMediaStore.set(tabId, []);
      const mediaList = tabMediaStore.get(tabId);

      const existingIdx = mediaList.findIndex(m => m.url === url);
      const mediaItem = {
        url,
        type: 'video',
        mimeType: contentType || 'video/mp4',
        size: contentLength,
        timestamp: Date.now()
      };

      if (existingIdx !== -1) {
        if (contentLength > mediaList[existingIdx].size) {
          mediaList[existingIdx] = mediaItem;
        }
      } else {
        mediaList.unshift(mediaItem);
        if (mediaList.length > 50) mediaList.pop();
      }
    }
  },
  { 
    urls: [
      '*://*.instagram.com/*',
      '*://*.cdninstagram.com/*',
      '*://*.fbcdn.net/*',
      '*://*.tiktok.com/*',
      '*://*.tiktokcdn.com/*',
      '*://*.youtube.com/*',
      '*://*.googlevideo.com/*'
    ] 
  },
  ['responseHeaders']
);

// Listener de mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  if (message.action === 'GET_TAB_MEDIA') {
    const list = tabMediaStore.get(tabId) || [];
    const context = tabContextStore.get(tabId) || null;
    sendResponse({ success: true, media: list, context });
    return true;
  }

  if (message.action === 'OPEN_SIDE_PANEL') {
    if (chrome.sidePanel && sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(console.error);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'SET_ACTIVE_POST_CONTEXT') {
    if (tabId) {
      const existing = tabContextStore.get(tabId) || {};
      tabContextStore.set(tabId, { ...existing, ...message.context });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'DOWNLOAD_MEDIA') {
    executeDownload(message.url, message.filename)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'SMART_DOWNLOAD_ACTIVE_VIDEO') {
    handleSmartDownload(tabId, message)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'CALL_LLM_REPURPOSER') {
    handleLLMRepurposer(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Download Inteligente
async function handleSmartDownload(tabId, { directSrc, pageUrl, platform, filename }) {
  if (directSrc && !directSrc.startsWith('blob:') && directSrc.startsWith('http')) {
    if (!directSrc.includes('.vtt') && !directSrc.includes('caption')) {
      const cleanUrl = sanitizeMediaUrl(directSrc);
      const safeName = filename || `nexdown_${platform.toLowerCase()}_${Date.now()}.mp4`;
      return await executeDownload(cleanUrl, safeName);
    }
  }

  const list = tabMediaStore.get(tabId) || [];
  const validVideos = list
    .filter(m => m.type === 'video' && !m.url.includes('.vtt') && !m.url.includes('caption'))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  if (validVideos.length > 0) {
    const bestUrl = sanitizeMediaUrl(validVideos[0].url);
    const safeName = filename || `nexdown_${platform.toLowerCase()}_${Date.now()}.mp4`;
    return await executeDownload(bestUrl, safeName);
  }

  throw new Error('Nenhum vídeo completo foi capturado. Deixe o vídeo tocar por 2 segundos e tente novamente.');
}

// Dispara o download nativo no Chrome
async function executeDownload(url, filename) {
  const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: `NexDown/${safeFilename}`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve({ downloadId, filename: safeFilename });
      }
    });
  });
}

// Motor de IA Repurposer
async function handleLLMRepurposer({ provider, apiKey, model, mediaContext, formatMode, toneMode, userPromptCustom }) {
  if (!apiKey) {
    throw new Error('Chave de API não informada. Configure sua API key nas configurações do NexDown.');
  }

  const systemInstruction = `Você é o estrategista de conteúdo e copywriter definitivo de criadores virais (como Alex Hormozi, MrBeast, Oney Araújo e mestres de retenção).
Sua missão:
1. Destrinchar a ideia central e o gatilho psicológico de retenção do conteúdo fornecido.
2. Criar 5 GANCHOS (Hooks) magnéticos e sedutores para os primeiros 3 segundos.
3. Escrever um novo roteiro completo (45s a 60s) com indicações de fala, punch-ins visuais e CTAs persuasivos.

Formato solicitado: ${formatMode || 'completo'}
Tom de voz: ${toneMode || 'Autoridade Descontraída & Direta'}

ESTRUTURA DA RESPOSTA (MARKDOWN ELEGANTE):

---
### 💡 1. NÚCLEO VIRAL & DIAGNÓSTICO
- **Ideia Central / Tese Principal:** (Em 1 ou 2 frases magnéticas)
- **Gatilho de Retenção:** (Por que as pessoas não conseguem parar de assistir?)
- **O Ângulo Oculto:** (O detalhe que transforma esse tema em viral)

---
### 🎣 2. 5 GANCHOS SEDUTORES (0 A 3 SEGUNDOS)
1. **O Gancho Contrariano / Quebra de Crença:**
2. **O Gancho de Curiosidade / Loop Aberto:**
3. **O Gancho de Dor Oculta / Alerta Imediato:**
4. **O Gancho de Autoridade / Prova Irrefutável:**
5. **O Gancho Visual / Ação Rápida:**

---
### 📜 3. ROTEIRO COMPLETO PRONTO PARA GRAVAR (45s - 60s)
- **[0:00 - 0:03] Gancho:** [Texto de fala] + [Ação visual / corte]
- **[0:03 - 0:08] Re-hook (Promessa):** [Texto de fala segurando a atenção]
- **[0:08 - 0:25] O Conflito / Erro Comum:** [Desenvolvimento ágil]
- **[0:25 - 0:45] O Método / Solução Prática:** [Passo a passo ou revelação]
- **[0:45 - 0:55] Conclusão & CTA Sedutor:** [Chamada que estimula comentários e compartilhamentos]

---
### 📱 4. ADAPTAÇÕES BÔNUS
- **Estrutura Carrossel (7 Slides)**
- **Legenda Magnética para o Post**`;

  const contentPrompt = `Analise as informações do vídeo selecionado:

- Plataforma: ${mediaContext.platform || 'Rede Social'}
- Título: ${mediaContext.title || 'Não informado'}
- Legenda Original: ${mediaContext.caption || 'Sem legenda'}
- Métricas: ${mediaContext.metrics || 'Não informadas'}
- Transcrição / Notas: ${mediaContext.transcript || 'Sem transcrição manual. Extraia a temática central e recrie o conteúdo perfeito.'}
${userPromptCustom ? `\nInstrução do criador: "${userPromptCustom}"` : ''}

Gere o diagnóstico, os 5 hooks sedutores e o roteiro viral completo.`;

  if (provider === 'gemini') {
    return await callGeminiAPI(apiKey, model || 'gemini-1.5-flash', systemInstruction, contentPrompt);
  } else if (provider === 'openai') {
    return await callOpenAI(apiKey, model || 'gpt-4o-mini', systemInstruction, contentPrompt);
  } else if (provider === 'groq') {
    return await callGroq(apiKey, model || 'llama-3.3-70b-versatile', systemInstruction, contentPrompt);
  } else {
    throw new Error(`Provedor desconhecido: ${provider}`);
  }
}

async function callGeminiAPI(apiKey, model, systemInstruction, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2800 }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro Gemini: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Nenhum resultado gerado pelo Gemini.';
}

async function callOpenAI(apiKey, model, systemInstruction, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro OpenAI: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Nenhum resultado gerado pela OpenAI.';
}

async function callGroq(apiKey, model, systemInstruction, prompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro Groq: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Nenhum resultado gerado pela Groq.';
}
