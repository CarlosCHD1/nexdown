# ⚡ NexDown - SortFeed AI & Viral Repurposer Studio

> **Extensão Profissional para Google Chrome**: Baixe vídeos e imagens de qualquer rede social, identifique posts virais com radar de outliers (estilo SortFeed) e recrie novos roteiros e hooks sedutores com Inteligência Artificial.

---

## 🌟 O que o NexDown faz de diferente?

Enquanto ferramentas como o **Sortfeed** apenas ordenam feeds e baixam mídias brutas, o **NexDown** une **mineração de dados + download + estúdio criativo de copywriting com IA**:

1. **📥 Download Universal Instantâneo**:
   - Funciona em **Instagram (Reels e Posts)**, **TikTok**, **YouTube Shorts**, **X (Twitter)**, **Threads**, **LinkedIn** e **Facebook**.
   - Baixa vídeos em `.mp4` e fotos em alta resolução sem marca d'água.
   - Suporte a download individual ou **em lote (Bulk Download)**.

2. **🔥 Radar Viral & Ordenador de Feed (SortFeed)**:
   - Injeta uma barra de controle no topo dos perfis do Instagram, TikTok e YouTube.
   - **Ordenar por Mais Vistos**: veja os vídeos mais populares do criador sem precisar rolar a página manualmente.
   - **Detector de Outliers Virais**: destaca automaticamente com selo `🔥 VIRAL OUTLIER` os vídeos que tiveram desempenho 2.5x a 3x acima da média do perfil.

3. **🧠 Estúdio de Repurposing com IA (LLM)**:
   - **Extração da Ideia Central**: destrincha o gatilho psicológico e o mecanismo secreto que fez o conteúdo explodir.
   - **Fábrica de 5 Hooks Sedutores (0-3 segundos)**: cria ganchos com quebra de padrão, curiosidade extrema, dor oculta e autoridade.
   - **Roteiro Completo Pronto para Gravar (45s-60s)**: com marcações de cortes rápidos, punch-ins visuais e CTAs magnéticos.
   - **Adaptação Multiformato**: gera roteiro em vídeo, carrossel de 7 slides e post em texto para LinkedIn/X.

4. **📐 Chrome SidePanel Nativo**:
   - O estúdio roda no painel lateral do navegador, lado a lado com o feed que você estiver explorando.

---

## 🚀 Como Instalar no Google Chrome

A instalação leva menos de 1 minuto no modo desenvolvedor:

1. Abra o **Google Chrome** e digite na barra de endereços:
   ```text
   chrome://extensions
   ```
2. No canto superior direito, ative a chave **"Modo do desenvolvedor"** (Developer mode).
3. No canto superior esquerdo, clique no botão **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta do projeto:
   ```text
   C:\Users\Nexbrand\Documents\Projeto NexDown
   ```
5. Pronto! O ícone do **NexDown ⚡** aparecerá na barra de extensões do seu navegador. Fixe-o para acesso rápido!

---

## 🔑 Como Obter sua API Key Gratuita

O NexDown suporta os melhores modelos do mercado diretamente na sua máquina, sem mensalidades ou intermediários:

* **Google Gemini (Recomendado & 100% Gratuito)**:
  1. Acesse o [Google AI Studio](https://aistudio.google.com/app/apikey).
  2. Faça login com sua conta Google e clique em **"Create API Key"**.
  3. Cole a chave nas configurações do NexDown. O modelo `gemini-1.5-flash` ou `gemini-2.0-flash` oferece respostas ultra-rápidas e profundas com cota gratuita generosa.
* **Groq (Ultra-Rápido)**: [console.groq.com/keys](https://console.groq.com/keys) (Llama 3.3 70B gratuito).
* **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (GPT-4o / GPT-4o-mini).

---

## 🎯 Como Usar no Dia a Dia

### 1. Ao assistir qualquer Reel, TikTok ou Short:
* Passe o mouse sobre o vídeo: um botão flutuante **`⚡ NexDown`** aparecerá no canto superior.
* Clique em **`📥 Baixar`** para salvar o MP4 na hora.
* Clique em **`🧠 Recriar IA`** para abrir o modal direto na tela e receber a análise viral, os 5 hooks e o novo roteiro sem sair do vídeo.
* Clique em **`📐 Painel`** para abrir o SidePanel lateral.

### 2. Ao explorar o perfil de um concorrente ou referência:
* Ao entrar no perfil (ex: `instagram.com/usuario/reels` ou TikTok), a barra superior **`NexDown Radar (SortFeed AI)`** aparecerá.
* Clique em **`🔥 Mais Vistos`** ou **`💎 Outliers Virais`** para reorganizar os cards e minerar o ouro imediatamente.

---

## 📁 Estrutura do Código

```
Projeto NexDown/
├── manifest.json       # Configuração Manifest V3 com SidePanel e Sniffer
├── background.js      # Service Worker: downloads, interceptação e chamadas LLM
├── content.js         # Injeção no feed, SortFeed bar, outlier tags e botões
├── content.css        # Design moderno em Dark Mode e Glassmorphism
├── sidepanel.html     # Painel lateral completo com Estúdio de Criação
├── sidepanel.js       # Lógica do SidePanel, integração com LLMs e mídias
├── sidepanel.css      # Estilização do SidePanel
├── popup.html         # Menu rápido da barra de extensões
├── popup.js           # Ações rápidas de download e atalho para o SidePanel
├── popup.css          # Estilização do Popup
├── options.html       # Página de configurações de API e tom de voz
├── options.js         # Gerenciamento de chaves locais no chrome.storage
├── icons/             # Ícones em 16x16, 48x48, 128x128 e SVG
└── README.md          # Documentação do projeto
```
