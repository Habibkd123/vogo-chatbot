// src/chatbot.js - Complete Phase B Frontend (FINAL - ALL ISSUES FIXED)

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    proxyUrl: 'http://localhost:3000/api/chatbot',
    nlpUrl: 'http://localhost:3000/api/chatbot-nlp',
    botName: 'Kodee',
    defaultLanguage: 'ro',
    baseWebsiteUrl: 'https://vogo.family'  // Base URL for fixing incomplete links
  };

  // Translations
  const TRANSLATIONS = {
    en: {
      greeting: 'Hello 👋',
      subGreeting: 'How can I help you today?',
      inputPlaceholder: 'Ask Kodee anything...',
      send: 'Send',
      errorMessage: 'Sorry, something went wrong. Please try again.',
      thinking: 'Thinking...',
      linkOpening: 'Opening link...',
      linkError: 'Could not open link. Please try manually:',
      noResults: 'No results found.',
      demoMode: '(Demo mode)'
    },
    ro: {
      greeting: 'Bună 👋',
      subGreeting: 'Cum vă pot ajuta astăzi?',
      inputPlaceholder: 'Întreabă-l pe Kodee orice...',
      send: 'Trimite',
      errorMessage: 'Ne pare rău, ceva nu a mers bine. Vă rugăm încercați din nou.',
      thinking: 'Gândesc...',
      linkOpening: 'Deschid linkul...',
      linkError: 'Nu am putut deschide linkul. Încercați manual:',
      noResults: 'Nu s-au găsit rezultate.',
      demoMode: '(Mod demo)'
    },
    it: {
      greeting: 'Ciao 👋',
      subGreeting: 'Come posso aiutarti oggi?',
      inputPlaceholder: 'Chiedi a Kodee qualsiasi cosa...',
      send: 'Invia',
      errorMessage: 'Spiacenti, qualcosa è andato storto. Riprova.',
      thinking: 'Pensando...',
      linkOpening: 'Apertura del link...',
      linkError: 'Impossibile aprire il collegamento. Prova manualmente:',
      noResults: 'Nessun risultato trovato.',
      demoMode: '(Modalità demo)'
    },
    fr: {
      greeting: 'Bonjour 👋',
      subGreeting: 'Comment puis-je vous aider aujourd\'hui?',
      inputPlaceholder: 'Demandez à Kodee n\'importe quoi...',
      send: 'Envoyer',
      errorMessage: 'Désolé, quelque chose s\'est mal passé. Veuillez réessayer.',
      thinking: 'Réfléchir...',
      linkOpening: 'Ouverture du lien...',
      linkError: 'Impossible d\'ouvrir le lien. Essayez manuellement:',
      noResults: 'Aucun résultat trouvé.',
      demoMode: '(Mode démo)'
    },
    de: {
      greeting: 'Hallo 👋',
      subGreeting: 'Wie kann ich Ihnen heute helfen?',
      inputPlaceholder: 'Fragen Sie Kodee etwas...',
      send: 'Senden',
      errorMessage: 'Entschuldigung, etwas ist schief gelaufen. Bitte versuchen Sie es erneut.',
      thinking: 'Denken...',
      linkOpening: 'Link öffnen...',
      linkError: 'Link konnte nicht geöffnet werden. Versuchen Sie es manuell:',
      noResults: 'Keine Ergebnisse gefunden.',
      demoMode: '(Demo-Modus)'
    }
  };

  // Main Chatbot Class
  class VogoChatbot {
    constructor() {
      this.currentLanguage = CONFIG.defaultLanguage;
      this.conversationStack = [];
      this.isOpen = false;
      
      this.init();
    }

    init() {
      this.injectCSS();
      this.injectHTML();
      this.cacheElements();
      this.setupEventListeners();
      this.showGreeting();
      this.loadInitialQuestions();
    }

    injectCSS() {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'chatbot.css';
      document.head.appendChild(link);
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
            <div>
              <h3>${CONFIG.botName}</h3>
              <div class="vogo-language-selector">
                <button data-lang="en">EN</button>
                <button data-lang="ro" class="active">RO</button>
                <button data-lang="it">IT</button>
                <button data-lang="fr">FR</button>
                <button data-lang="de">DE</button>
              </div>
            </div>
            <button class="close-btn">×</button>
          </div>

          <div class="vogo-chat-messages" id="vogo-messages"></div>

          <div class="vogo-chat-input">
            <input type="text" id="vogo-input" placeholder="${this.t('inputPlaceholder')}" />
            <button id="vogo-send">${this.t('send')}</button>
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
      this.closeBtn = document.querySelector('.close-btn');
      this.langButtons = document.querySelectorAll('.vogo-language-selector button');
    }

    setupEventListeners() {
      this.bubble.addEventListener('click', () => this.toggleChat());
      this.closeBtn.addEventListener('click', () => this.closeChat());
      this.sendBtn.addEventListener('click', () => this.sendMessage());
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });

      this.langButtons.forEach(btn => {
        btn.addEventListener('click', () => this.changeLanguage(btn.dataset.lang));
      });
    }

    t(key) {
      return TRANSLATIONS[this.currentLanguage][key] || key;
    }

    changeLanguage(lang) {
      this.currentLanguage = lang;
      
      this.langButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
      });

      this.input.placeholder = this.t('inputPlaceholder');
      this.sendBtn.textContent = this.t('send');
      
      this.clearMessages();
      this.showGreeting();
      this.loadInitialQuestions();
    }

    toggleChat() {
      this.isOpen ? this.closeChat() : this.openChat();
    }

    openChat() {
      this.window.classList.remove('hidden');
      this.isOpen = true;
      this.input.focus();
    }

    closeChat() {
      this.window.classList.add('hidden');
      this.isOpen = false;
    }

    showGreeting() {
      const greeting = document.createElement('div');
      greeting.className = 'vogo-bot-message';
      greeting.innerHTML = `<strong>${this.t('greeting')}</strong><br>${this.t('subGreeting')}`;
      this.messagesContainer.appendChild(greeting);
    }

    addUserMessage(text) {
      const message = document.createElement('div');
      message.className = 'vogo-user-message';
      message.textContent = text;
      this.messagesContainer.appendChild(message);
      this.scrollToBottom();
    }

    addBotMessage(text) {
      const message = document.createElement('div');
      message.className = 'vogo-bot-message';
      message.textContent = text;
      this.messagesContainer.appendChild(message);
      this.scrollToBottom();
    }

    addBotMessageHTML(html) {
      const message = document.createElement('div');
      message.className = 'vogo-bot-message';
      message.innerHTML = html;
      this.messagesContainer.appendChild(message);
      this.scrollToBottom();
    }

    showTypingIndicator() {
      const typing = document.createElement('div');
      typing.className = 'vogo-typing-indicator';
      typing.id = 'vogo-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      this.messagesContainer.appendChild(typing);
      this.scrollToBottom();
    }

    hideTypingIndicator() {
      const typing = document.getElementById('vogo-typing');
      if (typing) typing.remove();
    }

    showPredefinedQuestions(questions) {
      const container = document.createElement('div');
      container.className = 'vogo-predefined-questions';

      questions.forEach(q => {
        const btn = document.createElement('button');
        btn.className = 'vogo-question-btn';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
          <span>${q.text}</span>
        `;
        
        btn.addEventListener('click', () => this.handleQuestionClick(q));
        container.appendChild(btn);
      });

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    // ✅ FIXED: This now renders SHOPPING LIST search results (id/name/quantity/done)
    showSearchResults(results) {
      if (!results || results.length === 0) {
        this.addBotMessage(this.t('noResults'));
        return;
      }

      const container = document.createElement('div');
      container.className = 'vogo-search-results';

      results.slice(0, 5).forEach(item => {
        const name = item?.name ?? item?.item_name ?? item?.title ?? 'Item';
        const qty = item?.quantity ?? 1;
        const done = item?.done ?? item?.is_done ?? false;

        const resultDiv = document.createElement('div');
        resultDiv.className = 'vogo-search-item';

        // Show shopping list style
        resultDiv.innerHTML = `
          <strong>${name}</strong><br>
          <small>Shopping List • Qty: ${qty}${done ? ' • ✅' : ''}</small>
        `;

        container.appendChild(resultDiv);
      });

      this.messagesContainer.appendChild(container);
      this.scrollToBottom();
    }

    // FIX: Improved link handling
    buildFullUrl(link) {
      if (!link || link === 'null' || link === null) {
        return null;
      }

      const cleanLink = link.trim();
      
      // Already a full URL
      if (cleanLink.startsWith('http://') || cleanLink.startsWith('https://')) {
        return cleanLink;
      }

      // Relative URL - add base
      if (cleanLink.startsWith('/')) {
        return CONFIG.baseWebsiteUrl + cleanLink;
      }

      // No leading slash - add both base and slash
      return CONFIG.baseWebsiteUrl + '/' + cleanLink;
    }

    // FIX: Improved question click handler
    async handleQuestionClick(question) {
      console.log('🔍 Question clicked:', question);
      
      this.addUserMessage(question.text);
      this.showTypingIndicator();

      try {
        // Check if question has a link
        const fullUrl = this.buildFullUrl(question.link);
        
        if (fullUrl) {
          this.hideTypingIndicator();
          
          console.log('🔗 Opening URL:', fullUrl);
          
          // Show clickable link in chat
          this.addBotMessageHTML(
            `${this.t('linkOpening')}<br><a href="${fullUrl}" target="_blank" style="color: #667eea; text-decoration: underline; word-break: break-all;">${fullUrl}</a>`
          );
          
          // Try to open in new tab
          try {
            const opened = window.open(fullUrl, '_blank');
            
            // Check if popup was blocked
            if (!opened || opened.closed || typeof opened.closed === 'undefined') {
              this.addBotMessage(`${this.t('linkError')} ${fullUrl}`);
            }
          } catch (error) {
            console.error('Error opening link:', error);
            this.addBotMessage(`${this.t('linkError')} ${fullUrl}`);
          }
          
          return;
        }

        // No link, get sub-questions
        const response = await this.callAPI('getPredefinedQA', { parent_id: question.id });
        
        this.hideTypingIndicator();

        if (response.data && response.data.length > 0) {
          this.showPredefinedQuestions(response.data);
        } else {
          this.addBotMessage('Thank you for your question!');
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addBotMessage(this.t('errorMessage'));
        console.error('Error handling question:', error);
      }
    }

    async sendMessage() {
      const text = this.input.value.trim();
      if (!text) return;

      this.addUserMessage(text);
      this.input.value = '';

      this.showTypingIndicator();

      try {
        // Call NLP endpoint
        const response = await fetch(CONFIG.nlpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            language: this.currentLanguage
          })
        });

        const data = await response.json();
        
        this.hideTypingIndicator();

        if (data.success && data.result) {
          const result = data.result;

          // Show response
          this.addBotMessage(result.response);

          // Log matching info (for debugging)
          console.log(`🎯 Intent: ${result.intent} | Method: ${result.method} | Confidence: ${result.confidence}`);

          // Show action results
          if (data.action) {
            if (data.action.results && Array.isArray(data.action.results)) {
              // ✅ Search results (now shopping list matches)
              this.showSearchResults(data.action.results);

            } else if (data.action.items && Array.isArray(data.action.items)) {
              // ✅ Shopping list items (objects)
              const lines = data.action.items.map(i => {
                const name = i?.name ?? i?.item_name ?? 'Item';
                const qty = i?.quantity ?? 1;
                const done = i?.done ?? i?.is_done ?? false;
                return `• ${name} (Qty: ${qty})${done ? ' ✅' : ''}`;
              });
              this.addBotMessage(lines.length ? lines.join('\n') : this.t('noResults'));

            } else if (data.action.events && Array.isArray(data.action.events)) {
  const lines = data.action.events.map(e => {
    const name = e?.name ?? e?.event_name ?? 'Event';
    const dt = e?.datetime ?? e?.event_datetime ?? '';

    const dateOnly = dt ? String(dt).split(' ')[0] : '';
    return `• ${name}${dateOnly ? ` - ${dateOnly}` : ''}`;
  });

  this.addBotMessage(lines.length ? lines.join('\n') : this.t('noResults'));
}
 else if (data.action.message) {
              // Show generic action message
              const messageText = data.action.message;
              this.addBotMessage(messageText);
            }
          }
        } else {
          this.addBotMessage(this.t('errorMessage'));
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addBotMessage(this.t('errorMessage'));
        console.error('NLP Error:', error);
      }
    }

    async loadInitialQuestions() {
      this.showTypingIndicator();

      try {
        const response = await this.callAPI('getPredefinedQA', { parent_id: null });
        
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

      if (!response.ok) {
        throw new Error('API call failed');
      }

      return await response.json();
    }

    clearMessages() {
      this.messagesContainer.innerHTML = '';
    }

    scrollToBottom() {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new VogoChatbot());
  } else {
    new VogoChatbot();
  }

  // Make available globally
  window.VogoChatbot = VogoChatbot;
})();
