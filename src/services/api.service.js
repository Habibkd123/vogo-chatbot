// src/services/api.service.js

class APIService {
  constructor(proxyUrl) {
    this.proxyUrl = proxyUrl;
  }

  // Generic API call method
  async call(action, data = {}) {
    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call failed [${action}]:`, error);
      throw error;
    }
  }

  // Get predefined questions
  async getPredefinedQuestions(parentId = null) {
    return this.call('getPredefinedQA', { parent_id: parentId });
  }

  // Search by keyword
  async searchByKeyword(searchText, location = '') {
    return this.call('searchKeyword', { searchText, location });
  }

  // Add to shopping list
  async addToShoppingList(item) {
    return this.call('shopListAdd', item);
  }

  // Add to agenda
  async addToAgenda(event) {
    return this.call('agendaAdd', event);
  }
}

// Export for use in other files
export default APIService;