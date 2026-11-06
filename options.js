// NexDown - Options Page Script

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('opts-provider');
  const apiKeyInput = document.getElementById('opts-apikey');
  const modelSelect = document.getElementById('opts-model');
  const customPromptInput = document.getElementById('opts-custom-prompt');
  const saveBtn = document.getElementById('opts-save-btn');
  const helpLink = document.getElementById('opts-help-link');

  function updateModels(provider, currentModel) {
    modelSelect.innerHTML = '';
    if (provider === 'gemini') {
      modelSelect.innerHTML = `
        <option value="gemini-1.5-flash">gemini-1.5-flash (Mais Rápido & Gratuito)</option>
        <option value="gemini-2.0-flash">gemini-2.0-flash (Nova Geração)</option>
        <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio Profundo)</option>
      `;
      helpLink.innerHTML = `<a href="https://aistudio.google.com/app/apikey" target="_blank">Obter chave gratuita no Google AI Studio ↗</a>`;
    } else if (provider === 'openai') {
      modelSelect.innerHTML = `
        <option value="gpt-4o-mini">gpt-4o-mini (Econômico e Ágil)</option>
        <option value="gpt-4o">gpt-4o (Completo)</option>
      `;
      helpLink.innerHTML = `<a href="https://platform.openai.com/api-keys" target="_blank">Obter chave na OpenAI ↗</a>`;
    } else if (provider === 'groq') {
      modelSelect.innerHTML = `
        <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Resposta Imediata)</option>
        <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
      `;
      helpLink.innerHTML = `<a href="https://console.groq.com/keys" target="_blank">Obter chave gratuita na Groq ↗</a>`;
    }
    if (currentModel) modelSelect.value = currentModel;
  }

  const stored = await chrome.storage.local.get([
    'nexdown_provider',
    'nexdown_apikey',
    'nexdown_model',
    'nexdown_custom_prompt'
  ]);

  if (stored.nexdown_provider) providerSelect.value = stored.nexdown_provider;
  if (stored.nexdown_apikey) apiKeyInput.value = stored.nexdown_apikey;
  if (stored.nexdown_custom_prompt) customPromptInput.value = stored.nexdown_custom_prompt;

  updateModels(stored.nexdown_provider || 'gemini', stored.nexdown_model);

  providerSelect.addEventListener('change', () => {
    updateModels(providerSelect.value);
  });

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      nexdown_provider: providerSelect.value,
      nexdown_apikey: apiKeyInput.value.trim(),
      nexdown_model: modelSelect.value,
      nexdown_custom_prompt: customPromptInput.value.trim()
    });
    saveBtn.innerText = '✅ Configurações Salvas!';
    setTimeout(() => {
      saveBtn.innerText = 'Salvar Configurações';
    }, 2000);
  });
});
