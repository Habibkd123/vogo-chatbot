// src/core/chatbot.js

import APIService from '../services/api.service.js';
import ChatbotRouter from './router.js';
import ChatbotUI from '../ui/chatbot.ui.js';
import I18n from '../i18n/translations.js';
import config from '../config/chatbot.config.js';

class VogoChatbot {
  constructor(options = {}) {
    this.options = {
      containerId: options.containerId || 'vogo-chatbot-container',
      language: options.language || config.languages.default,
      proxyUrl: options.proxyUrl || config.security.proxyUrl,
      ...options
    };

    this.init();
  }

  async init() {
    try {
      // Initialize i18n
      this.i18n = new I18n(this.options.language);

      // Initialize UI
      this.ui = new ChatbotUI(this.options.containerId, this.i18n);

      // Initialize API service
      this.apiService = new APIService(this.options.proxyUrl);

      // Initialize router
      this.router = new ChatbotRouter(this.apiService);

      // Setup message handler
      this.ui.onMessage(async (message) => {
        await this.handleMessage(message);
      });

      // Setup language change handler
      this.ui.onLanguageChange(async (lang) => {
        await this.handleLanguageChange(lang);
      });

      // Load initial questions
      await this.loadInitialQuestions();

      console.log('✅ Vogo Chatbot initialized successfully');
    } catch (error) {
      console.error('❌ Chatbot initialization failed:', error);
    }
  }

  async loadInitialQuestions() {
    try {
      this.ui.showTypingIndicator();

      const questions = await this.router.getInitialQuestions();

      this.ui.hideTypingIndicator();
      this.ui.showPredefinedQuestions(questions);
    } catch (error) {
      this.ui.hideTypingIndicator();
      this.ui.addBotMessage(this.i18n.t('errorMessage'));
      console.error('Error loading initial questions:', error);
    }
  }

  // ✅ NEW helper: render action results (shopping-list search, etc.)
  renderActionIfAny(response) {
    // 1) If router passes action directly
    const action = response?.action;

    // 2) Some routers may wrap as response.data
    const action2 = response?.data?.action;

    const finalAction = action || action2;

    // We only care about results array for list-search right now
    const results = finalAction?.results;

    if (Array.isArray(results)) {
      // Render shopping list matches using UI helper
      if (typeof this.ui.showSearchResults === 'function') {
        this.ui.showSearchResults(results, {
          labelText: 'Shopping List',
          emptyText: 'No items found in your shopping list.'
        });
      } else {
        // Fallback if UI helper not present (won't show undefined)
        const lines = results.map(r => {
          const name = r?.name ?? r?.item_name ?? 'Item';
          const qty = r?.quantity ?? 1;
          return `• ${name} (Qty: ${qty})`;
        });
        this.ui.addBotMessage(lines.length ? lines.join('\n') : 'No items found in your shopping list.');
      }
    }
  }

  async handleMessage(message) {
    this.ui.showTypingIndicator();

    try {
      const response = await this.router.handleMessage(message);

      this.ui.hideTypingIndicator();

      switch (response.type) {
        case 'questions':
          this.ui.showPredefinedQuestions(response.questions);
          break;

        case 'text':
          // ✅ Show text reply
          this.ui.addBotMessage(response.text);

          // ✅ IMPORTANT: If backend returned action.results (shopping list search),
          // render them below the message
          this.renderActionIfAny(response);
          break;

        case 'link':
          this.ui.addBotMessage(`Opening: ${response.link}`);
          // Open link in new tab
          window.open(response.link, '_blank');
          break;

        case 'error':
          this.ui.addBotMessage(response.message);
          break;

        default:
          // ✅ Safe fallback: show text if present, then action results
          if (response?.text) this.ui.addBotMessage(response.text);
          this.renderActionIfAny(response);
          break;
      }
    } catch (error) {
      this.ui.hideTypingIndicator();
      this.ui.addBotMessage(this.i18n.t('errorMessage'));
      console.error('Message handling error:', error);
    }
  }

  async handleLanguageChange(lang) {
    // Reload initial questions in new language
    this.ui.clearMessages();
    await this.loadInitialQuestions();
  }

  // Public API
  open() {
    this.ui.openChat();
  }

  close() {
    this.ui.closeChat();
  }

  destroy() {
    // Cleanup
    if (this.ui) {
      this.ui.clearMessages();
    }
    console.log('Chatbot destroyed');
  }
}

// Make available globally
window.VogoChatbot = VogoChatbot;

export default VogoChatbot;
