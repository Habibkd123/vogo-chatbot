// src/ui/chatbot.ui.js - Complete VOGO Chatbot UI with Icon Support

import I18n from '../i18n/translations.js';

class ChatbotUI {
  constructor(containerId, i18n, options = {}) {
    this.containerId = containerId;
    this.i18n = i18n;
    this.isOpen = false;
    this.messageHandlers = [];
    this.languageChangeHandler = null;
    this.markDoneUrl = options.markDoneUrl || '/api/mark-done';
    
    this.init();
  }

  init() {
    // Inject HTML
    this.injectHTML();
    
    // Get elements
    this.bubble = document.getElementById('vogo-chat-bubble');
    this.window = document.getElementById('vogo-chat-window');
    this.messagesContainer = document.getElementById('vogo-chat-messages');
    this.input = document.getElementById('vogo-input');
    this.sendBtn = document.getElementById('vogo-send-btn');
    this.closeBtn = document.getElementById('vogo-close-btn');
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup language selector
    this.setupLanguageSelector();
    
    // Show greeting
    this.showGreeting();
  }

  injectHTML() {
    const container = document.getElementById(this.containerId) || document.body;
    
    // Inject CSS
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'vogo-chatbot.css'; // Will be bundled
    document.head.appendChild(style);
    
    // Inject HTML structure with VOGO branding and icon
    const html = `
      <div id="vogo-chat-bubble">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.68-.33-3.83-.91l-.27-.15-2.98.51.51-2.98-.15-.27C4.33 14.68 4 13.38 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
        </svg>
      </div>

      <div id="vogo-chat-window" class="hidden">
        <div class="vogo-chat-header">
          <div class="vogo-header-content">
            <img src="/images/vogo-icon.png" alt="VOGO" class="vogo-header-icon" onerror="this.style.display='none'" />
            <div class="vogo-header-title">
              <h3 id="vogo-bot-name">VOGO</h3>
              <div class="vogo-status">Online</div>
            </div>
          </div>
          <div class="vogo-header-actions">
            <button class="close-btn" id="vogo-close-btn">×</button>
          </div>
        </div>

        <div class="vogo-chat-messages" id="vogo-chat-messages"></div>

        <div class="vogo-chat-input">
          <input 
            type="text" 
            id="vogo-input" 
            placeholder="${this.i18n.t('inputPlaceholder')}"
          />
          <button id="vogo-send-btn">${this.i18n.t('send')}</button>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', html);
  }

  setupEventListeners() {
    // Open/close chat
    this.bubble.addEventListener('click', () => this.toggleChat());
    this.closeBtn.addEventListener('click', () => this.closeChat());
    
    // Send message
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  setupLanguageSelector() {
    const selector = document.getElementById('vogo-language-selector');
    const languages = [
      { code: 'en', label: 'EN' },
      { code: 'ro', label: 'RO' },
      { code: 'it', label: 'IT' },
      { code: 'fr', label: 'FR' },
      { code: 'de', label: 'DE' },
      { code: 'es', label: 'ES' }
    ];

    languages.forEach(lang => {
      const btn = document.createElement('button');
      btn.textContent = lang.label;
      btn.dataset.lang = lang.code;
      
      if (lang.code === this.i18n.getCurrentLanguage()) {
        btn.classList.add('active');
      }
      
      btn.addEventListener('click', () => this.changeLanguage(lang.code));
      selector.appendChild(btn);
    });
  }

  changeLanguage(lang) {
    this.i18n.setLanguage(lang);
    
    // Update active button
    document.querySelectorAll('.vogo-language-selector button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // Update placeholder and button text
    this.input.placeholder = this.i18n.t('inputPlaceholder');
    this.sendBtn.textContent = this.i18n.t('send');
    
    // Notify listeners about language change
    this.notifyLanguageChange(lang);
  }

  toggleChat() {
    if (this.isOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
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
    const greeting = `
      <div class="vogo-bot-message-container">
        <img src="/images/vogo-icon.png" alt="VOGO" class="vogo-message-icon" onerror="this.style.display='none'" />
        <div class="vogo-bot-message">
          <strong>${this.i18n.t('greeting')}</strong><br>
          ${this.i18n.t('subGreeting')}
        </div>
      </div>
    `;
    this.messagesContainer.innerHTML = greeting;
  }

  addBotMessage(text) {
    const container = document.createElement('div');
    container.className = 'vogo-bot-message-container';
    
    // Add VOGO icon
    const icon = document.createElement('img');
    icon.src = '/images/vogo-icon.png';
    icon.alt = 'VOGO';
    icon.className = 'vogo-message-icon';
    icon.onerror = function() { this.style.display = 'none'; };
    container.appendChild(icon);
    
    // Add message
    const message = document.createElement('div');
    message.className = 'vogo-bot-message';
    message.textContent = text;
    container.appendChild(message);
    
    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }

  addUserMessage(text) {
    const message = document.createElement('div');
    message.className = 'vogo-user-message';
    message.textContent = text;
    this.messagesContainer.appendChild(message);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const container = document.createElement('div');
    container.className = 'vogo-typing-indicator-container';
    container.id = 'vogo-typing';
    
    // Add VOGO icon
    const icon = document.createElement('img');
    icon.src = '/images/vogo-icon.png';
    icon.alt = 'VOGO';
    icon.className = 'vogo-message-icon';
    icon.onerror = function() { this.style.display = 'none'; };
    container.appendChild(icon);
    
    // Add typing dots
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
      
      btn.addEventListener('click', () => {
        this.handleQuestionClick(q);
      });
      
      container.appendChild(btn);
    });

    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }

  handleQuestionClick(question) {
    // Add user message
    this.addUserMessage(question.text);
    
    // Notify message handlers
    this.messageHandlers.forEach(handler => {
      handler({ type: 'question', data: question });
    });
  }

  sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    // Add user message
    this.addUserMessage(text);
    
    // Clear input
    this.input.value = '';
    
    // Notify message handlers
    this.messageHandlers.forEach(handler => {
      handler({ type: 'text', data: { text } });
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  onLanguageChange(handler) {
    this.languageChangeHandler = handler;
  }

  notifyLanguageChange(lang) {
    if (this.languageChangeHandler) {
      this.languageChangeHandler(lang);
    }
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  clearMessages() {
    this.messagesContainer.innerHTML = '';
    this.showGreeting();
  }

  // ============================================================================
  // ✅ SEARCH RESULTS RENDERER (for shopping-list search and products)
  // This fixes "undefined / Product" cards by rendering correct fields.
  // ✅ UPDATED: Removed Qty from list display
  // ============================================================================

  showSearchResults(results = [], options = {}) {
    // results expected: [{ id, name, quantity, done }] or [{ id, item_name, ... }]
    // options can include labelText if you want
    const labelText = options.labelText || 'Shopping List';

    const container = document.createElement('div');
    container.className = 'vogo-predefined-questions'; // reuse existing styling

    if (!Array.isArray(results) || results.length === 0) {
      const msgContainer = document.createElement('div');
      msgContainer.className = 'vogo-bot-message-container';
      
      // Add icon
      const icon = document.createElement('img');
      icon.src = '/images/vogo-icon.png';
      icon.alt = 'VOGO';
      icon.className = 'vogo-message-icon';
      icon.onerror = function() { this.style.display = 'none'; };
      msgContainer.appendChild(icon);
      
      // Add message
      const msg = document.createElement('div');
      msg.className = 'vogo-bot-message';
      msg.textContent = options.emptyText || 'No items found.';
      msgContainer.appendChild(msg);
      
      this.messagesContainer.appendChild(msgContainer);
      this.scrollToBottom();
      return;
    }

    results.forEach(r => {
      const name = r?.name ?? r?.item_name ?? r?.title ?? 'Item';

      const btn = document.createElement('button');
      btn.className = 'vogo-question-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
        </svg>
        <span>
          <strong>${name}</strong><br/>
          <small>${labelText}</small>
        </span>
      `;

      // optional: clicking a result can re-add it or do nothing.
      btn.addEventListener('click', () => {
        // default: do nothing; keep for future features
      });

      container.appendChild(btn);
    });

    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }

  // ============================================================================
  // ✅ ADDITIONAL HELPER METHODS FOR PRODUCT CARDS
  // ============================================================================

  /**
   * Display product search results
   * @param {Array} products - Array of product objects
   */
  /**
   * Display product search results
   * - No "Product" category label
   * - Transparent background with white font
   * - "Open" opens on same page (not new tab), keeps chatbot open
   * - "Add to List" adds product to shopping list
   */
  showProductResults(products = []) {
    if (!Array.isArray(products) || products.length === 0) {
      this.addBotMessage('No products found.');
      return;
    }

    const container = document.createElement('div');
    container.className = 'vogo-product-results';

    products.forEach(product => {
      const item = document.createElement('div');
      item.className = 'vogo-product-item';

      const name = product.title || product.name || product.product_name || 'Product';
      const link = product.link || product.product_link || product.url || '';

      // Product name - no category/label line
      const nameEl = document.createElement('div');
      nameEl.className = 'vogo-product-name';
      nameEl.textContent = name;

      // Buttons row
      const btnRow = document.createElement('div');
      btnRow.className = 'vogo-product-btns';

      // Add to List button
      const addBtn = document.createElement('button');
      addBtn.className = 'vogo-product-btn vogo-product-btn--add';
      addBtn.textContent = 'Add to List';
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        addBtn.textContent = 'Adding...';
        try {
          await fetch('/api/chatbot-nlp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `add ${name} to my shopping list`, language: 'en' })
          });
          addBtn.textContent = 'Added!';
        } catch(e) {
          addBtn.textContent = 'Error';
          console.error('Add to list error:', e);
        }
      });

      // Open button - same page, keeps chatbot open
      const openBtn = document.createElement('button');
      openBtn.className = 'vogo-product-btn vogo-product-btn--open';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        if (link) window.location.href = link;
      });

      btnRow.appendChild(addBtn);
      if (link) btnRow.appendChild(openBtn);

      item.appendChild(nameEl);
      item.appendChild(btnRow);
      container.appendChild(item);
    });

    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }

  /**
   * Display shopping list items with numbered list, checkbox and markDone support
   * @param {Array} items - Array of shopping list items
   */
  showShoppingListItems(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      this.addBotMessage('Your shopping list is empty.');
      return;
    }

    const container = document.createElement('div');
    container.className = 'vogo-list-container';

    // Items count header
    const header = document.createElement('div');
    header.className = 'vogo-list-header';
    header.textContent = 'Items: ' + items.length;
    container.appendChild(header);

    items.forEach((item, index) => {
      const name = item.name || item.item_name || item.item_text || 'Item';
      const quantity = item.quantity || 1;
      const itemKey = 'vogo_shop_' + (item.id || name).toString().replace(/\s+/g, '_');
      // Trust the API's done state as source of truth
      // done_checked comes as string "0" or "1" from the API — must NOT use !! directly
      const parseDoneUI = v => v === 1 || v === true || v === '1' || v === 'true';
      const apiDone = parseDoneUI(item.done) || parseDoneUI(item.done_checked) ||
                      parseDoneUI(item.is_done) || parseDoneUI(item.completed);
      if (apiDone) {
        localStorage.setItem(itemKey, '1');
      } else {
        localStorage.removeItem(itemKey); // clear stale localStorage if API says not done
      }
      const isChecked = apiDone;

      const itemDiv = document.createElement('div');
      itemDiv.className = 'vogo-list-item' + (isChecked ? ' vogo-list-item--done' : '');

      // Number
      const numSpan = document.createElement('span');
      numSpan.className = 'vogo-item-number';
      numSpan.textContent = `${index + 1}.`;

      // Name (declared before checkbox listener)
      const nameSpan = document.createElement('span');
      nameSpan.className = 'vogo-item-name';
      nameSpan.textContent = name + (quantity > 1 ? ` (${quantity}x)` : '');

      // Checkbox - unchecked by default, restored from localStorage
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vogo-item-checkbox';
      checkbox.checked = isChecked;
      checkbox.title = 'Mark as done';
      checkbox.addEventListener('change', async () => {
        const itemId = item.id || item.item_id || item.list_id;
        if (checkbox.checked) {
          itemDiv.classList.add('vogo-list-item--done');
          localStorage.setItem(itemKey, '1');
          try {
            if (itemId) {
              await fetch(this.markDoneUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'shopping', id: itemId, action: 'mark' })
              });
            }
          } catch(e) { console.error('markDone error:', e); }
        } else {
          itemDiv.classList.remove('vogo-list-item--done');
          localStorage.removeItem(itemKey);
          try {
            if (itemId) {
              await fetch(this.markDoneUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'shopping', id: itemId, action: 'unmark' })
              });
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

  /**
   * Display agenda/calendar items with numbered list, checkbox and markDone support
   * @param {Array} events - Array of calendar events
   */
  showAgendaItems(events = []) {
    if (!Array.isArray(events) || events.length === 0) {
      this.addBotMessage('Your calendar is empty.');
      return;
    }

    const container = document.createElement('div');
    container.className = 'vogo-list-container';

    // Events count header
    const headerEl = document.createElement('div');
    headerEl.className = 'vogo-list-header';
    headerEl.textContent = 'Events: ' + events.length;
    container.appendChild(headerEl);

    events.forEach((event, index) => {
      const title = event.name || event.event || event.title || event.event_text || 'Event';
      const date = event.datetime || event.date || '';
      const eventKey = 'vogo_agenda_' + (event.id || title).toString().replace(/\s+/g, '_');
      // Trust the API's done state as source of truth
      // done_checked comes as string "0" or "1" from the API — must NOT use !! directly
      const parseDoneAgenda = v => v === 1 || v === true || v === '1' || v === 'true';
      const apiDone = parseDoneAgenda(event.done) || parseDoneAgenda(event.done_checked) ||
                      parseDoneAgenda(event.is_done) || parseDoneAgenda(event.completed);
      if (apiDone) {
        localStorage.setItem(eventKey, '1');
      } else {
        localStorage.removeItem(eventKey); // clear stale localStorage if API says not done
      }
      const isChecked = apiDone;

      const eventDiv = document.createElement('div');
      eventDiv.className = 'vogo-list-item' + (isChecked ? ' vogo-list-item--done' : '');

      // Number
      const numSpan = document.createElement('span');
      numSpan.className = 'vogo-item-number';
      numSpan.textContent = `${index + 1}.`;

      // Title (declared before checkbox listener)
      const titleSpan = document.createElement('span');
      titleSpan.className = 'vogo-item-name';
      titleSpan.textContent = title;

      // Checkbox - unchecked by default, restored from localStorage
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vogo-item-checkbox';
      checkbox.checked = isChecked;
      checkbox.title = 'Mark as done';
      checkbox.addEventListener('change', async () => {
        const eventId = event.id || event.event_id;
        if (checkbox.checked) {
          eventDiv.classList.add('vogo-list-item--done');
          localStorage.setItem(eventKey, '1');
          try {
            if (eventId) {
              await fetch(this.markDoneUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'agenda', id: eventId, action: 'mark' })
              });
            }
          } catch(e) { console.error('markDone agenda error:', e); }
        } else {
          eventDiv.classList.remove('vogo-list-item--done');
          localStorage.removeItem(eventKey);
          try {
            if (eventId) {
              await fetch(this.markDoneUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'agenda', id: eventId, action: 'unmark' })
              });
            }
          } catch(e) { console.error('unmarkDone agenda error:', e); }
        }
      });

      // Date
      const dateSpan = document.createElement('span');
      dateSpan.className = 'vogo-item-date';
      dateSpan.textContent = date ? date.split(' ')[0] : '';

      eventDiv.appendChild(checkbox);
      eventDiv.appendChild(numSpan);
      eventDiv.appendChild(titleSpan);
      if (date) eventDiv.appendChild(dateSpan);
      container.appendChild(eventDiv);
    });

    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }

  /**
   * Add a bot message with HTML content
   * @param {string} html - HTML content to display
   */
  addBotMessageHTML(html) {
    const container = document.createElement('div');
    container.className = 'vogo-bot-message-container';
    
    // Add VOGO icon
    const icon = document.createElement('img');
    icon.src = '/images/vogo-icon.png';
    icon.alt = 'VOGO';
    icon.className = 'vogo-message-icon';
    icon.onerror = function() { this.style.display = 'none'; };
    container.appendChild(icon);
    
    // Add message
    const message = document.createElement('div');
    message.className = 'vogo-bot-message';
    message.innerHTML = html;
    container.appendChild(message);
    
    this.messagesContainer.appendChild(container);
    this.scrollToBottom();
  }
}

export default ChatbotUI;