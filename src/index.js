// src/index.js - Main entry point

import VogoChatbot from './core/chatbot.js';
import './ui/chatbot.css';

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
  // Check if auto-init is enabled
  const script = document.currentScript || document.querySelector('script[src*="vogo-chatbot"]');
  const autoInit = script?.getAttribute('data-auto-init') !== 'false';

  if (autoInit) {
    new VogoChatbot({
      containerId: 'vogo-chatbot-root',
      language: script?.getAttribute('data-lang') || 'en',
      proxyUrl: script?.getAttribute('data-proxy-url') || 'http://localhost:3000/api/chatbot'
    });
  }
});

// Export for manual initialization
export default VogoChatbot;