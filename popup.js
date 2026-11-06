// NexDown - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const mediaListContainer = document.getElementById('popup-media-list');
  const mediaCountEl = document.getElementById('media-count');
  const refreshBtn = document.getElementById('refresh-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const openSidepanelBtn = document.getElementById('open-sidepanel-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');

  let currentMedia = [];

  async function loadTabMedia() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({
      action: 'GET_TAB_MEDIA',
      tabId: tab.id
    }, (res) => {
      if (res && res.success) {
        currentMedia = res.media || [];
        mediaCountEl.innerText = currentMedia.length;
        renderList(currentMedia);
      }
    });
  }

  function renderList(media) {
    if (!media.length) {
      mediaListContainer.innerHTML = `
        <div class="nex-empty">
          Nenhuma mídia capturada ainda.<br>Dê play no vídeo para detectar.
        </div>
      `;
      return;
    }

    mediaListContainer.innerHTML = '';
    media.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'nex-item-card';

      const isVid = item.type === 'video';
      const isImg = item.type === 'image';
      const icon = isVid ? '🎬' : (isImg ? '🖼️' : '🎵');

      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; min-width:0;">
          <span>${icon}</span>
          <span class="nex-item-name" title="${item.url}">${item.url}</span>
        </div>
        <button class="nex-btn-download-mini" data-idx="${idx}">Baixar</button>
      `;

      card.querySelector('button').addEventListener('click', () => {
        const ext = isVid ? 'mp4' : (isImg ? 'jpg' : 'mp3');
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MEDIA',
          url: item.url,
          filename: `nexdown_${Date.now()}.${ext}`
        });
      });

      mediaListContainer.appendChild(card);
    });
  }

  downloadAllBtn.addEventListener('click', () => {
    if (!currentMedia.length) return;
    currentMedia.forEach((item, idx) => {
      const ext = item.type === 'video' ? 'mp4' : 'jpg';
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MEDIA',
        url: item.url,
        filename: `nexdown_${idx + 1}_${Date.now()}.${ext}`
      });
    });
  });

  openSidepanelBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  refreshBtn.addEventListener('click', loadTabMedia);

  loadTabMedia();
});
