// src/config/chatbot.config.js

const config = {
  api: {
    baseUrl: 'https://vogo.family/wp-json/vogo/v1',
    endpoints: {
      login: '/public/login_jwt/',
      predefinedQA: '/predefined_qa',
      searchKeyword: '/search_by_keyword',
      shopListAdd: '/shopListAddItem',
      shopListShow: '/shopListShowUserItems',
      agendaAdd: '/agendaAddItem',
      agendaShow: '/agendaShowUserItems'
    }
  },
  
  ui: {
    botName: 'VOGO',
    position: 'bottom-right',
    theme: 'purple',
    defaultMessage: 'Hello 👋 How can I help you today?'
  },
  
  languages: {
    default: 'en',
    supported: ['en', 'ro', 'it', 'fr', 'de'],
    autoDetect: true
  },
  
  security: {
    useProxy: true, // Always use backend proxy
    proxyUrl: 'http://localhost:3000/api/chatbot'
  }
};

module.exports = config;