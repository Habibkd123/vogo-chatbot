// server/services/spell_checker.js
// Spell correction and fuzzy matching for chatbot queries

class SpellChecker {
  constructor() {
    // Common misspellings database
    this.commonCorrections = {
      // English
      'recoomandations': 'recommendations',
      'recomendations': 'recommendations',
      'recommandations': 'recommendations',
      'recomandations': 'recommendations',
      'reccomendations': 'recommendations',
      'recomendation': 'recommendation',
      'recommandation': 'recommendation',
      'pizzza': 'pizza',
      'burgger': 'burger',
      'chiken': 'chicken',
      'chesse': 'cheese',
      'tomorow': 'tomorrow',
      'calender': 'calendar',
      'shoping': 'shopping',
      'shooping': 'shopping',
      
      // Romanian
      'cumparaturi': 'cumpărături',
      'intalnire': 'întâlnire',
      'mancare': 'mâncare',
      'paine': 'pâine',
      'branza': 'brânză',
      'cumpar': 'cumpăr',
      'adauga': 'adaugă',
      'arata': 'arată',
      'afiseaza': 'afișează',
      'cauta': 'caută',
      'gaseste': 'găsește',
      
      // Italian
      'ciao': 'ciao',
      'grazie': 'grazie',
      
      // Food items
      'bred': 'bread',
      'milck': 'milk',
      'cofee': 'coffee',
      'coffe': 'coffee',
      'tee': 'tea'
    };
    
    // Common food keywords for fuzzy matching
    this.foodKeywords = [
      // English
      'food', 'pizza', 'burger', 'pasta', 'bread', 'milk', 'cheese',
      'chicken', 'beef', 'fish', 'rice', 'vegetables', 'fruits',
      'recommendations', 'apple', 'banana', 'orange', 'meat',
      'eggs', 'butter', 'yogurt', 'juice', 'water', 'coffee', 'tea',
      
      // Romanian
      'mâncare', 'lapte', 'pâine', 'brânză', 'ouă', 'carne',
      'legume', 'fructe', 'apă', 'suc', 'cafea', 'ceai',
      
      // Italian
      'cibo', 'latte', 'pane', 'formaggio', 'uova', 'carne',
      
      // French
      'nourriture', 'lait', 'pain', 'fromage', 'œufs', 'viande',
      
      // German
      'essen', 'milch', 'brot', 'käse', 'eier', 'fleisch'
    ];
    
    // Product categories
    this.productCategories = [
      'food', 'drinks', 'snacks', 'groceries', 'dairy', 'produce',
      'meat', 'seafood', 'bakery', 'beverages', 'frozen'
    ];
  }
  
  /**
   * Apply spell correction to text
   * @param {string} text - Input text
   * @returns {string} - Corrected text
   */
  correctSpelling(text) {
    let corrected = text.toLowerCase();
    
    // Apply known corrections
    for (const [wrong, right] of Object.entries(this.commonCorrections)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      corrected = corrected.replace(regex, right);
    }
    
    return corrected;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} - Edit distance
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  /**
   * Find fuzzy matches for a word in a keyword list
   * @param {string} word - Word to match
   * @param {Array<string>} keywords - List of keywords
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Array<{keyword: string, similarity: number}>} - Sorted matches
   */
  fuzzyMatch(word, keywords = null, threshold = 0.7) {
    const keywordList = keywords || this.foodKeywords;
    const matches = [];
    
    const wordLower = word.toLowerCase();
    
    for (const keyword of keywordList) {
      const keywordLower = keyword.toLowerCase();
      
      // Exact match
      if (wordLower === keywordLower) {
        matches.push({ keyword, similarity: 1.0 });
        continue;
      }
      
      // Substring match
      if (wordLower.includes(keywordLower) || keywordLower.includes(wordLower)) {
        const lengthRatio = Math.min(wordLower.length, keywordLower.length) / 
                           Math.max(wordLower.length, keywordLower.length);
        matches.push({ keyword, similarity: 0.9 * lengthRatio });
        continue;
      }
      
      // Levenshtein distance
      const distance = this.levenshteinDistance(wordLower, keywordLower);
      const maxLen = Math.max(wordLower.length, keywordLower.length);
      const similarity = 1 - distance / maxLen;
      
      if (similarity >= threshold) {
        matches.push({ keyword, similarity });
      }
    }
    
    // Sort by similarity (descending)
    return matches.sort((a, b) => b.similarity - a.similarity);
  }
  
  /**
   * Extract best search term from text
   * @param {string} text - Input text
   * @param {string} language - Language code
   * @returns {string} - Best search term
   */
  extractSearchTerm(text, language = 'en') {
    // First apply spell correction
    const corrected = this.correctSpelling(text);
    
    // Remove common filler words
    const fillers = [
      'i', 'want', 'to', 'eat', 'some', 'a', 'an', 'the', 'found', 'please',
      'find', 'search', 'for', 'looking', 'need', 'get', 'me', 'my',
      'vreau', 'sa', 'de', 'un', 'o', 'niste', 'ceva', 'caut', 'gaseste',
      'gasesc', 'am', 'nevoie'
    ];
    
    const words = corrected.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !fillers.includes(w));
    
    // Try to find food-related keywords
    for (const word of words) {
      const matches = this.fuzzyMatch(word, this.foodKeywords, 0.6);
      if (matches.length > 0) {
        console.log(`🔍 Spell checker found match: "${word}" → "${matches[0].keyword}" (${(matches[0].similarity * 100).toFixed(0)}%)`);
        return matches[0].keyword;
      }
    }
    
    // Return last meaningful word if no food keyword found
    return words.length > 0 ? words[words.length - 1] : 'product';
  }
  
  /**
   * Check if text contains food-related keywords
   * @param {string} text - Input text
   * @returns {boolean} - True if food-related
   */
  isFoodRelated(text) {
    const lowerText = text.toLowerCase();
    const foodIndicators = [
      'food', 'eat', 'hungry', 'meal', 'lunch', 'dinner', 'breakfast',
      'snack', 'drink', 'mâncare', 'mancare', 'masa', 'mic dejun',
      'pranz', 'cina', 'gustare', 'cibo', 'mangiare', 'pasto'
    ];
    
    return foodIndicators.some(indicator => lowerText.includes(indicator));
  }
  
  /**
   * Suggest corrections for a query
   * @param {string} query - Search query
   * @returns {Object} - Suggestions
   */
  suggestCorrections(query) {
    const corrected = this.correctSpelling(query);
    const suggestions = {
      original: query,
      corrected: corrected,
      hasCorrectionchanges: corrected !== query.toLowerCase(),
      fuzzyMatches: []
    };
    
    // Find fuzzy matches for each word
    const words = query.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3) {
        const matches = this.fuzzyMatch(word, this.foodKeywords, 0.6);
        if (matches.length > 0 && matches[0].similarity < 1.0) {
          suggestions.fuzzyMatches.push({
            original: word,
            suggestion: matches[0].keyword,
            confidence: matches[0].similarity
          });
        }
      }
    }
    
    return suggestions;
  }
}

module.exports = new SpellChecker();