// server/services/intent_disambiguator.js
// Helps clarify ambiguous user intents

class IntentDisambiguator {
  constructor() {
    // Keywords that can indicate multiple intents
    this.ambiguousKeywords = {
      'add': ['shopping_list_add', 'agenda_add'],
      'show': ['shopping_list_show', 'agenda_show'],
      'view': ['shopping_list_show', 'agenda_show'],
      'list': ['shopping_list_show', 'shopping_list_add'],
      'calendar': ['agenda_show', 'agenda_add'],
      'agenda': ['agenda_show', 'agenda_add'],
      'my': ['shopping_list_show', 'agenda_show'],
      
      // Romanian
      'adauga': ['shopping_list_add', 'agenda_add'],
      'adaugă': ['shopping_list_add', 'agenda_add'],
      'arata': ['shopping_list_show', 'agenda_show'],
      'arată': ['shopping_list_show', 'agenda_show'],
      'lista': ['shopping_list_show', 'shopping_list_add'],
      'listă': ['shopping_list_show', 'shopping_list_add']
    };
    
    // Context clues for disambiguation
    this.contextClues = {
      shopping: [
        'buy', 'purchase', 'shop', 'store', 'supermarket', 'groceries',
        'milk', 'bread', 'food', 'cumpar', 'cumpăr', 'magazin', 'cumparaturi',
        'cumpărături', 'lapte', 'paine', 'pâine', 'mancare', 'mâncare'
      ],
      calendar: [
        'meeting', 'appointment', 'remind', 'reminder', 'event', 'schedule',
        'sedinta', 'ședință', 'intalnire', 'întâlnire', 'programare', 'eveniment',
        'aminteste', 'amintește', 'reminder', 'nu uita'
      ],
      search: [
        'find', 'search', 'looking for', 'where', 'locate', 'caut', 'cauta',
        'caută', 'gaseste', 'găsește', 'unde', 'caut'
      ]
    };
  }
  
