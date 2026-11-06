// NexDown - Background Service Worker
// Gerencia tráfego de rede, downloads, SidePanel e chamadas às LLMs (Gemini, OpenAI, Groq).

const tabMediaStore = new Map();
const tabContextStore = new Map();

// Habilita abertura de SidePanel se suportado
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Limpeza de abas fechadas
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaStore.delete(tabId);
  tabContextStore.delete(tabId);
});

// Sniffer de tráfego de rede para detectar mídias
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { tabId, url, responseHeaders } = details;
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

    const isVideo = contentType.startsWith('video/') || /\.(mp4|webm|m4v)(\?|$)/i.test(url) || url.includes('googlevideo.com/videoplayback') || url.includes('fbcdn.net') && url.includes('.mp4');
    const isImage = contentType.startsWith('image/') && !contentType.includes('svg') && contentLength > 15000;
    const isAudio = contentType.startsWith('audio/') || /\.(mp3|m4a|wav|aac)(\?|$)/i.test(url);

    if (isVideo || isImage || isAudio) {
      if (!tabMediaStore.has(tabId)) tabMediaStore.set(tabId, []);
      const mediaList = tabMediaStore.get(tabId);

      if (!mediaList.some(m => m.url === url)) {
        mediaList.unshift({
          url,
          type: isVideo ? 'video' : (isAudio ? 'audio' : 'image'),
          mimeType: contentType || (isVideo ? 'video/mp4' : 'image/jpeg'),
          size: contentLength,
          timestamp: Date.now()
        });
        if (mediaList.length > 80) mediaList.pop();
      }
    }
  },
  { urls: ['<all_urls>'] },
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
      tabContextStore.set(tabId, message.context);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'REGISTER_DOM_MEDIA') {
    if (tabId) {
      if (!tabMediaStore.has(tabId)) tabMediaStore.set(tabId, []);
      const mediaList = tabMediaStore.get(tabId);
      const incoming = message.media || [];
      for (const item of incoming) {
        if (!mediaList.some(m => m.url === item.url)) {
          mediaList.unshift({
            ...item,
            timestamp: Date.now()
          });
        }
      }
      if (mediaList.length > 80) mediaList.length = 80;
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'DOWNLOAD_MEDIA') {
    handleDownload(message.url, message.filename)
      .then(downloadId => sendResponse({ success: true, downloadId }))
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

// Download helper
async function handleDownload(url, filename) {
  const safeFilename = filename 
    ? filename.replace(/[/\\?%*:|"<>]/g, '_') 
    : `nexdown_${Date.now()}.mp4`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: `NexDown/${safeFilename}`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(downloadId);
      }
    });
  });
}

// LLM Repurposer Engine
async function handleLLMRepurposer({ provider, apiKey, model, mediaContext, formatMode, toneMode, userPromptCustom }) {
  if (!apiKey) {
    throw new Error('Chave de API não informada. Configure sua API key nas configurações do NexDown.');
  }

  const systemInstruction = `Você é o estrategista de conteúdo e copywriter definitivo de criadores virais (como Alex Hormozi, MrBeast, Oney Araújo e os maiores canais de retenção do mundo).
Sua especialidade absoluta é:
1. Destrinchar o que faz um conteúdo viralizar (o núcleo da ideia, o gatilho psicológico e o mecanismo secreto).
2. Criar GANCHOS (Hooks) sedutores magnéticos com taxa de retenção absurda nos primeiros 3 segundos.
3. Escrever novos roteiros com ritmo hipnótico, storytelling fluido, linguagem natural, quebras de padrão (Punch-in / Jump Cut) e CTAs que convertem.

Formato solicitado pelo usuário: ${formatMode || 'completo'}
Tom de voz / Estilo: ${toneMode || 'Autoridade Descontraída & Direta'}

ESTRUTURA DA RESPOSTA (EM MARKDOWN ELEGANTE):

---
### 💡 1. DIAGNÓSTICO VIRAL & NÚCLEO DA IDEIA
- **Tese Central / Ideia de Ouro:** (A essência do que torna esse conteúdo irresistível em poucas palavras)
- **Gatilho Psicológico de Viralização:** (Ex: Curiosidade cega, Inveja produtiva, Prova irrefutável, Quebra de crença comum)
- **Por que bombou?** (Análise do motivo da retenção)

---
### 🎣 2. 5 GANCHOS SEDUTORES (HOOKS DE 0 A 3 SEGUNDOS)
Crie 5 variações com gatilhos diferentes:
1. **O Gancho Contrariano (Quebra de Padrão):**
2. **O Gancho de Curiosidade / Loop Aberto:**
3. **O Gancho de Dor Oculta / Alerta:**
4. **O Gancho de Autoridade / Resultado Chocante:**
5. **O Gancho Visual / Ação Rápida:**

---
### 📜 3. ROTEIRO COMPLETO PRONTO PARA GRAVAR (ESTRUTURA 45s-60s)
Dividido em compassos de fala com marcações de edição visual entre colchetes [ ]:
- **[0:00 - 0:03] O Gancho:** [Texto de fala] + [Ação visual / punch-in]
- **[0:03 - 0:08] Re-hook (Promessa do Vídeo):** [Texto de fala segurando a atenção]
- **[0:08 - 0:25] O Conflito / Erro Comum:** [Desenvolvimento dinâmico]
- **[0:25 - 0:45] A Solução / O Método:** [Passo a passo prático]
- **[0:45 - 0:55] Conclusão & CTA Sedutor:** [Chamada que incentiva salvar e compartilhar]

---
### 📱 4. VERSÃO BÔNUS (CARROSSEL + TEXTO X/LINKEDIN)
- **Carrossel (7 Slides resumidos)**
- **Legenda Magnética para o Instagram / TikTok** (Com gancho na primeira linha e hashtags estratégicas)`;

  const contentPrompt = `Analise as informações do vídeo/post selecionado:

- Plataforma / Origem: ${mediaContext.platform || 'Rede Social'}
- Título da Página / Post: ${mediaContext.title || 'Não informado'}
- Legenda / Descrição Original: ${mediaContext.caption || 'Sem legenda'}
- Métricas Identificadas (Views/Likes/Comments): ${mediaContext.metrics || 'Não informadas'}
- Transcrição / Áudio / Conteúdo Falado: ${mediaContext.transcript || 'Sem transcrição manual. Extraia e recrie toda a narrativa com base no contexto, legenda e temática.'}
${userPromptCustom ? `\nInstrução específica do criador: "${userPromptCustom}"` : ''}

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

// Gemini API
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

// OpenAI API
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

// Groq API
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
