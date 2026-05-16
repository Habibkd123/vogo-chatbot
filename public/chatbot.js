// public/chatbot.js - COMPLETE VOGO CHATBOT
// Fixed issues:
// - Language selector buttons in header (EN/RO/IT/FR/DE)
// - Product "Open" button: same page (window.location.href, no _blank)
// - Shopping list: numbered list + checkbox + markDone
// - Agenda: numbered list + checkbox + markDone
// - Product cards: no category/label line
// - All original features preserved
// - FIX: parseDone corrects !!("0")=true bug — API returns done_checked as string "0"/"1"
// - FIX: showShoppingListItems/showAgendaItems now trust API done state, clear stale localStorage
// - FIX: unmark handler clears localStorage by database ID (not fuzzy name match)
// - FIX Bug 1: Links open in same tab (window.location.href, target="_self")
// - FIX Bug 4: Bot name is VOGO (not Kodee)
// - FIX: Language selector added to header and called in init()
// - FIX: markDoneUrl uses absolute server URL (not relative /api/mark-done which breaks on WordPress)
// - FIX: Pending intent follow-up — after bot asks "Which event?", next reply is treated as event name

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    proxyUrl: '/api/chatbot',
    nlpUrl: '/api/chatbot-nlp',
    markDoneUrl: '/api/mark-done',   // absolute path — works when served from same origin
    botName: 'VOGO',
    iconPath: '/images/vogo-icon.png',
    defaultLanguage: 'en',
    baseWebsiteUrl: 'https://vogo.family'
  };

  // Translations
  const TRANSLATIONS = {
    en: {
      greeting: 'Hello',
      subGreeting: 'How can I help you today?',
      inputPlaceholder: 'Ask VOGO anything...',
      send: 'Send',
      errorMessage: 'Sorry, something went wrong. Please try again.',
      thinking: 'Thinking...',
      noResults: 'No results found.',
      demoMode: '(Demo mode)'
    },
    ro: {
      greeting: 'Buna',
      subGreeting: 'Cum va pot ajuta astazi?',
      inputPlaceholder: 'Intreaba-l pe VOGO orice...',
      send: 'Trimite',
      errorMessage: 'Ne pare rau, ceva nu a mers bine. Va rugam incercati din nou.',
      thinking: 'Gandesc...',
      noResults: 'Nu s-au gasit rezultate.',
      demoMode: '(Mod demo)'
    },
    it: {
      greeting: 'Ciao',
      subGreeting: 'Come posso aiutarti oggi?',
      inputPlaceholder: 'Chiedi a VOGO qualsiasi cosa...',
      send: 'Invia',
      errorMessage: 'Spiacenti, qualcosa e andato storto. Riprova.',
      thinking: 'Pensando...',
      noResults: 'Nessun risultato trovato.',
      demoMode: '(Modalita demo)'
    },
    fr: {
      greeting: 'Bonjour',
      subGreeting: 'Comment puis-je vous aider?',
      inputPlaceholder: 'Demandez a VOGO...',
      send: 'Envoyer',
      errorMessage: 'Desole, quelque chose s\'est mal passe. Veuillez reessayer.',
      thinking: 'Reflechir...',
      noResults: 'Aucun resultat trouve.',
      demoMode: '(Mode demo)'
    },
    de: {
      greeting: 'Hallo',
      subGreeting: 'Wie kann ich Ihnen heute helfen?',
      inputPlaceholder: 'Fragen Sie VOGO etwas...',
      send: 'Senden',
      errorMessage: 'Entschuldigung, etwas ist schief gelaufen. Bitte versuchen Sie es erneut.',
      thinking: 'Denken...',
      noResults: 'Keine Ergebnisse gefunden.',
      demoMode: '(Demo-Modus)'
    },
    es: {
      greeting: 'Hola',
      subGreeting: 'Como puedo ayudarte hoy?',
      inputPlaceholder: 'Pregunta a VOGO cualquier cosa...',
      send: 'Enviar',
      errorMessage: 'Lo siento, algo salio mal. Por favor, intentalo de nuevo.',
      thinking: 'Pensando...',
      noResults: 'No se encontraron resultados.',
      demoMode: '(Modo demo)'
    }
  };

  // ============================================================================
  // PREDEFINED QUESTION TRANSLATIONS
  // Vogo API only stores questions in Romanian. We translate them client-side.
  // Key: Romanian text (lowercase, trimmed) → translations per language
  // ============================================================================
  const QUESTION_TRANSLATIONS = {
    'vreau recomandari generale pentru hrana': {
      en: 'I want general food recommendations',
      ro: 'Vreau recomandari generale pentru hrana',
      it: 'Voglio consigli generali sul cibo',
      fr: 'Je veux des recommandations generales sur la nourriture',
      de: 'Ich möchte allgemeine Essensempfehlungen'
    },
    'vreau magazine premium in zona': {
      en: 'I want premium stores nearby',
      ro: 'Vreau magazine premium in zona',
      it: 'Voglio negozi premium nella zona',
      fr: 'Je veux des magasins premium a proximite',
      de: 'Ich möchte Premium-Geschäfte in der Nähe'
    },
    'asistenta vip personalizata': {
      en: 'Personalized VIP assistance',
      ro: 'Asistenta VIP personalizata',
      it: 'Assistenza VIP personalizzata',
      fr: 'Assistance VIP personnalisee',
      de: 'Personalisierte VIP-Assistenz'
    },
    'cauta produse': {
      en: 'Search products',
      ro: 'Cauta produse',
      it: 'Cerca prodotti',
      fr: 'Rechercher des produits',
      de: 'Produkte suchen'
    },
    'lista de cumparaturi': {
      en: 'Shopping list',
      ro: 'Lista de cumparaturi',
      it: 'Lista della spesa',
      fr: 'Liste de courses',
      de: 'Einkaufsliste'
    },
    'agenda / calendar': {
      en: 'Agenda / Calendar',
      ro: 'Agenda / Calendar',
      it: 'Agenda / Calendario',
      fr: 'Agenda / Calendrier',
      de: 'Agenda / Kalender'
    },
    'conectare cont': {
      en: 'Account login',
      ro: 'Conectare cont',
      it: 'Accesso account',
      fr: 'Connexion au compte',
      de: 'Konto anmelden'
    },
    'asistenta': {
      en: 'Assistance',
      ro: 'Asistenta',
      it: 'Assistenza',
      fr: 'Assistance',
      de: 'Hilfe'
    }
  };

  // Translate a question text to the target language
  // Falls back to original Romanian text if no translation found
  function translateQuestion(text, lang) {
    if (!text || lang === 'ro') return text;
    const key = text.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics for matching
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const match = QUESTION_TRANSLATIONS[key];
    if (match) return match[lang] || match['en'] || text;
    // Fuzzy: try partial key match
    for (const [roKey, translations] of Object.entries(QUESTION_TRANSLATIONS)) {
      if (key.includes(roKey) || roKey.includes(key)) {
        return translations[lang] || translations['en'] || text;
      }
    }
    return text; // unchanged if no translation
  }


  // ============================================================================
  // parseDone: API returns done_checked as STRING "0" or "1", NOT boolean.
  // !!("0") = true in JS because "0" is a non-empty string — must compare explicitly.
  // ============================================================================
  const parseDone = v => v === 1 || v === true || v === '1' || v === 'true';

  // Main Chatbot Class
  class VogoChatbot {
    constructor() {
      this.currentLanguage = CONFIG.defaultLanguage;
      this.conversationStack = [];
      this.isOpen = false;
      this.userToken = null;          // JWT token after login
      this.awaitingPassword = false;  // true when input should be type=password
      // Live chat state (Phase C: Human Operator)
      this.liveChatActive = false;
      this.liveChatThreadId = null;
      this.liveChatPollTimer = null;
      this.liveChatLastMessageId = 0;
      this.liveChatEndBtn = null;
      this.liveChatSupportUserId = null; // agent's user_id (matches post_author on agent msgs)
      this.liveChatSelfUserId = null;    // current user's user_id in forum thread
      // ── Voice AI Integration ──────────────────────────────────────────────
      this.voiceRecording = false;    // true while mic is capturing audio
      this.mediaRecorder = null;      // MediaRecorder instance
      this.audioChunks = [];          // collected audio data
      this.voiceEnabled = true;       // TTS speak-back toggle (internal)
      this.voiceSpeakEnabled = localStorage.getItem('vogo_voice_reply') !== 'off'; // user toggle
      this.currentAudio = null;       // HTMLAudioElement for TTS playback
      // ── Race Condition Guard ──────────────────────────────────────────────
      this.isProcessing = false;      // true while waiting for server response
      this.messageQueue = [];         // queue for messages sent during processing
      this.init();
    }

    init() {
      this.injectCSS();
      this.injectHTML();
      this.cacheElements();
      this.setupEventListeners();
      this.setupLanguageSelector();
      this._updateVoiceToggleBtn();  // set initial icon state
      this.showGreeting();
      this.loadInitialQuestions();
      // Attach button: always enabled (image upload works in both normal and live chat)
      if (this.attachBtn) {
        this.attachBtn.disabled = false;
        this.attachBtn.title = 'Attach image';
        this.attachBtn.style.opacity = '1';
        this.attachBtn.style.cursor = 'pointer';
      }
    }

    injectCSS() {
      if (!document.querySelector('link[href="chatbot.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'chatbot.css';
        document.head.appendChild(link);
      }
    }

    injectHTML() {
      const html = `
        <div id="vogo-chat-bubble">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.68-.33-3.83-.91l-.27-.15-2.98.51.51-2.98-.15-.27C4.33 14.68 4 13.38 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
        </div>

        <div id="vogo-chat-window" class="hidden">
          <div class="vogo-chat-header">
            <div class="vogo-header-content">
              <img src="${CONFIG.iconPath}" alt="VOGO" class="vogo-header-icon" onerror="this.style.display='none'" />
              <div class="vogo-header-title">
                <h3>${CONFIG.botName}</h3>
                <div class="vogo-status">Online</div>
              </div>
            </div>
            <div class="vogo-header-actions">
              <div id="vogo-language-selector" style="display:flex;gap:3px;align-items:center;margin-right:8px;"></div>
              <button id="vogo-voice-toggle" class="vogo-voice-toggle-btn" title="Toggle voice reply">&#128263;</button>
              <button class="close-btn" id="vogo-close-btn">&#x2715;</button>
            </div>
          </div>

          <div class="vogo-chat-messages" id="vogo-messages"></div>

          <div class="vogo-chat-input">
            <input type="file" id="vogo-image-input" accept="image/*" style="display:none" />
            <button id="vogo-attach" title="Attach image">&#128206;</button>
            <input type="text" id="vogo-input" placeholder="${this.t('inputPlaceholder')}" />
            <button id="vogo-mic" title="Voice input" class="vogo-mic-btn">&#127908;</button>
            <button id="vogo-send">${this.t('send')}</button>
          </div>
          <div style="background:#f7f7f8; border-top:1px solid #e5e7eb; padding:6px 15px; border-radius:0 0 16px 16px; display:flex; justify-content:center;">
            <select id="vogo-ai-model-select" style="font-size:12px; padding:4px 8px; border-radius:6px; border:1px solid #d1d5db; background:white; color:#374151; outline:none; cursor:pointer;">
              <option value="">🔮 Auto (Default AI)</option>
              <option value="ai_groq">⚡ Groq (Llama 3)</option>
              <option value="ai_openai">🧠 OpenAI (ChatGPT)</option>
              <option value="ai_gemini">💎 Google (Gemini)</option>
              <option value="ai_claude">🎭 Anthropic (Claude)</option>
              <option value="ai_ollama">🦙 Ollama (Local)</option>
            </select>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);
    }

    cacheElements() {
      this.bubble = document.getElementById('vogo-chat-bubble');
      this.window = document.getElementById('vogo-chat-window');
      this.messagesContainer = document.getElementById('vogo-messages');
      this.input = document.getElementById('vogo-input');
      this.sendBtn = document.getElementById('vogo-send');
      this.closeBtn = document.getElementById('vogo-close-btn');
      this.attachBtn = document.getElementById('vogo-attach');
      this.imageInput = document.getElementById('vogo-image-input');
      this.micBtn = document.getElementById('vogo-mic');          // Voice mic button
      this.voiceToggleBtn = document.getElementById('vogo-voice-toggle'); // TTS toggle
      this.aiSelect = document.getElementById('vogo-ai-model-select');
    }

    setupEventListeners() {
      this.bubble.addEventListener('click', () => this.toggleChat());
      this.closeBtn.addEventListener('click', () => this.closeChat());
      this.sendBtn.addEventListener('click', () => this.sendMessage());
      this.attachBtn.addEventListener('click', () => this.imageInput.click());
      this.imageInput.addEventListener('change', (e) => this.handleImageSelect(e));
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
      // Voice mic button
      if (this.micBtn) {
        this.micBtn.addEventListener('click', () => this.toggleVoiceRecording());
      }
      // Voice reply toggle button
      if (this.voiceToggleBtn) {
        this.voiceToggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.voiceSpeakEnabled = !this.voiceSpeakEnabled;
          localStorage.setItem('vogo_voice_reply', this.voiceSpeakEnabled ? 'on' : 'off');
          this._updateVoiceToggleBtn();
        });
      }
    }

    setupLanguageSelector() {
      const selector = document.getElementById('vogo-language-selector');
      if (!selector) return;

      const languages = [
        { code: 'auto', label: 'Auto' },
        { code: 'en', label: 'EN' },
        { code: 'ro', label: 'RO' },
        { code: 'it', label: 'IT' },
        { code: 'fr', label: 'FR' },
        { code: 'de', label: 'DE' }
      ];

      const select = document.createElement('select');
      select.id = 'vogo-lang-dropdown';
      select.style.cssText = `
        background: rgba(255,255,255,0.15);
        color: white;
        border: 1px solid rgba(255,255,255,0.4);
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
      `;

      languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.label;
        option.style.color = '#333';
        if (lang.code === this.currentLanguage) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener('change', (e) => {
        this.changeLanguage(e.target.value);
      });

      selector.appendChild(select);

      // Default to auto detection initially
      if (this.currentLanguage === 'auto' || !this.currentLanguage) {
         select.value = 'auto';
         this.changeLanguage('auto');
      }
    }

    changeLanguage(lang) {
      const prevLang = this.currentLanguage;
      if (lang === 'auto') {
        const browserLang = navigator.language ? navigator.language.substring(0, 2).toLowerCase() : 'en';
        const supported = ['en', 'ro', 'it', 'fr', 'de'];
        this.currentLanguage = supported.includes(browserLang) ? browserLang : 'en';
      } else {
        this.currentLanguage = lang;
      }

      const select = document.getElementById('vogo-lang-dropdown');
      if (select && select.value !== lang && lang !== 'auto') {
        select.value = lang;
      }

      // Update input placeholder and send button
      if (this.input) this.input.placeholder = this.t('inputPlaceholder');
      if (this.sendBtn) this.sendBtn.textContent = this.t('send');

      // Update greeting in-place (no re-render)
      const greetingEl = document.getElementById('vogo-greeting-text');
      if (greetingEl) {
        greetingEl.innerHTML = '<strong>' + this.t('greeting') + '</strong><br>' + this.t('subGreeting');
      }

      console.log('Language changed to:', this.currentLanguage, '(selected:', lang, ')');

      // Reload predefined questions only when user explicitly picks a language
      // (skip on 'auto' initial call to avoid double-load with loadInitialQuestions)
      if (lang !== 'auto' && this.currentLanguage !== prevLang) {
        this._reloadPredefinedQuestions();
      } else if (lang !== 'auto') {
        // Same language re-selected — still reload in case questions cleared
        this._reloadPredefinedQuestions();
      }
    }

    async _reloadPredefinedQuestions() {
      // Only reload if at root level (no active sub-navigation)
      if (this._inSubNav) return;
      try {
        const response = await this.callAPI('getPredefinedQA', { parent_id: null, lang: this.currentLanguage });
        if (response.data && response.data.length > 0) {
          this.showPredefinedQuestions(response.data);
        }
      } catch (e) {
        console.warn('Could not reload questions for lang:', this.currentLanguage);
      }
    }

    t(key) {
      return (TRANSLATIONS[this.currentLanguage] || TRANSLATIONS.en)[key] || key;
    }

    toggleChat() {
      this.isOpen ? this.closeChat() : this.openChat();
    }

    openChat() {
      this.window.classList.remove('hidden');
      if (this.bubble) this.bubble.style.display = 'none'; // Hide bubble when chat opens
      this.isOpen = true;
      this.input.focus();
    }

    closeChat() {
      this.window.classList.add('hidden');
      if (this.bubble) this.bubble.style.display = 'flex'; // Show bubble when chat closes
      this.isOpen = false;
    }

    showGreeting() {
      const container = document.createElement('div');
      container.className = 'vogo-bot-message-container';
      container.id = 'vogo-greeting-container';

      const icon = document.createElement('img');
      icon.src = CONFIG.iconPath;
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      container.appendChild(icon);

      const greeting = document.createElement('div');
      greeting.className = 'vogo-bot-message';
      greeting.id = 'vogo-greeting-text';
      greeting.innerHTML = '<strong>' + this.t('greeting') + '</strong><br>' + this.t('subGreeting');
      container.appendChild(greeting);

      this.messagesContainer.appendChild(container);
    }

    addUserMessage(text) {
      const message = document.createElement('div');
      message.className = 'vogo-user-message';
      message.textContent = text;
      this.messagesContainer.appendChild(message);
      this.scrollToBottom();
    }

    parseMarkdown(text) {
      if (!text) return '';
      // Escape HTML to prevent XSS
      let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      html = html
        // Explicit Videos: !video[alt](url) -> rendered as video element with controls
        .replace(/!video\[(.*?)\]\((.*?)\)/gi, '<video src="$2" title="$1" controls style="max-width:100%; border-radius:8px; margin: 8px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></video>')
        // Auto-detect Videos (from standard image tag if URL ends in video format)
        .replace(/!\[(.*?)\]\([^)]*?(mp4|webm|ogg)\)/gi, (match, p1, p2, offset, str) => {
          let urlPattern = /!\[.*?\]\((.*?)\)/gi;
          let matchUrl = urlPattern.exec(match);
          return `<video src="${matchUrl[1]}" title="${p1}" controls autoplay muted loop style="max-width:100%; border-radius:8px; margin: 8px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></video>`;
        })
        // Images: ![alt](url) -> rendered as responsive images
        .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:8px; margin: 8px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>')
        // Links: [text](url) -> rendered as clickable links
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline;">$1</a>')
        // Bold: **text**
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic: *text* or _text_
        .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
        // Code Blocks: ```code```
        .replace(/```([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px; overflow-x: auto; margin: 8px 0;"><code style="font-family: monospace; font-size: 13px;">$1</code></pre>')
        // Inline Code: `code`
        .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.15); padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 13px;">$1</code>')
        // Headers: ### Header
        .replace(/^### (.*$)/gim, '<h3 style="margin: 8px 0 4px 0; font-size: 1.1em;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="margin: 10px 0 6px 0; font-size: 1.25em;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="margin: 12px 0 8px 0; font-size: 1.5em;">$1</h1>')
        // Lists: - item or * item
        .replace(/^\s*[-*+]\s+(.*)$/gim, '<li style="margin-left: 15px;">$1</li>')
        // Line breaks
        .replace(/\n/g, '<br>');

      // Wrap consecutive <li> tags in <ul>
      html = html.replace(/(<li.*?>.*?<\/li>(<br>)*)+/g, match => `<ul style="margin: 4px 0; padding-left: 10px;">${match.replace(/(<br>)+/g, '')}</ul>`);

      return html;
    }

    addBotMessage(text) {
      const container = document.createElement('div');
      container.className = 'vogo-bot-message-container';

      const icon = document.createElement('img');
      icon.src = CONFIG.iconPath;
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      container.appendChild(icon);

      const message = document.createElement('div');
      message.className = 'vogo-bot-message';
      
      // Parse markdown to enable rich media (links, images, bold, lists)
      message.innerHTML = this.parseMarkdown(text);
      
      container.appendChild(message);

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();

      // Auto-speak if voice reply is enabled (Strip markdown for TTS)
      if (this.voiceSpeakEnabled) {
        // Strip markdown characters before sending to TTS
        const cleanText = text.replace(/[*_#`]|\[.*?\]\(.*?\)|!\[.*?\]\(.*?\)/g, '');
        this.speakText(cleanText.trim());
      }
    }

    addBotMessageHTML(html) {
      const container = document.createElement('div');
      container.className = 'vogo-bot-message-container';

      const icon = document.createElement('img');
      icon.src = CONFIG.iconPath;
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      container.appendChild(icon);

      const message = document.createElement('div');
      message.className = 'vogo-bot-message';
      message.innerHTML = html;
      container.appendChild(message);

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    showTypingIndicator() {
      const container = document.createElement('div');
      container.className = 'vogo-typing-indicator-container';
      container.id = 'vogo-typing';

      const icon = document.createElement('img');
      icon.src = CONFIG.iconPath;
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      container.appendChild(icon);

      const typing = document.createElement('div');
      typing.className = 'vogo-typing-indicator';
      typing.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typing);

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    hideTypingIndicator() {
      const typing = document.getElementById('vogo-typing');
      if (typing) typing.remove();
    }

    showPredefinedQuestions(questions) {
      const CONTAINER_ID = 'vogo-predefined-root';
      const lang = this.currentLanguage || 'en';

      // Find existing container and REPLACE it (never append duplicate)
      let container = document.getElementById(CONTAINER_ID);
      if (container) {
        container.innerHTML = ''; // clear old buttons
      } else {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.className = 'vogo-predefined-questions';
        this.messagesContainer.appendChild(container);
      }

      questions.forEach(q => {
        const displayText = translateQuestion(q.text, lang);
        const btn = document.createElement('button');
        btn.className = 'vogo-question-btn';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
          <span>${displayText}</span>
        `;
        // Pass original question object so API still gets correct ID
        btn.addEventListener('click', () => this.handleQuestionClick(q));
        container.appendChild(btn);
      });

      this.scrollToBottom();
    }

    // =========================================================================
    // PRODUCT SEARCH RESULTS
    // FIX: "Open" button uses window.location.href (same tab, chatbot stays open)
    // FIX: No "product" type/category label line shown
    // =========================================================================
    showSearchResults(results) {
      if (!results || results.length === 0) {
        this.addBotMessage(this.t('noResults'));
        return;
      }

      const container = document.createElement('div');
      container.className = 'vogo-product-results';

      results.forEach(item => {
        const name = item.title || item.product_name || item.name || item.item_name || 'Product';
        const link = item.link || item.url || item.permalink || '';

        const card = document.createElement('div');
        card.className = 'vogo-product-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'vogo-product-name';
        nameEl.textContent = name;

        const btnRow = document.createElement('div');
        btnRow.className = 'vogo-product-btns';

        const addBtn = document.createElement('button');
        addBtn.className = 'vogo-product-btn vogo-product-btn--add';
        addBtn.textContent = 'Add to List';
        addBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          addBtn.disabled = true;
          addBtn.textContent = 'Adding...';
          try {
            await fetch(CONFIG.nlpUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: 'add ' + name + ' to my shopping list',
                language: this.currentLanguage
              })
            });
            addBtn.textContent = 'Added!';
            addBtn.style.background = '#28a745';
          } catch (_) {
            addBtn.textContent = 'Error';
            addBtn.style.background = '#dc3545';
          }
          setTimeout(() => {
            addBtn.textContent = 'Add to List';
            addBtn.style.background = '';
            addBtn.disabled = false;
          }, 2000);
        });

        const openBtn = document.createElement('button');
        openBtn.className = 'vogo-product-btn vogo-product-btn--open';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fullUrl = this.buildFullUrl(link);
          if (fullUrl) window.location.href = fullUrl;
        });

        btnRow.appendChild(addBtn);
        if (link) btnRow.appendChild(openBtn);

        card.appendChild(nameEl);
        card.appendChild(btnRow);
        container.appendChild(card);
      });

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    // =========================================================================
    // LIVE CHAT - Human Operator (Phase C)
    // Real-time chat via forum API with polling
    // =========================================================================
    startLiveChat(action) {
      this.liveChatActive = true;
      this.liveChatThreadId = action.threadId;
      this.liveChatLastMessageId = 0;
      this.liveChatSupportUserId = action.supportUserId ? String(action.supportUserId) : null;
      
      // Restore self user ID from localStorage if available (persists across restarts)
      const storedSelfId = localStorage.getItem('vogo_live_chat_self_user_id_' + action.threadId);
      this.liveChatSelfUserId = storedSelfId || null;

      // Enable attach button (image upload only allowed in live chat)
      if (this.attachBtn) {
        this.attachBtn.disabled = false;
        this.attachBtn.title = 'Attach image (only visible to operator)';
        this.attachBtn.style.opacity = '1';
        this.attachBtn.style.cursor = 'pointer';
      }

      // Show connected banner
      const banner = document.createElement('div');
      banner.className = 'vogo-live-chat-banner';
      const agentLabel = action.supportUserName ? ' Agent: ' + action.supportUserName : '';
      banner.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' +
        '<span>' + (action.message || 'Connected with support agent') + agentLabel + '</span>';
      this.messagesContainer.appendChild(banner);

      // Show end chat button
      const endBtn = document.createElement('button');
      endBtn.className = 'vogo-live-chat-end-btn';
      endBtn.textContent = 'End Live Chat';
      endBtn.onclick = () => this.stopLiveChat();
      this.messagesContainer.appendChild(endBtn);
      this.liveChatEndBtn = endBtn;

      // Add header indicator
      const header = document.querySelector('.vogo-chat-header');
      if (header && !header.querySelector('.vogo-live-chat-indicator')) {
        const indicator = document.createElement('span');
        indicator.className = 'vogo-live-chat-indicator';
        indicator.textContent = 'LIVE';
        header.appendChild(indicator);
      }

      // Init: fetch existing messages to get lastMessageId and detect agent ID,
      // then start polling for only NEW messages
      this._initLiveChatHistory();
      this.scrollToBottom();
    }

    async _initLiveChatHistory() {
      try {
        const res = await fetch('/api/human-operator/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: this.liveChatThreadId })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.answers) && data.answers.length > 0) {
          // Auto-detect support agent ID from to_user_id if not already set from server
          if (!this.liveChatSupportUserId) {
            // Find a user→agent message (post_author != to_user_id) and use to_user_id as agent ID
            for (const msg of data.answers) {
              const toUserId = String(msg.to_user_id || '');
              const author = String(msg.post_author || '');
              if (toUserId && toUserId !== '0' && author && toUserId !== author) {
                this.liveChatSupportUserId = toUserId;
                break;
              }
            }
          }

          // Detect the current user's forum ID from messages addressed to support
          if (!this.liveChatSelfUserId && this.liveChatSupportUserId) {
            for (const msg of data.answers) {
              const toUserId = String(msg.to_user_id || '');
              const authorId = String(msg.post_author || '');
              if (toUserId && authorId && toUserId === this.liveChatSupportUserId && authorId !== this.liveChatSupportUserId) {
                this.liveChatSelfUserId = authorId;
                // Persist to localStorage for restart recovery
                localStorage.setItem('vogo_live_chat_self_user_id_' + this.liveChatThreadId, authorId);
                break;
              }
            }
          }

          // Show existing messages in the chat (restore agent messages only)
          for (const msg of data.answers) {
            const text = msg.mesaj || msg.comment_content || msg.message || '';
            if (!text) continue;
            const isAgent = (typeof msg.isAgent === 'boolean') ? msg.isAgent : this.isAgentLiveChatMessage(msg);
            if (isAgent) {
              this.addAgentMessage(text, msg.author_name || msg.username_chat || 'Support Agent');
            }
          }
          this.scrollToBottom();

          // Track last message ID for polling (only show NEW messages after this)
          this.liveChatLastMessageId = Math.max(
            ...data.answers.map(m => Number(m.ID || m.id || m.comment_ID || 0))
          );
        }
      } catch (e) { /* silent */ }
      // Start polling AFTER init completes
      this.liveChatPollTimer = setInterval(() => this.pollLiveChatMessages(), 5000);
    }

    isAgentLiveChatMessage(msg) {
      const supportId = this.liveChatSupportUserId ? String(this.liveChatSupportUserId) : '';
      const selfId = this.liveChatSelfUserId ? String(this.liveChatSelfUserId) : '';
      const postAuthor = String(msg.post_author || '');
      const toUserId = String(msg.to_user_id || '');

      // Preferred: message direction by recipient ID
      // user -> operator has recipient=support
      // operator -> user has recipient=self
      if (supportId && toUserId) {
        return toUserId !== supportId;
      }

      // Fallback: explicit author match
      if (supportId && postAuthor) {
        return postAuthor === supportId;
      }

      // Last fallback: if we know self ID, anything else is agent
      if (selfId && postAuthor) {
        return postAuthor !== selfId;
      }

      return false;
    }

    async sendLiveChatMessage(text, imageUrl = null) {
      try {
        const payload = { threadId: this.liveChatThreadId };
        if (text) payload.message = text;
        if (imageUrl) payload.imageUrl = imageUrl;
        
        const res = await fetch('/api/human-operator/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
          this.addBotMessage('Failed to send message. Please try again.');
        }
        // Capture user ID from response if not already known
        if (data.userId && !this.liveChatSelfUserId) {
          this.liveChatSelfUserId = String(data.userId);
          localStorage.setItem('vogo_live_chat_self_user_id_' + this.liveChatThreadId, String(data.userId));
        }
      } catch (err) {
        this.addBotMessage('Connection error. Please try again.');
      }
    }

    async pollLiveChatMessages() {
      if (!this.liveChatActive || !this.liveChatThreadId) return;
      if (document.hidden) return;

      try {
        const res = await fetch('/api/human-operator/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: this.liveChatThreadId })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.answers)) {
          for (const msg of data.answers) {
            const msgId = Number(msg.ID || msg.id || msg.comment_ID || 0);
            if (msgId > this.liveChatLastMessageId) {
              this.liveChatLastMessageId = msgId;
              const isAgent = (typeof msg.isAgent === 'boolean') ? msg.isAgent : this.isAgentLiveChatMessage(msg);
              const messageText = msg.mesaj || msg.comment_content || msg.message || '';
              
              if (isAgent) {
                const imageUrl = this.extractImageUrl(messageText);
                const cleanText = imageUrl ? this.removeImageMarkup(messageText) : messageText;
                
                if (imageUrl) {
                  this.addAgentMessageWithImage(cleanText, imageUrl, msg.author_name || msg.username_chat || 'Support Agent');
                } else {
                  this.addAgentMessage(cleanText, msg.author_name || msg.username_chat || 'Support Agent');
                }
              }
              // User's own messages (post_author != agent) are skipped — already shown optimistically
            }
          }
        }
      } catch (err) { /* silent */ }
    }

    extractImageUrl(text) {
      const match = text.match(/\[image\](.*?)\[\/image\]/);
      return match ? match[1] : null;
    }

    removeImageMarkup(text) {
      return text.replace(/\[image\].*?\[\/image\]/g, '').trim();
    }

    stopLiveChat() {
      this.liveChatActive = false;
      // Clear localStorage for this thread
      if (this.liveChatThreadId) {
        localStorage.removeItem('vogo_live_chat_self_user_id_' + this.liveChatThreadId);
      }
      this.liveChatThreadId = null;
      this.liveChatSelfUserId = null;
      this.liveChatSupportUserId = null;
      if (this.liveChatPollTimer) {
        clearInterval(this.liveChatPollTimer);
        this.liveChatPollTimer = null;
      }

      // Disable attach button (image upload only allowed in live chat)
      if (this.attachBtn) {
        this.attachBtn.disabled = true;
        this.attachBtn.title = 'Image upload only available in live chat';
        this.attachBtn.style.opacity = '0.5';
        this.attachBtn.style.cursor = 'not-allowed';
      }

      // Remove end button
      if (this.liveChatEndBtn) {
        this.liveChatEndBtn.remove();
        this.liveChatEndBtn = null;
      }

      // Remove header indicator
      const indicator = document.querySelector('.vogo-live-chat-indicator');
      if (indicator) indicator.remove();

      // Tell server to clear the live chat session so next transfer gets a fresh thread
      fetch('/api/human-operator/end-chat', { method: 'POST' }).catch(() => {});

      // Show ended message
      const endBanner = document.createElement('div');
      endBanner.className = 'vogo-live-chat-banner';
      endBanner.style.borderColor = 'rgba(255,107,107,0.4)';
      endBanner.innerHTML = '<span>Live chat session ended. You are back to AI assistant mode.</span>';
      this.messagesContainer.appendChild(endBanner);
      this.scrollToBottom();
    }

    addAgentMessage(text, agentName) {
      const container = document.createElement('div');
      container.className = 'vogo-message-container vogo-bot-message';

      const nameLabel = document.createElement('div');
      nameLabel.className = 'vogo-agent-name';
      nameLabel.textContent = agentName || 'Support Agent';
      container.appendChild(nameLabel);

      const bubble = document.createElement('div');
      bubble.className = 'vogo-message-bubble';
      bubble.textContent = text;
      container.appendChild(bubble);

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    async handleImageSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        this.addBotMessage('Please select an image file (JPEG, PNG, GIF, WebP).');
        this.imageInput.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.addBotMessage('Image is too large. Maximum size is 5MB.');
        this.imageInput.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('image', file);

      try {
        this.attachBtn.disabled = true;
        this.attachBtn.textContent = '⏳';

        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          // Show image in chat (user side)
          this.addUserMessageWithImage(data.imageUrl, file.name);

          if (this.liveChatActive && this.liveChatThreadId) {
            // Live chat: send to human operator
            await this.sendLiveChatMessage('', data.imageUrl);
          } else {
            // Normal chat: tell bot an image was shared
            this.showTypingIndicator();
            try {
              const botRes = await fetch('/api/chatbot-nlp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: '[IMAGE_SHARED:' + data.imageUrl + '] User shared an image: ' + file.name,
                  language: this.currentLanguage || 'auto',
                  imageUrl: data.imageUrl
                })
              });
              const botData = await botRes.json();
              this.hideTypingIndicator();
              if (botData.success && botData.result && botData.result.response) {
                this.addBotMessage(botData.result.response);
              } else {
                this.addBotMessage('🖼️ Image received! I can see your image: ' + file.name + '. How can I help you with it?');
              }
            } catch (e) {
              this.hideTypingIndicator();
              this.addBotMessage('🖼️ Image uploaded: ' + file.name);
            }
          }
        } else {
          this.addBotMessage('Failed to upload image: ' + (data.message || 'Unknown error'));
        }
      } catch (error) {
        this.addBotMessage('Upload error: ' + error.message);
      } finally {
        this.attachBtn.disabled = false;
        this.attachBtn.textContent = '📎';
        this.imageInput.value = '';
      }
    }

    addUserMessageWithImage(imageUrl, filename) {
      const container = document.createElement('div');
      container.className = 'vogo-user-message vogo-user-message--with-image';
      
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = filename || 'Uploaded image';
      img.className = 'vogo-message-image';
      img.onclick = () => this.openImageModal(imageUrl);
      container.appendChild(img);
      
      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    addBotMessageWithImage(text, imageUrl, senderName) {
      const container = document.createElement('div');
      container.className = 'vogo-bot-message-container';

      const icon = document.createElement('img');
      icon.src = CONFIG.iconPath;
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      container.appendChild(icon);

      const message = document.createElement('div');
      message.className = 'vogo-bot-message vogo-bot-message--with-image';
      
      if (text) {
        const textNode = document.createElement('div');
        textNode.textContent = text;
        textNode.style.marginBottom = '8px';
        message.appendChild(textNode);
      }
      
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Attached image';
        img.className = 'vogo-message-image';
        img.onclick = () => this.openImageModal(imageUrl);
        message.appendChild(img);
      }
      
      container.appendChild(message);
      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    addAgentMessageWithImage(text, imageUrl, agentName) {
      const container = document.createElement('div');
      container.className = 'vogo-message-container vogo-bot-message';

      const nameLabel = document.createElement('div');
      nameLabel.className = 'vogo-agent-name';
      nameLabel.textContent = agentName || 'Support Agent';
      container.appendChild(nameLabel);

      const bubble = document.createElement('div');
      bubble.className = 'vogo-message-bubble vogo-message-bubble--with-image';
      
      if (text) {
        const textNode = document.createElement('div');
        textNode.textContent = text;
        textNode.style.marginBottom = '8px';
        bubble.appendChild(textNode);
      }
      
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Attached image';
        img.className = 'vogo-message-image';
        img.onclick = () => this.openImageModal(imageUrl);
        bubble.appendChild(img);
      }
      
      container.appendChild(bubble);
      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    openImageModal(imageUrl) {
      const modal = document.createElement('div');
      modal.className = 'vogo-image-modal';
      modal.innerHTML = `
        <span class="vogo-image-modal-close">&times;</span>
        <img class="vogo-image-modal-content" src="${imageUrl}" />
      `;
      
      modal.querySelector('.vogo-image-modal-close').onclick = () => modal.remove();
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
      
      document.body.appendChild(modal);
    }

    // =========================================================================
    // SHOPPING LIST
    // FIX: reads done state from API (not localStorage)
    // FIX: markDoneUrl used instead of hardcoded '/api/mark-done'
    // FIX: trackedDone prevents double-toggle on fast clicks
    // =========================================================================
    showShoppingListItems(items) {
      if (!items || items.length === 0) {
        this.addBotMessage('Your shopping list is empty.');
        return;
      }

      const container = document.createElement('div');
      container.className = 'vogo-list-container';

      const header = document.createElement('div');
      header.className = 'vogo-list-header';
      header.textContent = 'Items: ' + items.length;
      container.appendChild(header);

      items.forEach((item, index) => {
        const name = (typeof item === 'string')
          ? item
          : (item.name || item.item_name || item.item_text || 'Item');
        const cleanName = String(name).replace(/\s*\(Qty:\s*\d+\)\s*/gi, '').trim();
        const quantity = (typeof item === 'object' && item.quantity > 1) ? item.quantity : null;
        const itemKey = 'vogo_shop_' + (item.id || cleanName).toString().replace(/\s+/g, '_');

        // Trust API done state — parseDone handles string "0"/"1"
        const apiDone = parseDone(item.done) || parseDone(item.done_checked) ||
                        parseDone(item.is_done) || parseDone(item.completed);
        if (apiDone) {
          localStorage.setItem(itemKey, '1');
        } else {
          localStorage.removeItem(itemKey);
        }
        const isChecked = apiDone;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'vogo-list-item' + (isChecked ? ' vogo-list-item--done' : '');

        const numSpan = document.createElement('span');
        numSpan.className = 'vogo-item-number';
        numSpan.textContent = (index + 1) + '.';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'vogo-item-name';
        nameSpan.textContent = cleanName + (quantity ? ' (' + quantity + 'x)' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'vogo-item-checkbox';
        checkbox.checked = isChecked;
        checkbox.title = 'Mark as done';
        // trackedDone: mutable ref — tracks confirmed API state, prevents double-toggle
        let trackedDone = apiDone;
        checkbox.addEventListener('change', async () => {
          const itemId = item.id || item.item_id || item.list_id;
          const wantMark = checkbox.checked;
          // Skip if already in desired state
          if (trackedDone === wantMark) {
            console.log('[shopping] skipped — already in desired state:', trackedDone);
            return;
          }
          if (wantMark) {
            itemDiv.classList.add('vogo-list-item--done');
            localStorage.setItem(itemKey, '1');
            try {
              if (itemId) {
                const r = await fetch(CONFIG.markDoneUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'shopping', id: itemId, action: 'mark' })
                });
                const res = await r.json();
                if (res.success) {
                  trackedDone = true;
                } else {
                  // Revert on API failure
                  checkbox.checked = false;
                  itemDiv.classList.remove('vogo-list-item--done');
                  localStorage.removeItem(itemKey);
                  console.warn('[shopping] mark failed:', res.message);
                }
              }
            } catch(e) { console.error('markDone error:', e); }
          } else {
            itemDiv.classList.remove('vogo-list-item--done');
            localStorage.removeItem(itemKey);
            try {
              if (itemId) {
                const r = await fetch(CONFIG.markDoneUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'shopping', id: itemId, action: 'unmark' })
                });
                const res = await r.json();
                if (res.success) {
                  trackedDone = false;
                } else {
                  // Revert on API failure
                  checkbox.checked = true;
                  itemDiv.classList.add('vogo-list-item--done');
                  localStorage.setItem(itemKey, '1');
                  console.warn('[shopping] unmark failed:', res.message);
                }
              }
            } catch(e) { console.error('unmarkDone error:', e); }
          }
        });

        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(numSpan);
        itemDiv.appendChild(nameSpan);
        container.appendChild(itemDiv);
      });

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    // =========================================================================
    // AGENDA / CALENDAR
    // FIX: reads done state from API (not localStorage)
    // FIX: markDoneUrl used instead of hardcoded '/api/mark-done'
    // FIX: trackedDone prevents double-toggle on fast clicks
    // FIX: reverts UI on API failure
    // =========================================================================
    showAgendaItems(events) {
      if (!events || events.length === 0) {
        this.addBotMessage('Your calendar is empty.');
        return;
      }

      const container = document.createElement('div');
      container.className = 'vogo-list-container';

      const header = document.createElement('div');
      header.className = 'vogo-list-header';
      header.textContent = 'Events: ' + events.length;
      container.appendChild(header);

      events.forEach((event, index) => {
        const title = event.name || event.event || event.title || event.event_name || event.event_text || 'Event';
        const rawDate = event.datetime || event.date || event.event_datetime || '';
        const dateOnly = rawDate ? String(rawDate).split(' ')[0] : '';
        const eventKey = 'vogo_agenda_' + (event.id || title).toString().replace(/\s+/g, '_');

        // Trust API done state
        const apiDone = parseDone(event.done) || parseDone(event.done_checked) ||
                        parseDone(event.is_done) || parseDone(event.completed);
        if (apiDone) {
          localStorage.setItem(eventKey, '1');
        } else {
          localStorage.removeItem(eventKey);
        }
        const isChecked = apiDone;

        const eventDiv = document.createElement('div');
        eventDiv.className = 'vogo-list-item' + (isChecked ? ' vogo-list-item--done' : '');

        const numSpan = document.createElement('span');
        numSpan.className = 'vogo-item-number';
        numSpan.textContent = (index + 1) + '.';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'vogo-item-name';
        titleSpan.textContent = title;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'vogo-item-checkbox';
        checkbox.checked = isChecked;
        checkbox.title = 'Mark as done';
        // trackedDone: mutable ref — tracks confirmed API state, prevents double-toggle
        let trackedDone = apiDone;
        checkbox.addEventListener('change', async () => {
          const eventId = event.id || event.event_id;
          const wantMark = checkbox.checked;
          // Skip if already in desired state
          if (trackedDone === wantMark) {
            console.log('[agenda] skipped — already in desired state:', trackedDone);
            return;
          }
          if (wantMark) {
            eventDiv.classList.add('vogo-list-item--done');
            localStorage.setItem(eventKey, '1');
            try {
              if (eventId) {
                const r = await fetch(CONFIG.markDoneUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'agenda', id: eventId, action: 'mark' })
                });
                const res = await r.json();
                if (res.success) {
                  trackedDone = true;
                } else {
                  // Revert on API failure
                  checkbox.checked = false;
                  eventDiv.classList.remove('vogo-list-item--done');
                  localStorage.removeItem(eventKey);
                  console.warn('[agenda] mark failed:', res.message);
                }
              }
            } catch(e) { console.error('markDone agenda error:', e); }
          } else {
            eventDiv.classList.remove('vogo-list-item--done');
            localStorage.removeItem(eventKey);
            try {
              if (eventId) {
                const r = await fetch(CONFIG.markDoneUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'agenda', id: eventId, action: 'unmark' })
                });
                const res = await r.json();
                if (res.success) {
                  trackedDone = false;
                } else {
                  // Revert on API failure
                  checkbox.checked = true;
                  eventDiv.classList.add('vogo-list-item--done');
                  localStorage.setItem(eventKey, '1');
                  console.warn('[agenda] unmark failed:', res.message);
                }
              }
            } catch(e) { console.error('unmarkDone agenda error:', e); }
          }
        });

        const dateSpan = document.createElement('span');
        dateSpan.className = 'vogo-item-date';
        dateSpan.textContent = dateOnly ? ' - ' + dateOnly : '';

        eventDiv.appendChild(checkbox);
        eventDiv.appendChild(numSpan);
        eventDiv.appendChild(titleSpan);
        if (dateOnly) eventDiv.appendChild(dateSpan);
        container.appendChild(eventDiv);
      });

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    // =========================================================================
    // MESSAGE SENDING
    // FIX: mark/unmark done handler uses database ID directly, not fuzzy name match
    // FIX: isProcessing guard prevents race condition on rapid inputs
    // FIX: messageQueue ensures messages sent during processing are handled in order
    // =========================================================================
    async sendMessage() {
      const text = this.input.value.trim();
      if (!text) return;

      // Live chat mode — send to forum thread, not NLP
      if (this.liveChatActive && this.liveChatThreadId) {
        this.addUserMessage(text);
        this.input.value = '';
        await this.sendLiveChatMessage(text);
        return;
      }

      // ── Race Condition Guard ────────────────────────────────────────────────
      // If a request is already in-flight, queue this message and return.
      // The queue will be drained after the current response is received.
      if (this.isProcessing) {
        // Show user message immediately so they see it was received
        this.addUserMessage(text);
        this.input.value = '';
        this.messageQueue.push(text);
        console.log('[queue] Queued message:', text, '| Queue length:', this.messageQueue.length);
        return;
      }

      this._startProcessing(text);
    }

    // Lock input + send button, show typing indicator, fire the NLP request
    _startProcessing(text) {
      this.isProcessing = true;
      this.addUserMessage(text);
      this.input.value = '';
      this._setInputLocked(true);
      this.showTypingIndicator();
      this._doFetch(text);
    }

    // Disable / enable input + send button during processing
    _setInputLocked(locked) {
      if (this.input)   { this.input.disabled = locked; }
      if (this.sendBtn) {
        this.sendBtn.disabled = locked;
        this.sendBtn.style.opacity = locked ? '0.5' : '1';
        this.sendBtn.textContent   = locked ? '...' : this.t('send');
      }
      // Mic: briefly show ⌛ while processing, restore right after response
      if (locked) {
        this._setMicState('processing');
      } else if (!this.isSpeaking) {
        // Only restore to idle if TTS is not playing
        this._setMicState('idle');
      }
    }

    // Called when processing finishes — drains queue if needed
    _finishProcessing() {
      this.isProcessing = false;
      this._setInputLocked(false);
      this.input.focus();

      // Process next queued message (FIFO)
      if (this.messageQueue.length > 0) {
        const next = this.messageQueue.shift();
        console.log('[queue] Processing queued message:', next, '| Remaining:', this.messageQueue.length);
        // Small delay so UI updates are visible
        setTimeout(() => this._startProcessing(next), 300);
      }
    }

    // Core NLP fetch — separated from sendMessage() for queue support
    async _doFetch(text) {
      try {
        const response = await fetch(CONFIG.nlpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.userToken ? { 'x-auth-token': this.userToken } : {})
          },
          body: JSON.stringify({
            text: text,
            language: 'auto',
            aiModel: this.aiSelect ? this.aiSelect.value : null
          })
        });

        const data = await response.json();
        this.hideTypingIndicator();

        if (data.success && data.result) {
          const result = data.result;
          const action = data.action;

          if (result.response) {
            this.addBotMessage(result.response);
          }

          console.log('Intent: ' + result.intent + ' | Method: ' + result.method + ' | Confidence: ' + result.confidence);

          if (action) {
            // Live chat — human operator handoff (Phase C)
            if (action.liveChatStarted && action.threadId) {
              this.startLiveChat(action);
            }

            // Shopping list items — render with checkboxes
            if (action.items && Array.isArray(action.items) && action.items.length > 0) {
              this.showShoppingListItems(action.items);

            // Agenda/calendar events — render with checkboxes
            } else if (action.events && Array.isArray(action.events) && action.events.length > 0) {
              this.showAgendaItems(action.events);

            // Product search results
            } else if (action.results && Array.isArray(action.results) && action.results.length > 0) {
              this.showSearchResults(action.results);

            // Mark/unmark done via text command
            } else if (action.markedItem && action.markedType && action.success) {
              const keyPrefix = action.markedType === 'shopping' ? 'vogo_shop_' : 'vogo_agenda_';
              const isUnmark = !!(action.isUnmark);

              if (action.markedId) {
                const key = keyPrefix + action.markedId;
                if (isUnmark) {
                  localStorage.removeItem(key);
                } else {
                  localStorage.setItem(key, '1');
                }
              }
              // Also sync name-based key if present
              const markedName = String(action.markedItem).toLowerCase().trim().replace(/\s+/g, '_');
              const nameKey = keyPrefix + markedName;
              if (isUnmark) {
                localStorage.removeItem(nameKey);
              } else {
                localStorage.setItem(nameKey, '1');
              }

            // Auth: awaiting username — just show the prompt (input stays normal text)
            } else if (action.awaitingUsername) {
              this.setPasswordMode(false);

            // Auth: awaiting password — switch input to password type
            } else if (action.awaitingPassword) {
              this.setPasswordMode(true);

            // Auth: login success — store token, restore input, retry original intent
            } else if (action.authSuccess) {
              this.setPasswordMode(false);
              if (action.userToken) {
                this.userToken = action.userToken;
                console.log('[auth] Token stored, role-based routing active');
              }
              // Retry the original intent automatically
              if (action.retryText) {
                setTimeout(() => {
                  this.input.value = action.retryText;
                  this.sendMessage();
                }, 600);
              }

            // Auth: login FAILED — reset password mode so input returns to normal text
            } else if (action.authFailed) {
              this.setPasswordMode(false);

            // Override message
            } else if (action.overrideResponse && action.message && action.message !== result.response) {
              const msg = String(action.message)
                .replace(/\b(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\b/g, '$1');
              this.addBotMessage(msg);
            }
          }
        } else {
          this.addBotMessage(this.t('errorMessage'));
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addBotMessage(this.t('errorMessage'));
        console.error('NLP Error:', error);
      } finally {
        // Always unlock input + drain queue — even on network error
        this._finishProcessing();
      }
    }

    // =========================================================================
    // PREDEFINED QA NAVIGATION
    // FIX: Links open in same tab (window.location.href, target="_self")
    // =========================================================================
    async handleQuestionClick(question) {
      console.log('Question clicked:', question);
      this.addUserMessage(question.text);
      this.showTypingIndicator();

      try {
        const fullUrl = this.buildFullUrl(question.link);

        if (fullUrl) {
          this.hideTypingIndicator();
          this.addBotMessageHTML(
            'Opening: <a href="' + fullUrl + '" target="_self" style="color:#667eea;text-decoration:underline;">' + fullUrl + '</a>'
          );
          try { window.location.href = fullUrl; } catch (e) { console.error('Error opening link:', e); }
          return;
        }

        const response = await this.callAPI('getPredefinedQA', { parent_id: question.id, lang: this.currentLanguage });
        this.hideTypingIndicator();

        if (response.data && response.data.length > 0) {
          this._inSubNav = true; // entered sub-menu, suppress lang-change reload
          this.showPredefinedQuestions(response.data);
        } else {
          // No sub-questions → leaf node, return to root questions
          this._inSubNav = false;
          const rootResp = await this.callAPI('getPredefinedQA', { parent_id: null, lang: this.currentLanguage });
          if (rootResp.data && rootResp.data.length > 0) {
            this.showPredefinedQuestions(rootResp.data);
          }
          this.addBotMessage('Thank you for your question!');
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addBotMessage(this.t('errorMessage'));
        console.error('Error handling question:', error);
      }
    }

    async loadInitialQuestions() {
      this._inSubNav = false; // at root level
      this.showTypingIndicator();
      try {
        const response = await this.callAPI('getPredefinedQA', { parent_id: null, lang: this.currentLanguage });
        this.hideTypingIndicator();
        if (response.data && response.data.length > 0) {
          this.showPredefinedQuestions(response.data);
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addBotMessage(this.t('errorMessage'));
        console.error('Error loading questions:', error);
      }
    }

    async callAPI(action, data) {
      const response = await fetch(CONFIG.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data })
      });
      if (!response.ok) throw new Error('API call failed');
      return await response.json();
    }

    buildFullUrl(link) {
      if (!link || link === 'null' || link === null) return null;
      const cleanLink = link.trim();
      if (cleanLink.startsWith('http://') || cleanLink.startsWith('https://')) return cleanLink;
      if (cleanLink.startsWith('/')) return CONFIG.baseWebsiteUrl + cleanLink;
      return CONFIG.baseWebsiteUrl + '/' + cleanLink;
    }

    // =========================================================================
    // AUTH: Toggle password mode on the input field
    // Shows a lock icon label and masks input when awaiting password
    // =========================================================================
    setPasswordMode(on) {
      this.awaitingPassword = on;
      if (!this.input) return;
      this.input.type = on ? 'password' : 'text';
      // Show/hide a small password hint below input
      let hint = document.getElementById('vogo-pw-hint');
      if (on) {
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'vogo-pw-hint';
          hint.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);text-align:center;padding:3px 0 0;';
          hint.textContent = '🔒 Password is hidden';
          this.input.parentNode.appendChild(hint);
        }
        this.input.placeholder = 'Enter your password...';
        this.input.focus();
      } else {
        if (hint) hint.remove();
        this.input.type = 'text';
        this.input.placeholder = this.t('inputPlaceholder');
      }
    }

    clearMessages() {
      this.messagesContainer.innerHTML = '';
    }

    // ============================================================================
    // VOICE AI - Speech-to-Text (STT) + Text-to-Speech (TTS)
    // STT: MediaRecorder → /api/voice/stt (Node proxy → Python Faster-Whisper)
    // TTS: /api/voice/tts (Node proxy → Python Edge-TTS) → Web Audio
    // ============================================================================

    async toggleVoiceRecording() {
      // If TTS is currently speaking → stop it and start listening
      if (this.isSpeaking) {
        this._stopTTS();
        // Small delay so audio fully stops before mic opens
        setTimeout(() => this._beginListening(), 150);
        return;
      }

      if (this.voiceRecording) {
        this.stopVoiceRecording();
        return;
      }

      this._beginListening();
    }

    _beginListening() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this._startWebSpeech(SpeechRecognition);
      } else {
        this.startVoiceRecording();
      }
    }

    _stopTTS() {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      this.isSpeaking = false;
      this._setMicState('idle');
    }

    _startWebSpeech(SpeechRecognition) {
      const recognition = new SpeechRecognition();

      // Language mapping: chatbot lang code → BCP-47
      // Added ur-PK (Urdu), ar (Arabic) support
      const langMap = {
        en: 'en-US', ro: 'ro-RO', it: 'it-IT',
        fr: 'fr-FR', de: 'de-DE', es: 'es-ES',
        hi: 'hi-IN', ur: 'ur-PK', ar: 'ar-SA'
      };
      recognition.lang = langMap[this.currentLanguage] || 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;  // live partial results = faster feedback
      recognition.maxAlternatives = 1;

      this.voiceRecording = true;
      this._setMicState('recording');
      this._activeRecognition = recognition;

      let finalText = '';
      // Auto-stop after 6 seconds so mic doesn't wait forever
      const autoStopTimer = setTimeout(() => {
        console.log('[VOICE] Auto-stop after 6s');
        try { recognition.stop(); } catch(_) {}
      }, 6000);

      recognition.onresult = (event) => {
        // Collect final segments only (interimResults=true sends both)
        finalText = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          }
        }
        // Show live text in input box while speaking
        const liveText = event.results[event.results.length - 1][0].transcript;
        if (this.input) this.input.value = liveText;
      };

      recognition.onerror = (event) => {
        clearTimeout(autoStopTimer);
        console.log('[VOICE] WebSpeech error:', event.error);
        this.voiceRecording = false;
        this._activeRecognition = null;
        if (event.error === 'aborted') {
          this._setMicState('idle');
        } else if (event.error === 'no-speech') {
          // No speech detected → silently try Whisper
          console.log('[VOICE] No speech via WebSpeech → switching to Whisper');
          this.startVoiceRecording();
        } else {
          // Any other error → fallback to Whisper
          console.log('[VOICE] Falling back to Whisper');
          this.startVoiceRecording();
        }
      };

      recognition.onend = () => {
        clearTimeout(autoStopTimer);
        this.voiceRecording = false;
        this._activeRecognition = null;
        const text = (finalText || (this.input ? this.input.value : '')).trim();
        if (text) {
          this.input.value = text;
          this._setMicState('idle');
          this.sendMessage();
        } else {
          // Empty result → silently try Whisper instead of showing error
          console.log('[VOICE] WebSpeech returned empty → trying Whisper fallback');
          this.startVoiceRecording();
        }
      };

      recognition.start();
    }


    async startVoiceRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioChunks = [];

        // Detect best supported format — iOS Safari uses audio/mp4, Desktop uses webm
        let mimeType = '';
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/ogg',
          'audio/mp4',       // iOS Safari
          'audio/aac',       // Android fallback
          ''                 // browser default
        ];
        for (const t of candidates) {
          if (!t || MediaRecorder.isTypeSupported(t)) {
            mimeType = t;
            break;
          }
        }

        const recOptions = mimeType ? { mimeType } : {};
        this.mediaRecorder = new MediaRecorder(stream, recOptions);
        const actualMime = this.mediaRecorder.mimeType || mimeType || 'audio/webm';
        console.log('[VOICE] Recording with mimeType:', actualMime);

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          this._sendAudioForTranscription(actualMime);
        };

        this.mediaRecorder.start();
        this.voiceRecording = true;
        this._setMicState('recording');
      } catch (err) {
        console.error('[VOICE] Microphone error:', err);
        this.addBotMessage('⚠️ Microphone access denied. Please allow microphone in browser settings.');
      }
    }

    stopVoiceRecording() {
      // Stop Web Speech API if active
      if (this._activeRecognition) {
        try { this._activeRecognition.stop(); } catch(_) {}
        this._activeRecognition = null;
      }
      // Stop MediaRecorder if active
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.voiceRecording = false;
      this._setMicState('processing');
    }

    async _sendAudioForTranscription(mimeType) {
      try {
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        // Correct extension for each format
        let ext = 'webm';
        if (mimeType.includes('mp4') || mimeType.includes('aac')) ext = 'mp4';
        else if (mimeType.includes('ogg')) ext = 'ogg';
        else if (mimeType.includes('wav')) ext = 'wav';

        console.log(`[VOICE] Sending ${audioBlob.size} bytes (${mimeType}) -> /api/voice/stt`);

        const formData = new FormData();
        formData.append('audio', audioBlob, `voice.${ext}`);

        const res = await fetch('/api/voice/stt', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        this._setMicState('idle');
        console.log('[VOICE] STT response:', data);

        if (data.text && data.text.trim()) {
          this.input.value = data.text.trim();
          this.sendMessage();
        } else if (data.error) {
          this.addBotMessage('⚠️ Voice backend not running. Please start the Python voice server.');
        } else {
          this.addBotMessage("🎤 Didn't catch that. Please try speaking again.");
        }
      } catch (err) {
        console.error('[VOICE] STT error:', err);
        this._setMicState('idle');
        this.addBotMessage('⚠️ Voice recognition unavailable. Please check if the Python voice backend is running.');
      }
    }

    async speakText(text) {
      if (!this.voiceEnabled || !text) return;
      // Only speak first 150 chars — keeps TTS fast (< 1 second generation)
      const speakableText = text.length > 150 ? text.substring(0, 150) : text;
      try {
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: speakableText, language: this.currentLanguage })
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        this.currentAudio = new Audio(audioUrl);

        // Mark speaking state — mic btn becomes a stop-speaker button
        this.isSpeaking = true;
        this._setMicState('speaking');

        this.currentAudio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.isSpeaking = false;
          this.currentAudio = null;
          this._setMicState('idle'); // restore mic button after speech ends
        };

        this.currentAudio.play().catch(err => {
          console.warn('[VOICE] TTS autoplay blocked:', err.message);
          this.isSpeaking = false;
          this._setMicState('idle');
        });
      } catch (err) {
        console.warn('[VOICE] TTS playback error:', err.message);
        this.isSpeaking = false;
        this._setMicState('idle');
      }
    }

    _setMicState(state) {
      if (!this.micBtn) return;
      if (state === 'recording') {
        this.micBtn.innerHTML = '&#9209;';   // ⏹ stop icon
        this.micBtn.title = 'Stop recording';
        this.micBtn.disabled = false;
        this.micBtn.style.opacity = '1';
        this.micBtn.classList.add('vogo-mic-btn--recording');
        this.micBtn.classList.remove('vogo-mic-btn--processing', 'vogo-mic-btn--speaking');
      } else if (state === 'speaking') {
        this.micBtn.innerHTML = '&#128266;'; // 🔊 speaker — click to stop & record
        this.micBtn.title = 'Bot is speaking — click to stop & record';
        this.micBtn.disabled = false;        // clickable so user can interrupt
        this.micBtn.style.opacity = '1';
        this.micBtn.classList.add('vogo-mic-btn--speaking');
        this.micBtn.classList.remove('vogo-mic-btn--recording', 'vogo-mic-btn--processing');
      } else if (state === 'processing') {
        this.micBtn.innerHTML = '&#8987;';   // ⌛
        this.micBtn.title = 'Processing...';
        this.micBtn.disabled = true;
        this.micBtn.style.opacity = '0.5';
        this.micBtn.classList.add('vogo-mic-btn--processing');
        this.micBtn.classList.remove('vogo-mic-btn--recording', 'vogo-mic-btn--speaking');
      } else {
        this.micBtn.innerHTML = '&#127908;'; // 🎤
        this.micBtn.title = 'Voice input';
        this.micBtn.disabled = false;
        this.micBtn.style.opacity = '1';
        this.micBtn.classList.remove('vogo-mic-btn--recording', 'vogo-mic-btn--processing', 'vogo-mic-btn--speaking');
      }
    }

    _updateVoiceToggleBtn() {
      if (!this.voiceToggleBtn) return;
      if (this.voiceSpeakEnabled) {
        this.voiceToggleBtn.innerHTML = '&#128266;'; // 🔊 speaker on
        this.voiceToggleBtn.title = 'Voice reply ON — click to turn off';
        this.voiceToggleBtn.classList.add('vogo-voice-toggle-btn--active');
      } else {
        this.voiceToggleBtn.innerHTML = '&#128263;'; // 🔇 muted
        this.voiceToggleBtn.title = 'Voice reply OFF — click to turn on';
        this.voiceToggleBtn.classList.remove('vogo-voice-toggle-btn--active');
      }
    }

    scrollToBottom() {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  // Initialize when DOM is ready and expose instance globally
  function createChatbot() {
    const instance = new VogoChatbot();
    window._vogoChatbot = instance; // Global access for external buttons
    return instance;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createChatbot());
  } else {
    createChatbot();
  }

  window.VogoChatbot = VogoChatbot;
})();