  /**
   * Check if an intent needs disambiguation
   * @param {string} text - User input
   * @param {string} intent - Classified intent
   * @param {number} confidence - Classification confidence
   * @returns {boolean} - True if disambiguation needed
   */
  needsDisambiguation(text, intent, confidence) {
    // Low confidence = needs clarification
    if (confidence < 0.4) {
      console.log(`⚠️ Low confidence (${confidence.toFixed(2)}), needs disambiguation`);
      return true;
    }
    
    // Medium confidence with ambiguous keywords
    if (confidence >= 0.4 && confidence < 0.7) {
      const words = text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (this.ambiguousKeywords[word]) {
          console.log(`⚠️ Ambiguous keyword "${word}" detected, needs disambiguation`);
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get intent suggestions based on context
   * @param {string} text - User input
   * @param {string} language - Language code
   * @returns {Array<{intent: string, confidence: number, reason: string}>} - Suggestions
   */
  getSuggestions(text, language = 'en') {
    const suggestions = [];
    const cleanText = text.toLowerCase();
    
    // Check for action keywords (show vs add)
    const isShowAction = /\b(show|view|see|display|check|open|arata|arată|vezi|afiseaza|afișează|deschide|ce am)\b/i.test(cleanText);
    const isAddAction = /\b(add|save|put|create|adauga|adaugă|salveaza|salvează|pune|baga|bagă)\b/i.test(cleanText);
    
    // Check for shopping context
    const hasShoppingContext = this.contextClues.shopping.some(clue => 
      cleanText.includes(clue.toLowerCase())
    );
    
    // Check for calendar context
    const hasCalendarContext = this.contextClues.calendar.some(clue => 
      cleanText.includes(clue.toLowerCase())
    );
    
    // Explicit list/calendar mention
    const mentionsList = /\b(list|lista|listă|shopping|cumparaturi|cumpărături|cart|cos|coș)\b/i.test(cleanText);
    const mentionsCalendar = /\b(calendar|agenda|agendă|schedule|program|events?|evenimente)\b/i.test(cleanText);
    
    // Build suggestions
    if (isShowAction) {
      if (mentionsList || hasShoppingContext) {
        suggestions.push({
          intent: 'shopping_list_show',
          confidence: 0.85,
          reason: 'Show action + shopping context detected'
        });
      }
      if (mentionsCalendar || hasCalendarContext) {
        suggestions.push({
          intent: 'agenda_show',
          confidence: 0.85,
          reason: 'Show action + calendar context detected'
        });
      }
      
      // If no specific context, suggest both
      if (!mentionsList && !mentionsCalendar && !hasShoppingContext && !hasCalendarContext) {
        suggestions.push({
          intent: 'shopping_list_show',
          confidence: 0.5,
          reason: 'Show action detected, no specific context'
        });
        suggestions.push({
          intent: 'agenda_show',
          confidence: 0.5,
          reason: 'Show action detected, no specific context'
        });
      }
    }
    
    if (isAddAction) {
      if (mentionsList || hasShoppingContext) {
        suggestions.push({
          intent: 'shopping_list_add',
          confidence: 0.85,
          reason: 'Add action + shopping context detected'
        });
      }
      if (mentionsCalendar || hasCalendarContext) {
        suggestions.push({
          intent: 'agenda_add',
          confidence: 0.85,
          reason: 'Add action + calendar context detected'
        });
      }
      
      // If no specific context, suggest both
      if (!mentionsList && !mentionsCalendar && !hasShoppingContext && !hasCalendarContext) {
        suggestions.push({
          intent: 'shopping_list_add',
          confidence: 0.5,
          reason: 'Add action detected, no specific context'
        });
        suggestions.push({
          intent: 'agenda_add',
          confidence: 0.5,
          reason: 'Add action detected, no specific context'
        });
      }
    }
    
    // Search intent
    if (this.contextClues.search.some(clue => cleanText.includes(clue.toLowerCase()))) {
      suggestions.push({
        intent: 'search_product',
        confidence: 0.75,
        reason: 'Search keywords detected'
      });
    }
    
    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Generate clarification message
   * @param {Array} suggestions - Intent suggestions
   * @param {string} language - Language code
   * @returns {string} - Clarification message
   */
  generateClarificationMessage(suggestions, language = 'en') {
    const messages = {
      en: {
        prefix: "I'm not quite sure what you mean. Did you want to:",
        shopping_list_add: "Add items to your shopping list",
        shopping_list_show: "View your shopping list",
        agenda_add: "Add an event to your calendar",
        agenda_show: "View your calendar",
        search_product: "Search for products",
        suffix: "Please clarify your request."
      },
      ro: {
        prefix: "Nu sunt sigur ce vrei să faci. Doreai să:",
        shopping_list_add: "Adaugi articole în lista de cumpărături",
        shopping_list_show: "Vezi lista de cumpărături",
        agenda_add: "Adaugi un eveniment în calendar",
        agenda_show: "Vezi calendarul",
        search_product: "Cauți produse",
        suffix: "Te rog clarifică cererea."
      }
    };
    
    const lang = messages[language] || messages.en;
    
    if (suggestions.length === 0) {
      return `${lang.prefix}\n• ${lang.shopping_list_add}\n• ${lang.shopping_list_show}\n• ${lang.agenda_add}\n• ${lang.agenda_show}\n• ${lang.search_product}`;
    }
    
    const options = suggestions
      .slice(0, 3) // Top 3 suggestions
      .map(s => `• ${lang[s.intent] || s.intent}`)
      .join('\n');
    
    return `${lang.prefix}\n${options}`;
  }
  
  /**
   * Resolve ambiguity using context and heuristics
   * @param {string} text - User input
   * @param {string} currentIntent - Current classified intent
   * @param {number} confidence - Classification confidence
   * @param {string} language - Language code
   * @returns {Object} - Resolution result
   */
  resolve(text, currentIntent, confidence, language = 'en') {
    console.log(`🔀 Disambiguating: "${text}" (${currentIntent}, ${confidence.toFixed(2)})`);
    
    const suggestions = this.getSuggestions(text, language);
    
    // If we have a high-confidence suggestion that differs from current intent
    if (suggestions.length > 0 && suggestions[0].confidence > confidence + 0.2) {
      console.log(`✅ Resolved to: ${suggestions[0].intent} (${suggestions[0].confidence.toFixed(2)})`);
      return {
        needsClarification: false,
        resolvedIntent: suggestions[0].intent,
        confidence: suggestions[0].confidence,
        reason: suggestions[0].reason
      };
    }
    
    // If we have multiple similar-confidence suggestions, ask for clarification
    if (suggestions.length > 1 && 
        suggestions[0].confidence - suggestions[1].confidence < 0.2) {
      console.log(`❓ Needs clarification - multiple similar suggestions`);
      return {
        needsClarification: true,
        suggestions: suggestions.slice(0, 3),
        message: this.generateClarificationMessage(suggestions, language)
      };
    }
    
    // Low confidence and no strong suggestions = ask for clarification
    if (confidence < 0.4) {
      console.log(`❓ Needs clarification - low confidence`);
      return {
        needsClarification: true,
        suggestions: suggestions.slice(0, 3),
        message: this.generateClarificationMessage(suggestions, language)
      };
    }
    
    // Otherwise, use current intent
    console.log(`✅ Using current intent: ${currentIntent}`);
    return {
      needsClarification: false,
      resolvedIntent: currentIntent,
      confidence: confidence,
      reason: 'Sufficient confidence in current intent'
    };
  }
}

module.exports = new IntentDisambiguator();