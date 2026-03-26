// src/core/router.js

class ChatbotRouter {
  constructor(apiService) {
    this.apiService = apiService;
    this.conversationStack = []; // Track navigation history
  }

  async handleMessage(message) {
    const { type, data } = message;

    try {
      if (type === 'question') {
        // Handle predefined question click
        return await this.handlePredefinedQuestion(data);
      } else if (type === 'text') {
        // Handle free text input
        return await this.handleFreeText(data.text);
      }
    } catch (error) {
      console.error('Router error:', error);
      return {
        type: 'error',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  async handlePredefinedQuestion(question) {
    // Add to navigation stack
    this.conversationStack.push(question);

    // If question has a link, return it
    if (question.link && question.link !== 'null') {
      return {
        type: 'link',
        text: question.text,
        link: question.link
      };
    }

    // Otherwise, get sub-questions
    const subQuestions = await this.apiService.getPredefinedQuestions(question.id);

    if (subQuestions && subQuestions.data && subQuestions.data.length > 0) {
      return {
        type: 'questions',
        questions: subQuestions.data
      };
    } else {
      // No sub-questions, show answer if available
      return {
        type: 'text',
        text: question.answer || 'Thank you for your question!'
      };
    }
  }

  async handleFreeText(text) {
    // Phase B implementation (NLP routing)
    // For Phase A POC, we'll return a simple response
    
    // TODO: Implement routing order:
    // 1. Check predefined QA match
    // 2. Check regex patterns
    // 3. Search by keyword
    // 4. Use NLP
    // 5. Use LLM (VIP only)
    // 6. Fallback

    return {
      type: 'text',
      text: 'Free text handling will be implemented in Phase B. For now, please select from the options above.'
    };
  }

  async getInitialQuestions() {
    const response = await this.apiService.getPredefinedQuestions(null);
    return response.data || [];
  }

  clearHistory() {
    this.conversationStack = [];
  }
}

export default ChatbotRouter;