// =============================================================================
// server/nlp_service.js - PROPER AI CHATBOT - Memory + Context + Better NLP
// Enhanced with comprehensive multilingual detection
// Step 5: Groq LLM fallback added for intelligent conversational responses
// =============================================================================

const { NlpManager } = require('node-nlp');
const nlp = require('compromise');
const fs = require('fs');
const path = require('path');
const groqService = require('./groq_service');
const aiService   = require('./ai_service');

class NLPService {
 constructor() {
 this.manager = new NlpManager({ 
 languages: ['en', 'ro', 'it', 'fr', 'de', 'es', 'pt', 'nl', 'pl', 'ru'],
 forceNER: true
 });
 this.rules = [];
 this.initialized = false;
 this.conversationLogs = [];
 
 // Conversation memory and context
 this.conversationHistory = [];
 this.currentLanguage = 'en'; // Default to English
 this.userPreferences = {
 preferredLanguage: 'en',
 lastIntent: null,
 lastEntity: null
 };
 this.currentUserRole = 'general'; // set per-request from JWT role

 // =========================================================================
 // COMPREHENSIVE LANGUAGE DETECTION DICTIONARIES
 // =========================================================================
 
 // Romanian phrases and words
 this.romanianPhrases = [
 // Greetings
 'salut', 'buna', 'bun', 'buna ziua', 'bun ziua', 'buna seara', 'bun seara',
 'buna dimineata', 'bun dimineaa', 'neata', 'servus', 'salutare', 'ce faci',
 'ce mai faci', 'noroc', 'pa', 'la revedere', 'pe curand', 'pe curÃ¢nd',
 // Thanks
 'multumesc', 'mulumesc', 'mersi', 'merci', 'multumiri', 'mulumiri', 'ms',
 'multumesc mult', 'mulumesc mult', 'multumesc frumos', 'mulumesc frumos',
 // Please/Requests
 'te rog', 'va rog', 'v rog', 'daca poti', 'dac poi', 'ai putea',
 // Common verbs
 'vreau', 'doresc', 'am nevoie', 'trebuie', 'pot', 'poti', 'poi',
 'adauga', 'adaug', 'sterge', 'terge', 'arata', 'arat', 'vezi',
 'cauta', 'caut', 'gaseste', 'gsete', 'pune', 'ia', 'cumpara', 'cumpr',
 // Shopping related
 'lista de cumparaturi', 'list de cumprturi', 'cos de cumparaturi', 
 'co de cumprturi', 'cumparaturi', 'cumprturi', 'magazin', 'piata', 'pia',
 // Calendar related
 'programare', 'intalnire', 'Ã®ntÃ¢lnire', 'eveniment',
 'aminteste', 'amintete', 'programeaza', 'programeaz', 'sedinta', 'edin',
 // Question words
 'ce', 'cine', 'unde', 'cand', 'cÃ¢nd', 'cum', 'cat', 'cÃ¢t', 'de ce', 'care',
 // Common words
 'si', 'i', 'sau', 'dar', 'pentru', 'de la', 'la', 'cu', 'fara', 'fr',
 'acum', 'azi', 'astazi', 'astzi', 'maine', 'mÃ¢ine', 'ieri', 'saptamana', 'sptmÃ¢na',
 'luna', 'an', 'ora', 'minut', 'secunda', 'secund',
 // Food items (commonly searched)
 'lapte', 'paine', 'pÃ¢ine', 'oua', 'ou', 'branza', 'brÃ¢nz', 'carne',
 'legume', 'fructe', 'apa', 'ap', 'suc', 'cafea', 'ceai'
 ];

 this.neutralSharedWords = [
 'pizza', 'pasta', 'coffee', 'tea', 'milk', 'bread', 'water', 'burger'
 ];

 // Italian phrases and words
 this.italianPhrases = [
 // Greetings
 'ciao', 'salve', 'buongiorno', 'buonasera', 'buonanotte', 'arrivederci',
 'a presto', 'addio', 'come stai', 'come sta', 'come va', 'tutto bene',
 // Thanks
 'grazie', 'grazie mille', 'grazie tante', 'ti ringrazio', 'la ringrazio',
 'molte grazie', 'grazie infinite',
 // Please/Requests
 'per favore', 'per piacere', 'prego', 'scusa', 'scusi', 'mi scusi',
 'potresti', 'potrebbe', 'puoi', 'puÃ²',
 // Common verbs
 'voglio', 'vorrei', 'desidero', 'ho bisogno', 'devo', 'posso',
 'aggiungi', 'aggiungere', 'rimuovi', 'rimuovere', 'mostra', 'mostrare',
 'cerca', 'cercare', 'trova', 'trovare', 'metti', 'mettere',
 // Shopping related
 'lista della spesa', 'carrello', 'spesa', 'comprare', 'acquistare',
 'negozio', 'supermercato', 'mercato',
 // Calendar related
 'calendario', 'appuntamento', 'riunione', 'evento',
 'ricordami', 'ricorda', 'promemoria', 'programma', 'programmato',
 // Question words
 'che', 'cosa', 'chi', 'dove', 'quando', 'come', 'quanto', 'perchÃ©', 'quale',
 // Common words
 'e', 'o', 'ma', 'per', 'da', 'a', 'con', 'senza', 'in', 'su',
 'oggi', 'domani', 'ieri', 'settimana', 'mese', 'anno', 'ora', 'minuto',
 // Food items
 'latte', 'pane', 'uova', 'formaggio', 'carne', 'verdure', 'frutta',
 'acqua', 'succo', 'caffÃ¨', 'tÃ¨', 'vino', 'birra', 'pasta', 'pizza'
 ];

 // French phrases and words
 this.frenchPhrases = [
 // Greetings
 'bonjour', 'bonsoir', 'bonne nuit', 'salut', 'coucou', 'au revoir',
 'Ã  bientÃ´t', 'a bientot', 'adieu', 'comment allez-vous', 'comment vas-tu',
 'Ã§a va', 'ca va', 'comment Ã§a va',
 // Thanks
 'merci', 'merci beaucoup', 'merci bien', 'je vous remercie', 'je te remercie',
 'mille mercis', 'un grand merci',
 // Please/Requests
 "s'il vous plaÃ®t", "s'il te plaÃ®t", 'sil vous plait', 'sil te plait',
 'svp', 'excusez-moi', 'excuse-moi', 'pardon',
 'pourriez-vous', 'pourrais-tu', 'pouvez-vous', 'peux-tu',
 // Common verbs
 'je veux', 'je voudrais', 'je dÃ©sire', "j'ai besoin", 'je dois', 'je peux',
 'ajouter', 'ajoute', 'supprimer', 'supprime', 'montrer', 'montre',
 'chercher', 'cherche', 'trouver', 'trouve', 'mettre', 'mets',
 // Shopping related
 'liste de courses', "liste d'achats", 'panier', 'courses', 'acheter',
 'magasin', 'supermarchÃ©', 'marchÃ©', 'Ã©picerie',
 // Calendar related
 'calendrier', 'rendez-vous', 'rÃ©union', 'Ã©vÃ©nement',
 'rappelle-moi', 'rappel', 'rappeler', 'programme', 'programmÃ©',
 // Question words
 'que', 'quoi', 'qui', 'oÃ¹', 'ou', 'quand', 'comment', 'combien', 'pourquoi', 'quel',
 // Common words
 'et', 'ou', 'mais', 'pour', 'de', 'Ã ', 'avec', 'sans', 'dans', 'sur',
 "aujourd'hui", 'demain', 'hier', 'semaine', 'mois', 'annÃ©e', 'an', 'heure', 'minute',
 // Food items
 'lait', 'pain', 'oeufs', 'ufs', 'fromage', 'viande', 'lÃ©gumes', 'fruits',
 'eau', 'jus', 'cafÃ©', 'thÃ©', 'vin', 'biÃ¨re'
 ];

 // German phrases and words
 this.germanPhrases = [
 // Greetings
 'hallo', 'guten tag', 'guten morgen', 'guten abend', 'gute nacht',
 'auf wiedersehen', 'tschÃ¼ss', 'tschuss', 'bis bald', 'servus', 'moin',
 'wie geht es ihnen', "wie geht's", 'wie gehts', 'alles gut',
 // Thanks
 'danke', 'danke schÃ¶n', 'danke schon', 'dankeschÃ¶n', 'vielen dank',
 'herzlichen dank', 'besten dank', 'ich danke ihnen', 'ich danke dir',
 // Please/Requests
 'bitte', 'bitte schÃ¶n', 'bitte schon', 'entschuldigung', 'entschuldigen sie',
 'kÃ¶nnten sie', 'kÃ¶nntest du', 'kÃ¶nnen sie', 'kannst du',
 // Common verbs
 'ich will', 'ich mÃ¶chte', 'ich brauche', 'ich muss', 'ich kann',
 'hinzufÃ¼gen', 'hinzufugen', 'entfernen', 'lÃ¶schen', 'loschen', 'zeigen',
 'suchen', 'finden', 'setzen', 'stellen', 'legen',
 // Shopping related
 'einkaufsliste', 'warenkorb', 'einkaufen', 'kaufen', 'einkauf',
 'geschÃ¤ft', 'geschaft', 'supermarkt', 'markt', 'laden',
 // Calendar related
 'kalender', 'terminkalender', 'termin', 'besprechung', 'ereignis',
 'erinnere mich', 'erinnerung', 'erinnern', 'planen', 'geplant',
 // Question words
 'was', 'wer', 'wo', 'wann', 'wie', 'wieviel', 'warum', 'welche', 'welcher',
 // Common words
 'und', 'oder', 'aber', 'fÃ¼r', 'fur', 'von', 'zu', 'mit', 'ohne', 'in', 'auf',
 'heute', 'morgen', 'gestern', 'woche', 'monat', 'jahr', 'stunde', 'minute',
 // Food items
 'milch', 'brot', 'eier', 'kÃ¤se', 'kase', 'fleisch', 'gemÃ¼se', 'gemuse', 'obst',
 'wasser', 'saft', 'kaffee', 'tee', 'wein', 'bier'
 ];

 // Spanish phrases and words
 this.spanishPhrases = [
 // Greetings
 'hola', 'buenos dÃ­as', 'buenos dias', 'buenas tardes', 'buenas noches',
 'adiÃ³s', 'adios', 'hasta luego', 'hasta pronto', 'cÃ³mo estÃ¡s', 'como estas',
 'quÃ© tal', 'que tal',
 // Thanks
 'gracias', 'muchas gracias', 'muchÃ­simas gracias', 'te agradezco', 'le agradezco',
 // Please/Requests
 'por favor', 'perdÃ³n', 'perdon', 'disculpe', 'disculpa',
 'podrÃ­as', 'podrias', 'podrÃ­a', 'podria', 'puedes', 'puede',
 // Common verbs
 'quiero', 'quisiera', 'necesito', 'tengo que', 'puedo',
 'aÃ±adir', 'anadir', 'agregar', 'eliminar', 'borrar', 'mostrar',
 'buscar', 'encontrar', 'poner',
 // Shopping related
 'lista de compras', 'carrito', 'compras', 'comprar',
 'tienda', 'supermercado', 'mercado',
 // Calendar related
 'calendario', 'cita', 'reuniÃ³n', 'reunion', 'evento',
 'recuÃ©rdame', 'recuerdame', 'recordatorio', 'recordar', 'programar',
 // Question words
 'quÃ©', 'que', 'quiÃ©n', 'quien', 'dÃ³nde', 'donde', 'cuÃ¡ndo', 'cuando',
 'cÃ³mo', 'como', 'cuÃ¡nto', 'cuanto', 'por quÃ©', 'cuÃ¡l', 'cual',
 // Common words
 'y', 'o', 'pero', 'para', 'de', 'a', 'con', 'sin', 'en', 'sobre',
 'hoy', 'maÃ±ana', 'manana', 'ayer', 'semana', 'mes', 'aÃ±o', 'ano', 'hora', 'minuto',
 // Food items
 'leche', 'pan', 'huevos', 'queso', 'carne', 'verduras', 'frutas',
 'agua', 'jugo', 'zumo', 'cafÃ©', 'cafe', 'tÃ©', 'te', 'vino', 'cerveza'
 ];

 // Portuguese phrases and words
 this.portuguesePhrases = [
 // Greetings
 'olÃ¡', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite',
 'adeus', 'tchau', 'atÃ© logo', 'ate logo', 'como vai', 'tudo bem',
 // Thanks
 'obrigado', 'obrigada', 'muito obrigado', 'muito obrigada', 'agradeÃ§o', 'agradeco',
 // Please/Requests
 'por favor', 'desculpe', 'desculpa', 'com licenÃ§a', 'com licenca',
 'poderia', 'pode', 'podes',
 // Common verbs
 'quero', 'gostaria', 'preciso', 'tenho que', 'posso',
 'adicionar', 'remover', 'apagar', 'mostrar',
 'procurar', 'buscar', 'encontrar', 'colocar',
 // Shopping related
 'lista de compras', 'carrinho', 'compras', 'comprar',
 'loja', 'supermercado', 'mercado',
 // Calendar related
 'calendÃ¡rio', 'calendario', 'compromisso', 'reuniÃ£o', 'reuniao', 'evento',
 'lembre-me', 'lembrete', 'lembrar', 'agendar',
 // Question words
 'o que', 'quem', 'onde', 'quando', 'como', 'quanto', 'por que', 'qual',
 // Common words
 'e', 'ou', 'mas', 'para', 'de', 'a', 'com', 'sem', 'em', 'sobre',
 'hoje', 'amanhÃ£', 'amanha', 'ontem', 'semana', 'mÃªs', 'mes', 'ano', 'hora', 'minuto'
 ];

 // Dutch phrases and words
 this.dutchPhrases = [
 // Greetings
 'hallo', 'hoi', 'goedemorgen', 'goedemiddag', 'goedenavond', 'goedenacht',
 'dag', 'doei', 'tot ziens', 'hoe gaat het',
 // Thanks
 'dank je', 'dank u', 'bedankt', 'heel erg bedankt', 'hartelijk dank',
 // Please/Requests
 'alstublieft', 'alsjeblieft', 'sorry', 'pardon', 'excuseer',
 'zou je', 'zou u', 'kun je', 'kunt u',
 // Common verbs
 'ik wil', 'ik zou graag', 'ik heb nodig', 'ik moet', 'ik kan',
 'toevoegen', 'verwijderen', 'tonen', 'laten zien',
 'zoeken', 'vinden', 'zetten',
 // Shopping related
 'boodschappenlijst', 'winkelwagen', 'boodschappen', 'kopen',
 'winkel', 'supermarkt', 'markt',
 // Calendar related
 'kalender', 'afspraak', 'vergadering', 'evenement',
 'herinner me', 'herinnering', 'plannen',
 // Common words
 'en', 'of', 'maar', 'voor', 'van', 'naar', 'met', 'zonder', 'in', 'op',
 'vandaag', 'morgen', 'gisteren', 'week', 'maand', 'jaar', 'uur', 'minuut'
 ];

 // Polish phrases and words
 this.polishPhrases = [
 // Greetings
 'cze', 'czesc', 'witaj', 'dzie dobry', 'dzien dobry', 'dobry wieczÃ³r',
 'dobry wieczor', 'dobranoc', 'do widzenia', 'pa', 'jak si masz',
 // Thanks
 'dzikuj', 'dziekuje', 'dziki', 'dzieki', 'bardzo dzikuj',
 // Please/Requests
 'prosz', 'prosze', 'przepraszam', 'wybacz',
 'czy mÃ³gby', 'czy mogby', 'czy moÅ¼esz',
 // Common verbs
 'chc', 'chce', 'chciabym', 'potrzebuj', 'potrzebuje', 'musz', 'musze', 'mog', 'moge',
 'dodaj', 'usu', 'usun', 'pokaÅ¼', 'pokaz',
 'szukaj', 'znajdÅº', 'znajdz',
 // Shopping related
 'lista zakupÃ³w', 'lista zakupow', 'koszyk', 'zakupy', 'kupi', 'kupic',
 'sklep', 'supermarket',
 // Calendar related
 'kalendarz', 'terminarz', 'spotkanie', 'wydarzenie',
 'przypomnij mi', 'przypomnienie',
 // Common words
 'i', 'lub', 'ale', 'dla', 'od', 'do', 'z', 'bez', 'w', 'na',
 'dzisiaj', 'jutro', 'wczoraj', 'tydzie', 'tydzien', 'miesic', 'miesiac', 'rok', 'godzina', 'minuta'
 ];

 // Russian phrases (transliterated)
 this.russianPhrases = [
 // Greetings (transliterated)
 'privet', 'zdravstvuyte', 'dobroe utro', 'dobryy den', 'dobryy vecher',
 'spokoynoy nochi', 'poka', 'do svidaniya', 'kak dela',
 // Thanks
 'spasibo', 'bolshoe spasibo', 'blagodaryu',
 // Please
 'pozhaluysta', 'izvinite', 'prostite',
 // Common words
 'da', 'net', 'khorosho', 'ya khochu', 'mne nuzhno',
 'dobavit', 'udalit', 'pokazat', 'iskat', 'nayti'
 ];

 // English common words (for positive detection)
 this.englishWords = [
 // Articles and pronouns
 'the', 'a', 'an', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
 // Common verbs
 'is', 'are', 'was', 'were', 'be', 'been', 'being',
 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
 'can', 'may', 'might', 'must', 'shall',
 'add', 'show', 'view', 'open', 'close', 'find', 'search', 'get', 'put',
 'want', 'need', 'like', 'make', 'take', 'give', 'know', 'think', 'see', 'look',
 // Prepositions
 'to', 'for', 'with', 'from', 'at', 'in', 'on', 'of', 'by', 'about',
 // Conjunctions
 'and', 'or', 'but', 'if', 'because', 'so', 'that', 'when', 'while',
 // Question words
 'what', 'where', 'when', 'why', 'how', 'who', 'which',
 // Common nouns
 'list', 'shopping', 'cart', 'calendar', 'agenda', 'schedule', 'event',
 'reminder', 'item', 'product', 'thing',
 // Common adjectives/adverbs
 'please', 'thanks', 'thank', 'hello', 'hi', 'hey', 'yes', 'no', 'okay', 'ok',
 'good', 'great', 'nice', 'new', 'also', 'just', 'now', 'today', 'tomorrow',
 // Greetings
 'morning', 'afternoon', 'evening', 'night', 'bye', 'goodbye'
 ];
 }

 // =========================================================================
 // HELPERS
 // =========================================================================

 escapeRegex(str) {
 return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 }

 // Whole-word/whole-phrase match to avoid false positives like "e" matching everything
 hasPhrase(textLower, phrase) {
 const p = String(phrase).trim().toLowerCase();
 if (!p) return false;
 // Ignore ultra-short phrases (1-2 chars)
 if (p.length < 3) return false;
 // Ignore neutral shared words so they don't bias language detection
 if (this.neutralSharedWords && this.neutralSharedWords.includes(p)) return false;
 const re = new RegExp(`\\b${this.escapeRegex(p)}\\b`, 'i');
 return re.test(textLower);
 }

 // Strong English signal
 isStrongEnglish(textLower) {
 return /\b(add|append|put|insert|include|save|show|view|see|display|please|thank|thanks|shopping|list|calendar|agenda|remind|search|find|delete|remove|complete|mark|from|my)\b/i.test(textLower);
 }

  // Force ADD > SHOW when both appear so "add milk to shopping list" never shows the list.
  // Also guards against calendar/day context being misrouted to shopping.
  enforceIntentPriority(text) {
  const t = String(text).toLowerCase();

  // TRANSFER TO HUMAN — check FIRST before any other intent
  // Catches: "put me through", "speak to human", "talk to operator", etc.
  if (/\b(put\s+me\s+through|speak\s+to\s+(human|operator|agent|person)|talk\s+to\s+(human|operator|agent|a\s+person)|human\s+operator|live\s+agent|real\s+person|customer\s+(service|support)|transfer\s+to\s+(human|agent)|vreau\s+(un\s+)?operator|vor(esc|besc)\s+cu\s+(un\s+)?operator|parlare\s+con\s+(un\s+)?operatore)\b/i.test(t)) {
    return 'transfer_to_human';
  }

  // Unmark detection — check BEFORE mark to avoid "unmark" being caught by mark pattern
 // Covers: "unmark X", "uncheck X", "mark X undone", "mark X as not done/complete", "undo mark X"
 const hasUnmark = /\b(unmark|un-mark|uncheck|un-check|undo\s+mark|clear\s+done|reset\s+done)\b/i.test(t) ||
                   /\bmark\b.+\b(undone|un-done|not\s+done|not\s+complete|not\s+bought|not\s+checked|incomplete)\b/i.test(t);
 if (hasUnmark) {
   const hasAgendaCtxU = /\b(calendar|agenda|event|appointment|meeting|schedule)\b/.test(t);
   const hasListCtxU   = /\b(shopping\s+list|grocery\s+list|list|cart)\b/.test(t);
   // If no explicit context, default to agenda (more common use case for named events)
   return (hasListCtxU && !hasAgendaCtxU) ? 'shopping_list_unmark_done' : 'agenda_unmark_done';
 }

 // Mark as done/complete — covers:
 //   "mark complete X", "mark done X", "mark X done", "mark X complete", "tick X", "set X as done"
 const hasMarkDone =
   /\b(mark|set|tick)\b.+\b(done|complete|completed|bought|checked|finished|off)\b/i.test(t) ||
   /\b(mark|set|tick)\s+(complete|done|finished)\s+\S/i.test(t); // "mark complete go to office"
 if (hasMarkDone) {
   const hasAgendaCtx = /\b(calendar|agenda|event|appointment|meeting|schedule)\b/.test(t);
   const hasListCtx   = /\b(shopping\s+list|grocery\s+list|list|cart)\b/.test(t);
   // If no explicit context, default to agenda
   return (hasListCtx && !hasAgendaCtx) ? 'shopping_list_mark_done' : 'agenda_mark_done';
 }

 const hasAdd = /\b(add|append|put|insert|include|save)\b/.test(t);
 const hasShow = /\b(show|view|see|display)\b/.test(t);
 const hasDelete = /\b(delete|remove|cancel|erase|clear)\b/.test(t);
 const hasShoppingList = /\b(shopping\s+list|grocery\s+list|list|cart)\b/.test(t);
 // Calendar/agenda keywords override shopping
 const hasCalendar = /\b(calendar|agenda|remind|schedule|event|appointment|meeting)\b/.test(t);
 // Day names = calendar event, not shopping item
 const hasDay = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next\s+week|next\s+month|after\s+\d|in\s+\d)\b/.test(t);

 // Force agenda intents when calendar/agenda context is present
 if (hasCalendar || hasDay) {
   if (hasDelete) return 'agenda_delete';
   if (hasAdd) return 'agenda_add';
   if (hasShow) return 'agenda_show';
   return null; // let NLP/Groq handle other calendar intents
 }

 // Force shopping add when explicit list/cart reference
 if (hasAdd && hasShoppingList) return 'shopping_list_add';
 if (hasShow && hasShoppingList && !hasAdd) return 'shopping_list_show';
 if (hasDelete && hasShoppingList) return 'shopping_list_delete';

 return null;
 }

 // Normalize input text before detection + intent matching
 normalizeText(text) {
 return String(text || '')
 .replace(/[\u201C\u201D]/g, '"') // smart quotes -> "
 .replace(/^[\s"'`]+|[\s"'`]+$/g, '') // trim spaces and surrounding quotes
 .trim();
 }

 // Sanitize search terms (fixes: pizza. pizza ? "pizza ?")
 sanitizeSearchTerm(term) {
 if (!term) return '';
 return String(term)
 .replace(/[\u201C\u201D]/g, '"')
 .replace(/["'`]/g, '')
 .replace(/\bfound\b/gi, '')
 .replace(/[.,!?;:(){}\[\]<>\\/|+=@#$%^&*_~]/g, ' ')
 .replace(/\s+/g, ' ')
 .trim()
 .toLowerCase();
 }

 // =========================================================================
 // GENERAL QUESTION DETECTOR
 // Returns true if the text looks like a general/conversational question
 // that should NOT be routed to the product search API.
 // =========================================================================
 isGeneralQuestion(text) {
 const t = text.toLowerCase().trim();
 // Damage / repair / service / fix patterns — NOT a product search
 if (/\b(fix|repair|broken|damaged|service|help me|how (do|can|to)|what (is|are|should)|i (need|want) (to|help)|problem|issue|trouble)\b/.test(t)) {
 // Only treat as general if there's no specific product/food term
 const hasSpecificProduct = /\b(pizza|burger|coffee|pasta|milk|bread|beer|wine|sushi|salad|cake|steak|chicken|fish|rice|fruits|vegetables|cola|juice|tea|sandwich|donut|cookie|chocolate|chips|snack|kebab|grill|bbq|bakery)\b/.test(t);
 if (!hasSpecificProduct) return true;
 }
 // Sentences that are clearly conversational/general
 if (/^(i want to|i need to|i would like to|can you|could you|please|help me)\s+(fix|repair|find out|know|understand|learn|get info|get help)\b/.test(t)) return true;
  return false;
  }

  // =========================================================================
  // SHOPPING LIST MISCLASSIFICATION DETECTOR
  // Returns true if the text looks like it should NOT be routed to shopping_list_add
  // =========================================================================
  isShoppingMisclassification(text) {
  const t = text.toLowerCase().trim();
  // Operator/transfer phrases — NEVER shopping
  if (/\b(put\s+me\s+through|speak\s+to\s+(human|operator|agent|person)|talk\s+to\s+(human|operator|agent|a\s+person)|human\s+operator|live\s+agent|real\s+person|customer\s+(service|support)|transfer\s+to\s+(human|agent)|vreau\s+(un\s+)?operator|vor(esc|besc)\s+cu\s+(un\s+)?operator|parlare\s+con\s+(un\s+)?operatore)\b/i.test(t)) {
    return true;
  }
  if (/\b(buy|purchase|order|get|need|want)\s+(pizza|burger|coffee|pasta|milk|bread|beer|wine|sushi|salad|cake|steak|chicken|fish|rice|fruits|vegetables|cola|juice|tea|sandwich|donut|cookie|chocolate|chips|snack|kebab|grill|bbq|bakery|restaurant|food)\b/.test(t)) {
  return false;
  }
  if (/\b(make|cook|prepare|recipe|how to)\b/.test(t)) return true;
  return false;
  }

  // =========================================================================
  // AGENDA MISCLASSIFICATION DETECTOR
  // Returns true if the text looks like it should NOT be routed to agenda_add
  // =========================================================================
  isAgendaMisclassification(text) {
  const t = text.toLowerCase().trim();
  if (/\b(remind|reminder|remember|schedule|appointment|meeting|call|todo|task)\b/.test(t)) {
  return false;
  }
  if (/\b(buy|purchase|order|get|need|want|eat|food|restaurant|recipe|cook|make)\b/.test(t)) {
  return true;
  }
  return false;
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
 async initialize() {
 if (this.initialized) return;

 console.log(' Initializing NLP Chatbot...');

 try {
 const dbPath = path.join(__dirname, 'nlp-database.json');
 
 if (!fs.existsSync(dbPath)) {
 throw new Error(`NLP database not found at ${dbPath}`);
 }

 const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
 this.rules = dbData.rules;
 console.log(` Loaded ${this.rules.length} NLP rules`);

 const trainingData = dbData.training_data;

 for (const [language, intents] of Object.entries(trainingData)) {
 for (const [intent, examples] of Object.entries(intents)) {
 for (const example of examples) {
 this.manager.addDocument(language, example, intent);
 }
 }
 }

 this.addAnswers();
 await this.manager.train();
 console.log(' NLP model trained successfully');

 this.initialized = true;
 } catch (error) {
 console.error(' NLP initialization failed:', error.message);
 throw error;
 }
 }

 addAnswers() {
 const languages = ['en', 'ro', 'it', 'fr', 'de', 'es', 'pt', 'nl', 'pl'];
 const intents = ['greeting', 'thanks', 'shopping_list_add', 'shopping_list_show', 
 'agenda_add', 'agenda_show', 'search_product'];

 languages.forEach(lang => {
 intents.forEach(intent => {
 const rule = this.rules.find(r => r.language === lang && r.intent === intent);
 if (rule && rule.response) {
 this.manager.addAnswer(lang, intent, rule.response);
 }
 });
 });
 }

 // =========================================================================
 // ENHANCED MULTILINGUAL LANGUAGE DETECTION
 // =========================================================================
 async detectLanguage(text) {
 if (!this.initialized) {
 await this.initialize();
 }

 try {
 const lowerText = text.toLowerCase().trim();
 const words = lowerText.split(/\s+/);

 // SHORT MESSAGE OVERRIDE "hi", "ok", "yes", "no" must not trigger PL/RO/etc.
 const compact = lowerText.replace(/[^a-z0-9]+/g, '');
 if (compact.length <= 3) {
 const map = { hi: 'en', hey: 'en', ok: 'en', yes: 'en', no: 'en', thx: 'en', pls: 'en' };
 if (map[compact]) {
 console.log(` Short input override: ${compact} -> ${map[compact]}`);
 return map[compact];
 }
 }

 // Score for each language
 const scores = { en: 0, ro: 0, it: 0, fr: 0, de: 0, es: 0, pt: 0, nl: 0, pl: 0, ru: 0 };

 // =====================================================================
 // STEP 1: Phrase matches (highest confidence)
 // Uses whole-word matching, ignores 1-2 letter phrases
 // =====================================================================
 const phraseMap = [
 ['ro', this.romanianPhrases],
 ['it', this.italianPhrases],
 ['fr', this.frenchPhrases],
 ['de', this.germanPhrases],
 ['es', this.spanishPhrases],
 ['pt', this.portuguesePhrases],
 ['nl', this.dutchPhrases],
 ['pl', this.polishPhrases],
 ['ru', this.russianPhrases]
 ];
 for (const [lang, phrases] of phraseMap) {
 for (const phrase of phrases) {
 if (this.hasPhrase(lowerText, phrase)) {
 scores[lang] += phrase.split(' ').length * 3; // weight by phrase length
 }
 }
 }

 // English words (lighter weight, but frequent)
 for (const word of words) {
 if (this.englishWords.includes(word)) {
 scores.en += 1;
 }
 }

 // Strong English signal bonus prevents EN text from flipping to IT/FR/etc.
 if (this.isStrongEnglish(lowerText)) {
 scores.en += 5;
 }

 // =====================================================================
 // STEP 2: Character patterns unique to each language
 // =====================================================================
 if (/[]/.test(text)) scores.ro += 5; // Romanian diacritics
 if (/[]/.test(text)) scores.fr += 3; // French accents
 if (/[]/.test(text)) scores.de += 5; // German umlauts
 if (/[]/.test(text)) scores.es += 5; // Spanish Ã±
 if (/[]/.test(text)) scores.pt += 5; // Portuguese nasal
 if (/[]/.test(text)) scores.pl += 5; // Polish chars

 // =====================================================================
 // STEP 3: Determine winner
 // =====================================================================
 let maxScore = 0;
 let detectedLang = 'en';
 
 for (const [lang, score] of Object.entries(scores)) {
 if (score > maxScore) {
 maxScore = score;
 detectedLang = lang;
 }
 }

 // If English looks strong, force English
 if (this.isStrongEnglish(lowerText) && scores.en >= 3) {
 detectedLang = 'en';
 maxScore = scores.en;
 }

 // If English has equal or higher score than others, prefer English
 if (scores.en >= maxScore && scores.en > 0) {
 detectedLang = 'en';
 }

 if (maxScore === 0) {
 detectedLang = 'en';
 console.log(` No language detected, defaulting to: ${detectedLang}`);
 } else {
 console.log(` Language detected: ${detectedLang} (score: ${maxScore})`);
 this.currentLanguage = detectedLang;
 if (maxScore >= 3) {
 this.userPreferences.preferredLanguage = detectedLang;
 }
 }

 return detectedLang;
 
 } catch (error) {
 console.error('Language detection error:', error);
 return 'en';
 }
 }

 // =========================================================================
 // ROUTING STEPS 2-4: Regex, Keywords, NLP
 // =========================================================================

 checkRegex(text, language) {
 const activeRules = this.rules
 .filter(r => r.active && r.language === language && r.regex)
 .sort((a, b) => b.priority - a.priority);

 for (const rule of activeRules) {
 try {
 const regex = new RegExp(rule.regex, 'i');
 if (regex.test(text)) {
 console.log(` REGEX match: ${rule.intent}`);
 this.logConversation('REGEX', text, rule.intent, 1.0, language);
 return {
 matched: true,
 intent: rule.intent,
 confidence: 1.0,
 method: 'regex',
 response: rule.response,
 rule_id: rule.id
 };
 }
 } catch (error) {
 console.error(`Invalid regex in rule ${rule.id}:`, error);
 }
 }
 return { matched: false };
 }

 checkKeywords(text, language) {
 const activeRules = this.rules
 .filter(r => r.active && r.language === language && r.keywords)
 .sort((a, b) => b.priority - a.priority);

 const lowerText = text.toLowerCase();

 for (const rule of activeRules) {
 const keywords = Array.isArray(rule.keywords) 
 ? rule.keywords 
 : rule.keywords.split(',').map(k => k.trim());

 for (const keyword of keywords) {
 const kw = keyword.toLowerCase().trim();
 // Whole-word boundary match — prevents "hi" matching inside "everything", "this", etc.
 const kwEscaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 const kwRegex = new RegExp(`\\b${kwEscaped}\\b`, 'i');
 if (kwRegex.test(lowerText)) {
 console.log(` KEYWORD match: ${rule.intent} (${keyword})`);
 this.logConversation('KEYWORD', text, rule.intent, 0.85, language);
 return {
 matched: true,
 intent: rule.intent,
 confidence: 0.85,
 method: 'keyword',
 response: rule.response,
 matched_keyword: keyword,
 rule_id: rule.id
 };
 }
 }
 }
 return { matched: false };
 }

 async detectIntent(text, language = 'en') {
 if (!this.initialized) {
 await this.initialize();
 }

 try {
 const result = await this.manager.process(language, text);

 if (result.intent && result.intent !== 'None' && result.score > 0.5) {
 console.log(` NLP match: ${result.intent} (confidence: ${result.score.toFixed(2)})`);
 this.logConversation('NLP', text, result.intent, result.score, language);
 this.userPreferences.lastIntent = result.intent;
 
 return {
 matched: true,
 intent: result.intent,
 confidence: result.score,
 method: 'nlp',
 response: result.answer || null,
 entities: result.entities || []
 };
 }
 } catch (error) {
 console.error('NLP detection error:', error);
 }

 return { matched: false };
 }

 // =========================================================================
 // HARD FALLBACK (Step 6 only reached if Groq is unavailable)
 // =========================================================================
 getFallbackResponse(language) {
 const fallbacks = {
 en: "I'm sorry, I didn't understand that. You can:\n Add items to your shopping list\n View your shopping list\n Search for products\n Add events to your calendar\n View your calendar",
 ro: "mi pare ru, nu am Ã®neles. Poi:\n Aduga produse Ã®n lista de cumprturi\n Vedea lista de cumprturi\n Cuta produse\n Aduga evenimente Ã®n calendar\n Vedea calendarul",
 it: "Mi dispiace, non ho capito. Puoi:\n Aggiungere articoli alla lista della spesa\n Vedere la lista della spesa\n Cercare prodotti\n Aggiungere eventi al calendario\n Vedere il calendario",
 fr: "Je suis dÃ©solÃ©, je n'ai pas compris. Vous pouvez:\n Ajouter des articles Ã  votre liste de courses\n Voir votre liste de courses\n Rechercher des produits\n Ajouter des Ã©vÃ©nements au calendrier\n Voir votre calendrier",
 de: "Es tut mir leid, das habe ich nicht verstanden. Sie kÃ¶nnen:\n Artikel zur Einkaufsliste hinzufÃ¼gen\n Ihre Einkaufsliste ansehen\n Produkte suchen\n Termine zum Kalender hinzufÃ¼gen\n Ihren Kalender ansehen",
 es: "Lo siento, no entendÃ­. Puedes:\n AÃ±adir artÃ­culos a tu lista de compras\n Ver tu lista de compras\n Buscar productos\n AÃ±adir eventos al calendario\n Ver tu calendario",
 pt: "Desculpe, nÃ£o entendi. VocÃª pode:\n Adicionar itens Ã  lista de compras\n Ver sua lista de compras\n Buscar produtos\n Adicionar eventos ao calendÃ¡rio\n Ver seu calendÃ¡rio",
 nl: "Sorry, ik begreep dat niet. Je kunt:\n Items toevoegen aan je boodschappenlijst\n Je boodschappenlijst bekijken\n Producten zoeken\n Evenementen aan de kalender toevoegen\n Je kalender bekijken",
 pl: "Przepraszam, nie zrozumiaem. MoÅ¼esz:\n Doda produkty do listy zakupÃ³w\n Zobacz list zakupÃ³w\n Szuka produktÃ³w\n Doda wydarzenia do kalendarza\n Zobacz kalendarz"
 };
 
 return {
 matched: false,
 intent: 'fallback',
 confidence: 0,
 method: 'fallback',
 response: fallbacks[language] || fallbacks.en
 };
 }

 // =========================================================================
 // SMART ROUTING PIPELINE
 //
 // OFFLINE FIRST (zero tokens):
 //   Step 1: Language detection (franc + dictionary + char patterns)
 //   Step 2: Regex  → handle clear action intents immediately
 //   Step 3: Keywords → handle clear action intents immediately
 //   Step 4: NLP model (confidence > 0.7) → handle clear action intents
 //
 // AI MODEL (role-aware):
 //   Step 5: ai_service → ai_groq / ai_openai / ai_gemini based on user role
 //
 // Step 6: Hard fallback
 // =========================================================================

 // Intents needing AI for a natural conversational response
 static get GROQ_REQUIRED_INTENTS() {
 return new Set([
 'conversational', 'general_knowledge', 'greeting', 'farewell',
 'small_talk', 'how_are_you', 'positive_feedback', 'negative_feedback',
 'help_capabilities', 'fallback', 'groq_llm', 'groq_local', 'user_connect'
 ]);
 }

  // Intents offline handles perfectly — no AI needed
  static get OFFLINE_CONFIDENT_INTENTS() {
  return new Set([
  'shopping_list_add', 'shopping_list_show', 'shopping_list_delete',
  'shopping_list_mark_done', 'shopping_list_unmark_done',
  'agenda_add', 'agenda_show', 'agenda_delete',
  'agenda_mark_done', 'agenda_unmark_done', 'search_product', 'thanks',
  'transfer_to_human'
  ]);
  }

 async processMessage(text, language = 'en', userRole = 'general', aiModel = null) {
 text = this.normalizeText(text);
 this.currentUserRole = userRole || 'general';
 console.log(`\n Processing: "${text}" [${language}] [role=${this.currentUserRole}]`);

 this.conversationHistory.push({
 timestamp: new Date().toISOString(),
 userMessage: text,
 inputLanguage: language
 });
 if (this.conversationHistory.length > 10) this.conversationHistory.shift();

 // =========================================================================
 // STEP 0: Gibberish guard — catch random keystrokes before Groq runs
 // Prevents "jkhkjg", "asdfgh" from triggering login/operator intents
 // =========================================================================
 const _t = text.trim().toLowerCase();
 const _words = _t.split(/\s+/);
 const _isGibberish = (() => {
   if (!_t || _t.length < 2) return false;
   // Single word with almost no vowels = gibberish
   if (_words.length === 1) {
     const w = _words[0].replace(/[^a-z]/g, '');
     if (w.length > 3) {
       const vowelRatio = (w.match(/[aeiou]/g) || []).length / w.length;
       if (vowelRatio < 0.1) return true;
     }
   }
   // 5+ consonants in a row = keyboard mash
   if (/[^aeiou\s]{5,}/i.test(_t)) return true;
   return false;
 })();

 if (_isGibberish) {
   console.log(` [GUARD] Gibberish detected ("${text}") — skipping Groq, returning fallback`);
   return this.getFallbackResponse(language && ['en','ro','it','fr','de'].includes(language) ? language : 'en');
 }

 // =========================================================================
 // STEP 1: Language detection
 // =========================================================================
 const supported = ['en', 'ro', 'it', 'fr', 'de', 'es', 'pt', 'nl', 'pl', 'ru'];
 let detectedLang = (language && supported.includes(language) && language !== 'auto') ? language : null;
 if (!detectedLang) detectedLang = await this.detectLanguage(text);
 console.log(` Language: ${detectedLang}`);

 // =========================================================================
 // STEP 2: GROQ LLM — PRIMARY BRAIN (runs FIRST on every message)
 // ─────────────────────────────────────────────────────────────────────────
 // Groq reads the full message and returns:
 //   • intent   — what the user wants (shopping_list_add, general_knowledge…)
 //   • entities — extracted data (item name, event, date, search term)
 //   • lang     — detected language
 //   • response — natural language reply in the user's language
 //
 // This is the ONLY classification step that matters.
 // Regex/keyword/NLP below are OFFLINE FALLBACKS only — used when Groq
 // is unavailable (timeout, API key missing, network error).
 // =========================================================================
 console.log(` [LLM-FIRST] Sending to Groq → role=${this.currentUserRole} | overrideModel=${aiModel}`);
 const aiResult = await aiService.processMessage(text, detectedLang, this.conversationHistory, this.currentUserRole, aiModel);
 if (aiResult && aiResult.matched) {
   // Safety: block auth-requiring intents for clearly unknown single words
   const AUTH_INTENTS = ['user_connect', 'transfer_to_human', 'human_operator'];
   if (AUTH_INTENTS.includes(aiResult.intent) && _words.length === 1 && !/[aeiou]/i.test(_words[0])) {
     console.log(` [GUARD] Blocking ${aiResult.intent} for single-word no-vowel input`);
     return this.getFallbackResponse(detectedLang);
   }
 if (this.conversationHistory.length > 0) {
 this.conversationHistory[this.conversationHistory.length - 1].botResponse = aiResult.response;
 }
 const finalLang = aiResult.detectedLanguage || detectedLang;
 this.logConversation(aiResult.method, text, aiResult.intent, aiResult.confidence, finalLang);
 console.log(` [LLM-FIRST] Groq responded: intent=${aiResult.intent} | lang=${finalLang}`);
 return { ...aiResult, detectedLanguage: finalLang, method: aiResult.method || 'groq_primary' };
 }

 // =========================================================================
 // STEP 3: OFFLINE FALLBACK — only reached if Groq failed / timed out
 // ─────────────────────────────────────────────────────────────────────────
 // Order: Regex → Keywords → NLP model → Hard fallback
 // All guards below are kept for safety but should rarely fire in production.
 // =========================================================================
 console.log(` [OFFLINE FALLBACK] Groq unavailable — using regex/keyword/NLP`);

  // 3a. Regex
  const regexResult = this.checkRegex(text, detectedLang);
  if (regexResult.matched) {
  const forced = this.enforceIntentPriority(text);
  if (forced) {
    regexResult.intent = forced;
    // Set appropriate response for transfer_to_human
    if (forced === 'transfer_to_human') {
      const responses = {
        en: "I'll connect you with a human operator right away!",
        ro: "Te conectez imediat cu un operator uman!",
        it: "Ti metto subito in contatto con un operatore!",
        fr: "Je vous mets en contact avec un operateur!",
        de: "Ich verbinde Sie sofort mit einem Mitarbeiter!",
        es: "Te conecto ahora mismo con un operador humano!"
      };
      regexResult.response = responses[detectedLang] || responses['en'];
    }
  }
  if (regexResult.intent === 'transfer_to_human') {
    console.log(` [FALLBACK] regex: ${regexResult.intent}`);
    this.logConversation('regex_fallback', text, regexResult.intent, 1.0, detectedLang);
    return { ...regexResult, detectedLanguage: detectedLang };
  }
  if ((regexResult.intent === 'search_product' && this.isGeneralQuestion(text)) ||
      (regexResult.intent === 'shopping_list_add' && this.isShoppingMisclassification(text)) ||
      (regexResult.intent === 'agenda_add' && this.isAgendaMisclassification(text))) {
    console.log(` [FALLBACK] Misclassification guard — skipping ${regexResult.intent}`);
  } else if (!NLPService.GROQ_REQUIRED_INTENTS.has(regexResult.intent)) {
    console.log(` [FALLBACK] regex: ${regexResult.intent}`);
    this.logConversation('regex_fallback', text, regexResult.intent, 1.0, detectedLang);
    return { ...regexResult, detectedLanguage: detectedLang };
  }
  }

  // 3b. Keywords
  const keywordResult = this.checkKeywords(text, detectedLang);
  if (keywordResult.matched) {
  const forced = this.enforceIntentPriority(text);
  if (forced) {
    keywordResult.intent = forced;
    if (forced === 'transfer_to_human') {
      const responses = {
        en: "I'll connect you with a human operator right away!",
        ro: "Te conectez imediat cu un operator uman!",
        it: "Ti metto subito in contatto con un operatore!",
        fr: "Je vous mets en contact avec un operateur!",
        de: "Ich verbinde Sie sofort mit einem Mitarbeiter!",
        es: "Te conecto ahora mismo con un operador humano!"
      };
      keywordResult.response = responses[detectedLang] || responses['en'];
    }
  }
  if (keywordResult.intent === 'transfer_to_human') {
    console.log(` [FALLBACK] keyword: ${keywordResult.intent}`);
    this.logConversation('keyword_fallback', text, keywordResult.intent, 0.85, detectedLang);
    return { ...keywordResult, detectedLanguage: detectedLang };
  }
  if ((keywordResult.intent === 'search_product' && this.isGeneralQuestion(text)) ||
      (keywordResult.intent === 'shopping_list_add' && this.isShoppingMisclassification(text)) ||
      (keywordResult.intent === 'agenda_add' && this.isAgendaMisclassification(text))) {
    console.log(` [FALLBACK] Misclassification guard — skipping ${keywordResult.intent}`);
  } else if (NLPService.OFFLINE_CONFIDENT_INTENTS.has(keywordResult.intent)) {
    console.log(` [FALLBACK] keyword: ${keywordResult.intent}`);
    this.logConversation('keyword_fallback', text, keywordResult.intent, 0.85, detectedLang);
    return { ...keywordResult, detectedLanguage: detectedLang };
  }
  }

  // 3c. NLP model
  const nlpResult = await this.detectIntent(text, detectedLang);
  if (nlpResult.matched) {
  const forced = this.enforceIntentPriority(text);
  if (forced) {
    nlpResult.intent = forced;
    if (forced === 'transfer_to_human') {
      const responses = {
        en: "I'll connect you with a human operator right away!",
        ro: "Te conectez imediat cu un operator uman!",
        it: "Ti metto subito in contatto con un operatore!",
        fr: "Je vous mets en contact avec un operateur!",
        de: "Ich verbinde Sie sofort mit einem Mitarbeiter!",
        es: "Te conecto ahora mismo con un operador humano!"
      };
      nlpResult.response = responses[detectedLang] || responses['en'];
    }
  }
  if (nlpResult.intent === 'transfer_to_human') {
    console.log(` [FALLBACK] nlp (${nlpResult.confidence.toFixed(2)}): ${nlpResult.intent}`);
    this.logConversation('nlp_fallback', text, nlpResult.intent, nlpResult.confidence, detectedLang);
    return { ...nlpResult, detectedLanguage: detectedLang };
  }
  if ((nlpResult.intent === 'search_product' && this.isGeneralQuestion(text)) ||
      (nlpResult.intent === 'shopping_list_add' && this.isShoppingMisclassification(text)) ||
      (nlpResult.intent === 'agenda_add' && this.isAgendaMisclassification(text))) {
    console.log(` [FALLBACK] Misclassification guard — skipping ${nlpResult.intent}`);
  } else if (nlpResult.confidence >= 0.7 && NLPService.OFFLINE_CONFIDENT_INTENTS.has(nlpResult.intent)) {
    console.log(` [FALLBACK] nlp (${nlpResult.confidence.toFixed(2)}): ${nlpResult.intent}`);
    this.logConversation('nlp_fallback', text, nlpResult.intent, nlpResult.confidence, detectedLang);
    return { ...nlpResult, detectedLanguage: detectedLang };
  }
  }

 // =========================================================================
 // STEP 4: Hard fallback
 // =========================================================================
 console.log(' [FALLBACK] No match — hard fallback');
 this.logConversation('FALLBACK', text, 'fallback', 0, detectedLang);
 return { ...this.getFallbackResponse(detectedLang), detectedLanguage: detectedLang };
 }

 // =========================================================================
 // ENTITY EXTRACTION
 // =========================================================================
 extractEntities(text, intent) {
 console.log(`\n EXTRACTING ENTITIES`);
 console.log(` Text: "${text}"`);
 console.log(` Intent: "${intent}"`);
 
 const entities = {};

 try {
 const doc = nlp(text);

 switch (intent) {
 case 'shopping_list_add': {
 let item = null;
 let itemMatch = null;
 
 // Clean text remove common filler words
 const cleanText = text
 .toLowerCase()
 .replace(/[.!?]+$/, '')
 .replace(/\b(also|just|please|now)\b/gi, '')
 .replace(/\b(can you|could you|would you)\b/gi, '')
 .replace(/\b(te\s+rog|va\s+rog|v\s+rog)\b/gi, '')
 .replace(/\b(per\s+favore|s\s*'\s*il\s+vous\s+plait|por\s+favor|bitte)\b/gi, '')
 .replace(/\s{2,}/g, ' ')
 .trim();
 
 console.log(` Cleaned: "${cleanText}"`);
 
 const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 const addVerbs = [
 'add', 'append', 'put', 'insert', 'include', 'save', 'buy', 'get', 'need', 'purchase', 'grab', 'pick up',
 'adauga', 'adaug', 'pune', 'pun', 'puneti', 'pune-ti', 'puneți', 'cumpara', 'cumpar', 'cumpară', 'ia', 'iau', 'trece', 'noteaza', 'notează', 'scrie',
 'aggiungi', 'aggiungere', 'metti', 'mettere', 'compra', 'comprare', 'prendi', 'prendere',
 'ajoute', 'ajouter', 'mets', 'mettre', 'acheter', 'prends', 'prendre',
 'fuge', 'fugen', 'hinzufugen', 'hinzufuegen', 'setzen', 'setze', 'kaufe', 'kaufen', 'hol', 'holen',
 'anade', 'añade', 'agrega', 'agregar', 'pon', 'poner', 'coge', 'coger', 'compra', 'comprar',
 'adiciona', 'adicionar', 'coloca', 'colocar', 'pega', 'pegar'
 ];
 const listWords = [
 'shopping list', 'shopping-list', 'list', 'cart', 'grocery list',
 'lista', 'listă', 'lista de cumparaturi', 'lista de cumpărături', 'listă de cumpărături',
 'cos', 'coș', 'lista della spesa', 'liste de courses', 'einkaufsliste', 'lista de compras'
 ];
 const addVerbRegex = addVerbs.map(escapeRegex).join('|');
 const listWordRegex = listWords.map(escapeRegex).join('|');
 const commandWordRegex = new RegExp(`\\b(?:${addVerbRegex})\\b`, 'i');
 const listWordRegexFull = new RegExp(`\\b(?:${listWordRegex})\\b`, 'i');

 // Pattern 0: "add X to/in/on the list" (multilingual)
 itemMatch = cleanText.match(new RegExp(`(?:${addVerbRegex})\\s+(.+?)\\s+(?:to|in|on|pe|la|nel|nella|dans|auf)\\s+(?:my\\s+)?(?:${listWordRegex})\\b`, 'i'));
 if (itemMatch && itemMatch[1]) {
 item = itemMatch[1].trim();
 console.log(` Pattern 0 (add X to list): "${item}"`);
 }

 // Pattern 1: "add to my shopping list to buy X"
 if (!item) {
 itemMatch = cleanText.match(/(?:add|append|put|insert|include|save)\s+(?:to|in)\s+(?:my\s+)?(?:shopping\s+)?(?:list|cart)\s+(?:to\s+)?(?:buy\s+)?(.+)/i);
 if (itemMatch && itemMatch[1]) {
 item = itemMatch[1].trim();
 console.log(` Pattern 1 (add to list to buy X): "${item}"`);
 }
 }
 
 
 // Pattern 2: "add X to my shopping list"
 if (!item) {
 itemMatch = cleanText.match(/(?:add|append|put|insert|include|save)\s+(.+?)\s+(?:to|in)\s+(?:my\s+)?(?:shopping\s+)?(?:list|cart)/i);
 if (itemMatch && itemMatch[1]) {
 const candidate = itemMatch[1].trim();
 if (!['to', 'the', 'a', 'an', 'some'].includes(candidate)) {
 item = candidate;
 console.log(` Pattern 2 (add X to list): "${item}"`);
 }
 }
 }
 
 // Pattern 3: "buy X", "get X", "need X"
 if (!item) {
 itemMatch = cleanText.match(/(?:buy|get|need|purchase|grab|pick up)\s+(.+?)(?:\s+(?:from|at|to|for me).*)?$/i);
 if (itemMatch && itemMatch[1]) {
 item = itemMatch[1].trim();
 console.log(` Pattern 3 (buy/get/need X): "${item}"`);
 }
 }

 // Pattern 3b: "add X" (no list mention)
 if (!item) {
 itemMatch = cleanText.match(new RegExp(`^(?:${addVerbRegex})\\s+(.+)$`, 'i'));
 if (itemMatch && itemMatch[1]) {
 item = itemMatch[1].trim();
 console.log(` Pattern 3b (add X): "${item}"`);
 }
 }
 
 // Pattern 4: NLP noun extraction
 if (!item) {
 const nouns = doc.nouns().out('array');
 const stopWords = ['list', 'shopping', 'cart', 'item', 'store', 'groceries', 'market'];
 for (const noun of nouns) {
 const candidate = (noun || '').trim();
 if (!candidate) continue;
 if (stopWords.includes(candidate.toLowerCase())) continue;
 if (commandWordRegex.test(candidate) || listWordRegexFull.test(candidate)) continue;
 if (candidate.split(' ').length > 6) continue;
 item = candidate;
 console.log(` Pattern 4 (noun extraction): "${item}"`);
 break;
 }
 }
 
 // Pattern 5: Get everything after common trigger phrases
 if (!item) {
 itemMatch = cleanText.match(/(?:list|cart|shopping)\s+(.+)$/i);
 if (itemMatch && itemMatch[1]) {
 const candidate = itemMatch[1].replace(/^(to\s+buy\s+|to\s+get\s+|to\s+)/i, '').trim();
 if (candidate) {
 item = candidate;
 console.log(` Pattern 5 (after trigger): "${item}"`);
 }
 }
 }

 if (item) {
 item = item.replace(/^["'“”]+|["'“”]+$/g, '').trim();
 item = item.replace(new RegExp(`\\s+(?:to|in|on|pe|la|nel|nella|dans|auf)\\s+(?:my\\s+)?(?:${listWordRegex})\\b.*$`, 'i'), '').trim();
 }
 
 // Guard: never use day names or vague words as shopping items
 const DAY_NAMES = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','tomorrow','tonight','today'];
 const VAGUE = ['something','anything','stuff','thing','item','product','it','that'];
 if (item && DAY_NAMES.includes(item.toLowerCase().trim())) {
 console.log(` Rejected day-name as item: "${item}"`);
 item = null;
 }
 if (item && VAGUE.includes(item.toLowerCase().trim())) {
 console.log(` Rejected vague item: "${item}"`);
 item = null;
 }
 if (item && (commandWordRegex.test(item) || listWordRegexFull.test(item))) {
 console.log(` Rejected command/list phrase as item: "${item}"`);
 item = null;
 }

 entities.item = item || null;
 this.userPreferences.lastEntity = entities.item;
 console.log(` FINAL ITEM: "${entities.item}"`);
 break;
 }

 case 'search_product': {
 let searchTerm = null;
 let searchMatch = null;
 
 const cleanSearchText = text
 .toLowerCase()
 .replace(/\.$|\?$/, '')
 .replace(/\b(i\s+am|i'm|am)\b/gi, '')
 .trim();
 
 console.log(` Cleaned search: "${cleanSearchText}"`);
 
 // Pattern 1: "want to eat X" / "want some X" / "want X"
 // Stops capture at trailing question phrases: "have any", "know any", "got any", "available", etc.
 searchMatch = cleanSearchText.match(/(?:want|like|love)\s+(?:to\s+eat\s+)?(?:some\s+)?(.+?)(?:\s*[,.]?\s*(?:have\s+any|know\s+any|got\s+any|any\s+available|available|near\s+me|around\s+here|nearby|in\s+stock|found\??|please))?$/i);
 if (searchMatch && searchMatch[1]) {
 const candidate = searchMatch[1]
 // Strip trailing question fragments: "have any", "know any", "got any", etc.
 .replace(/\s*[,.]?\s*\b(have\s+any|know\s+any|got\s+any|any\s+available|available|near\s+me|around\s+here|nearby|in\s+stock|found|please)\b.*$/i, '')
 .replace(/\b(some|a|an|the)\b/gi, '')
 .replace(/[,?.!]+$/, '')
 .trim();
 if (candidate) {
 searchTerm = candidate;
 console.log(` Pattern 1 (want/like X): "${searchTerm}"`);
 }
 }
 
 // Pattern 2: "looking for X" / "search for X" / "find [me] [a] X [in location]"
 if (!searchTerm) {
 searchMatch = cleanSearchText.match(/(?:looking\s+for|search\s+for|searching\s+for|find|need)\s+(.+?)(?:\s*\.?\s*$)/i);
 if (searchMatch && searchMatch[1]) {
 searchTerm = searchMatch[1]
 .replace(/^(me|us)\s+/i, '') // strip leading "me" or "us"
 .replace(/\b(some|a|an|the|please)\b/gi, '')
 .trim();
 console.log(` Pattern 2 (looking for X): "${searchTerm}"`);
 }
 }
 
 // Pattern 3: NLP noun extraction
 if (!searchTerm) {
 const nouns = doc.nouns().out('array');
 const stopWords = ['search', 'looking', 'find', 'thing', 'product', 'item', 'something', 'anything'];
 for (const noun of nouns) {
 if (!stopWords.includes(noun.toLowerCase())) {
 searchTerm = noun;
 console.log(` Pattern 3 (noun): "${searchTerm}"`);
 break;
 }
 }
 }
 
 // Pattern 4: common food/product words
 if (!searchTerm) {
 const foodWords = ['pizza','burger','milk','bread','cheese','chicken','beef','fish','rice','pasta','coffee','tea','juice','water','fruit','vegetable','apple','banana','orange'];
 for (const food of foodWords) {
 if (cleanSearchText.includes(food)) {
 searchTerm = food;
 console.log(` Pattern 4 (food word): "${searchTerm}"`);
 break;
 }
 }
 }
 
 // Pattern 5: last meaningful word
 if (!searchTerm) {
 const words = cleanSearchText.split(/\s+/).filter(w => 
 !['i','want','to','eat','some','a','an','the','found','please','find','search','for','me','us'].includes(w)
 );
 if (words.length > 0) {
 searchTerm = words[words.length - 1];
 console.log(` Pattern 5 (last word): "${searchTerm}"`);
 }
 }
 
 // Cleanup
 if (searchTerm) {
 searchTerm = String(searchTerm)
 .toLowerCase()
 // Strip trailing conversational fragments: "have any", "know any", "got any", "?" etc.
 .replace(/\s*[,.]?\s*\b(have\s+any|know\s+any|got\s+any|any\s+available|available|near\s+me|around\s+here|nearby|in\s+stock|found|please)\b.*$/i, '')
 .replace(/\bfound\b/gi, '')
 .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
 .replace(/\s+/g, ' ')
 .trim();
 }
 searchTerm = this.sanitizeSearchTerm(searchTerm);

 // Guard 1: reject vague searches
 const VAGUE_SEARCHES = ['something','anything','stuff','thing','product','item','it','that','food','eat'];
 if (searchTerm && VAGUE_SEARCHES.includes(searchTerm.toLowerCase().trim())) {
 console.log(` Rejected vague search: "${searchTerm}"`);
 searchTerm = null;
 }

 // Guard 2: reject if search term looks like a whole sentence (5+ words)
 // This catches cases like "to fix my bicycle it is damaged" leaking through
 if (searchTerm && searchTerm.split(/\s+/).length >= 5) {
 console.log(` Rejected full-sentence search term: "${searchTerm}"`);
 searchTerm = null;
 }

 entities.searchTerm = searchTerm || null;
 this.userPreferences.lastEntity = entities.searchTerm;
 console.log(` FINAL SEARCH TERM: "${entities.searchTerm}"`);
 break;
 }

 case 'agenda_show': {
 const clean = text.toLowerCase();
 const m = clean.match(/(?:search|find|look\s+for|show)\s+(?:my\s+)?(?:agenda|calendar)?\s*(?:for\s+)?(.+)$/i);
 if (m && m[1]) {
 const term = m[1]
 .replace(/\b(agenda|calendar|events|event|please|me|my)\b/gi, '')
 .trim();
 if (term) entities.searchTerm = term;
 }
 break;
 }

 case 'agenda_add': {
 let event = null;
 let agendaMatch = null;

 const cleanAgendaText = text.toLowerCase();

 // Pattern 1: English "remind me to EVENT"
 agendaMatch = cleanAgendaText.match(/(?:remind\s+me\s+to|reminder\s+to)\s+(.+)/i);
 if (agendaMatch) {
 event = agendaMatch[1].trim();
 console.log(` Pattern 1 (EN remind): "${event}"`);
 }

 // Pattern 1b: Romanian "aminteste-mi sa EVENT"
 if (!event) {
 agendaMatch = cleanAgendaText.match(/aminte[sÈ™]te?-?mi\s+(?:s[aÄƒ]\s+)?\s*(.+)/i);
 if (agendaMatch) { event = agendaMatch[1].trim(); console.log(` Pattern 1b (RO): "${event}"`); }
 }

 // Pattern 1c: German "erinnere mich [morgen] an/zu EVENT"
 if (!event) {
 agendaMatch = cleanAgendaText.match(/erinnere\s+mich\s+(?:morgen\s+|heute\s+|Ã¼bermorgen\s+)?(?:daran\s+)?(?:zu\s+|an\s+)?(.+)/i);
 if (agendaMatch) { event = agendaMatch[1].trim(); console.log(` Pattern 1c (DE): "${event}"`); }
 }

 // Pattern 1d: Italian "ricordami di EVENT"
 if (!event) {
 agendaMatch = cleanAgendaText.match(/ricordami\s+(?:di\s+)?(.+)/i);
 if (agendaMatch) { event = agendaMatch[1].trim(); console.log(` Pattern 1d (IT): "${event}"`); }
 }

 // Pattern 1e: French "rappelle-moi de/d' EVENT"
 if (!event) {
 agendaMatch = cleanAgendaText.match(/rappelle-?moi\s+(?:de\s+|d[\u2018\u2019']\s*)?(.+)/i);
 if (agendaMatch) { event = agendaMatch[1].trim(); console.log(` Pattern 1e (FR): "${event}"`); }
 }

 // Pattern 2: "schedule EVENT" or "add to calendar EVENT" (EN)
 if (!event) {
 agendaMatch = cleanAgendaText.match(/(?:schedule|add\s+to\s+(?:calendar|agenda):?)\s+(.+)/i);
 if (agendaMatch) { event = agendaMatch[1].trim(); console.log(` Pattern 2 (EN schedule): "${event}"`); }
 }

 // Pattern 3: Strip only known command/trigger words — NOT prepositions like "to" that are part of event names
 // e.g. "go to office", "go to club" must be preserved intact
 if (!event) {
 event = text
 .replace(/\b(add|remind|schedule|my|me|calendar|agenda|the|an|a|tyo)\b/gi, '')
 .replace(/\b(adaug[aă]|aminte[șs]te?-?mi|s[aă]|în|in|la|pe|calendar|agend[aă])\b/gi, '')
 .replace(/\b(erinnere|mich|zum|kalender|zur|hinzuf[uü]gen|bitte|erstelle|planen)\b/gi, '')
 .replace(/\b(ricordami|aggiungi|al|calendario|all|di|da|per)\b/gi, '')
 .replace(/\b(rappelle-?moi|ajouter|au|calendrier|de|du|le|la|les|mon|ma)\b/gi, '')
 .replace(/\s+/g, ' ')
 .trim();
 console.log(` Pattern 3 (strip triggers): "${event}"`);
 }

 // Multilingual date aliases â€” normalise to English for parseHumanDateToMysql
 const dateAliases = [
 [/\b(morgen|demain|domani|ma\u00f1ana|m\u00e2ine|m\u00eeine)\b/i, 'tomorrow'],
 [/\b(heute|aujourd[\u2018\u2019']?hui|oggi|hoy|azi|ast\u0103zi)\b/i, 'today'],
 [/\b(n\u00e4chste\s+woche|la\s+semaine\s+prochaine|la\s+settimana\s+prossima|s\u0103pt\u0103m\u00e2na\s+viitoare)\b/i, 'next week'],
 [/\b(n\u00e4chsten\s+monat|le\s+mois\s+prochain|il\s+mese\s+prossimo|luna\s+viitoare)\b/i, 'next month'],
 [/\b(montag|lundi|luned\u00ec|lunes|luni)\b/i, 'monday'],
 [/\b(dienstag|mardi|marted\u00ec|martes|mar\u021bi)\b/i, 'tuesday'],
 [/\b(mittwoch|mercredi|mercoled\u00ec|mi\u00e9rcoles|miercuri)\b/i, 'wednesday'],
 [/\b(donnerstag|jeudi|gioved\u00ec|jueves|joi)\b/i, 'thursday'],
 [/\b(freitag|vendredi|venerd\u00ec|viernes|vineri)\b/i, 'friday'],
 [/\b(samstag|samedi|sabato|s\u00e1bado|s\u00e2mb\u0103t\u0103)\b/i, 'saturday'],
 [/\b(sonntag|dimanche|domenica|domingo|duminic\u0103)\b/i, 'sunday'],
 ];

 let eventForDate = event || text;
 for (const [pattern, replacement] of dateAliases) {
 eventForDate = eventForDate.replace(pattern, replacement);
 }

 const relDateMatch = eventForDate.match(/\b((?:after|in)\s+\d+\s*(?:days?|weeks?|months?)|\d+\s*(?:days?|weeks?|months?)\s+from\s+now)/i);
 const namedDateMatch = eventForDate.match(/\b(tomorrow|today|tonight|next\s+week|next\s+month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s+\w+\s+\d{4})/i);
 const dateMatch = relDateMatch || namedDateMatch;

 if (dateMatch) {
 entities.date = dateMatch[1];
 // Remove the original-language date word from event text
 for (const [pattern] of dateAliases) {
 event = event.replace(pattern, '');
 }
 event = event.replace(/\s+/g, ' ').trim();
 console.log(` Date extracted: "${entities.date}"`);
 }

 
 // Final cleanup — strip only leading/trailing artifacts, NOT mid-phrase prepositions
 // Do NOT strip "to","an","a" globally — they are part of names like "go to office"
 event = (event || '')
 .replace(/^\b(on|at|for|um|am|zu|le|la|il|di|de|para|\u00e0|en)\b\s*/gi, '')
 .replace(/^[\s:"'\-,;]+/, '')
 .replace(/\"/g, '')
 .replace(/\s+/g, ' ').trim();

 entities.event = event || 'event';
 this.userPreferences.lastEntity = entities.event;
 console.log(` FINAL EVENT: "${entities.event}"${entities.date ? ` on ${entities.date}` : ''}`);
 break;
 }
 // =====================================================================
 // SHOPPING LIST DELETE & MARK DONE - extract item name
 // =====================================================================
 case 'shopping_list_delete':
 case 'shopping_list_mark_done':
 case 'shopping_list_unmark_done': {
 let item = null;
 const cleanText = text.toLowerCase()
   .replace(/(please|can you|could you|i want to|i'd like to)/gi, '')
   .trim();

 // Pattern 1: "remove/delete X from list/cart"
 const m1 = cleanText.match(/(?:remove|delete|take off|cross off|eliminate)\s+(.+?)\s+(?:from|off)\s+(?:my\s+)?(?:list|cart|shopping)/i);
 if (m1) item = m1[1].trim();

 // Pattern 0: Index-based for MARK — supports numeric and ordinal synonyms
 // "mark complete point 3", "mark done item 2", "mark the first one done", "tick 2nd"
 if (!item) {
   // Shared ordinal map used by both mark and delete index patterns
   const ORDINAL_MAP = {
     first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
     sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
     '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
     '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
     primul: 1, prima: 1, 'al doilea': 2, 'a doua': 2, 'al treilea': 3,
     primo: 1, secondo: 2, seconda: 2, terzo: 3,
     premier: 1, première: 1, deuxième: 2, troisième: 3,
     erste: 1, ersten: 1, zweite: 2, zweiten: 2, dritte: 3
   };
   // Numeric: "mark complete item 3", "tick point 2", "mark done #1"
   const m0 = cleanText.match(/^(?:mark|set|tick)\s+(?:complete|completed|done|as\s+done|as\s+complete|off)?\s*(?:the\s+)?(?:point|item|number|entry|row|no\.?|#|produsul|articolul|articolo|article|artikel)?\s*(\d+)(?:\s+(?:in|from|on)\s+(?:my\s+)?(?:shopping\s+list|grocery\s+list|list|cart|shopping|agenda|calendar|schedule))?\s*(?:as\s+(?:done|complete|finished))?\s*$/i);
   if (m0) { item = m0[1].trim(); }
   // Ordinal: "mark the first one done", "tick the second item"
   if (!item) {
     const m0ord = cleanText.match(/^(?:mark|set|tick)\s+(?:the\s+)?(.+?)\s+(?:one\s+)?(?:as\s+)?(?:done|complete|completed|finished|bought|checked|off)$/i);
     if (m0ord) {
       const word = m0ord[1].trim().toLowerCase();
       if (ORDINAL_MAP[word]) item = String(ORDINAL_MAP[word]);
     }
   }
 }

 // Pattern 0b: Index-based for DELETE — supports all common synonyms across EN/RO/IT/FR/DE
 // English:  "delete item 1", "remove #2", "delete the 1st", "delete first one", "delete number 3"
 // Romanian: "sterge produsul 1", "sterge articolul 2", "sterge primul"
 // Italian:  "elimina articolo 1", "rimuovi il primo"
 // French:   "supprime article 1", "supprime le premier"
 // German:   "lösche Artikel 1", "entferne das erste"
 if (!item) {
   // Numeric index pattern: "delete item 1", "remove #2", "delete 3", "delete no. 2"
   const m0b = cleanText.match(
     /^(?:remove|delete|cancel|take\s+off|cross\s+off|eliminate|sterge|elimina|supprime?|lösche?|entferne?)\s+(?:the\s+)?(?:item\s+|point\s+|number\s+|no\.?\s*|#\s*|entry\s+|row\s+|line\s+|position\s+|produsul\s+|articolul\s+|elementul\s+|pozitia\s+|articolo\s+|elemento\s+|voce\s+|riga\s+|article\s+|élément\s+|ligne\s+|entrée\s+|artikel\s+|element\s+|eintrag\s+|zeile\s+)?(\d+)(?:\s+(?:from|off|in)\s+(?:my\s+)?(?:shopping\s+list|grocery\s+list|list|cart|shopping))?\s*$/i
   );
   if (m0b) {
     item = m0b[1].trim();
     console.log(` Pattern 0b (numeric index delete): #${item}`);
   }

   // Ordinal word pattern: "delete the first one", "remove first item", "delete primul"
   if (!item) {
     const m0c = cleanText.match(
       /^(?:remove|delete|cancel|take\s+off|cross\s+off|eliminate|sterge|elimina|supprime?|lösche?|entferne?)\s+(?:the\s+)?(.+?)(?:\s+(?:one|item|entry|product|produs|articol|articolo|article|artikel))?\s*(?:from\s+(?:my\s+)?(?:list|cart|shopping))?\s*$/i
     );
     if (m0c) {
       const word = m0c[1].trim().toLowerCase();
       const ORDINAL_MAP_LOCAL = {
         first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
         sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
         '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
         '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
         primul: 1, prima: 1, 'al doilea': 2, 'a doua': 2, 'al treilea': 3,
         primo: 1, secondo: 2, seconda: 2, terzo: 3,
         premier: 1, première: 1, deuxième: 2, troisième: 3,
         erste: 1, ersten: 1, zweite: 2, zweiten: 2, dritte: 3
       };
       const ordinal = ORDINAL_MAP_LOCAL[word];
       if (ordinal) {
         item = String(ordinal);
         console.log(` Pattern 0c (ordinal word delete): "${word}" → #${item}`);
       }
     }
   }
 }

 // Pattern 2: "mark complete/done X" — extract item after the verb word
 // Strips trailing context: "in shopping list", "in my list", "in cart"
 if (!item) {
   const m2a = cleanText
      .replace(/\s+(?:in|from|on)\s+(?:my\s+)?(?:shopping\s+list|grocery\s+list|list|cart|shopping|agenda|calendar|schedule)\s*$/i, '')
     .match(/^(?:mark|set|tick)\s+(?:complete|completed|done|as\s+done|as\s+complete|off)\s+(.+)$/i);
   if (m2a) item = m2a[1].trim();
 }
 // Pattern 3: "mark X complete/done" — trailing form
 // "mark hot milk complete" → "hot milk"
 // "mark food for buy complete in list" → "food for buy"
 if (!item) {
   const cleanedForP3 = cleanText
     .replace(/\s+(?:in|from|on)\s+(?:my\s+)?(?:shopping\s+list|grocery\s+list|list|cart|shopping|agenda|calendar|schedule)\s*$/i, '');
   const m3 = cleanedForP3.match(/^(?:mark|set|tick)\s+(.+?)\s+(?:as\s+)?(?:complete|completed|done|bought|checked|finished|off)$/i);
   if (m3) item = m3[1].trim();
 }

 // Pattern 4: "remove/delete X" — no mark verb here
 if (!item) {
   const m4 = cleanText.match(/^(?:remove|delete|take\s+off|cross\s+off|eliminate)\s+(.+?)(?:\s+as\s+(?:done|bought|checked))?$/i);
   if (m4) item = m4[1].replace(/\b(as\s+)?(done|bought|checked|finished)\b/gi, '').trim();
 }

 // Pattern 5: "unmark/uncheck X"
 if (!item) {
   const m2u = cleanText.match(/^(?:unmark|un-mark|uncheck|un-check)\s+(.+?)(?:\s+(?:in|from|on)\s+(?:my\s+)?(?:list|cart|shopping))?$/i);
   if (m2u) item = m2u[1].replace(/\s+(?:in|from|on)\s+(?:my\s+)?(?:list|cart|shopping)\s*$/gi, '').trim();
 }
 // Strip filler words and trailing action words
 if (item) item = item
   .replace(/\s+(?:done|undone|complete|completed|bought|checked|finished|off|incomplete)\s*$/gi, '')
   .replace(/(the|a|an|my|some|all)/gi, '').replace(/\s+/g, ' ').trim();
 if (!item) item = null;

 entities.item = item;
 console.log(` FINAL ITEM (delete/done): "${entities.item}"`);
 break;
 }

 // =====================================================================
 // AGENDA DELETE & MARK DONE - extract event name
 // =====================================================================
 case 'agenda_delete':
 case 'agenda_mark_done': {
 let event = null;
 const cleanText = text.toLowerCase()
   .replace(/(please|can you|could you|i want to|i'd like to)/gi, '')
   .trim();

 // Pattern 1: "delete/remove X from calendar/agenda"
 const m1 = cleanText.match(/(?:remove|delete|cancel)\s+(.+?)\s+(?:from|off)\s+(?:my\s+)?(?:calendar|agenda)/i);
 if (m1) event = m1[1].trim();

 // Pattern 0: Index-based — "mark complete point 2" / "mark complete point 2 in agenda"
 if (!event) {
   const m0 = cleanText.match(/^(?:mark|set|tick)\s+(?:complete|completed|done|as\s+done|as\s+complete|off)?\s*(?:point|item|number|no\.?|#)?\s*(\d+)(?:\s+(?:in|from|on)\s+(?:my\s+)?(?:agenda|calendar|schedule|shopping\s+list|list|cart))?\s*$/i);
   if (m0) event = m0[1].trim(); // just the number
 }

 // Pattern 2a: "mark complete/done X" — MUST come first
 // Strips trailing context: "in agenda", "in my calendar"
 if (!event) {
   const m2a = cleanText
      .replace(/\s+(?:in|from|on)\s+(?:my\s+)?(?:agenda|calendar|my\s+calendar|schedule|shopping\s+list|list|cart)\s*$/i, '')
     .match(/^(?:mark|set|tick)\s+(?:complete|completed|done|as\s+done|as\s+complete|off)\s+(.+)$/i);
   if (m2a) event = m2a[1].trim();
 }
 // Pattern 2b: "mark X complete/done" — trailing form
 // "mark dentist appointment complete" → "dentist appointment"
 // "mark go club complete in my agenda" → "go club"
 if (!event) {
   const cleanedForP2b = cleanText
     .replace(/\s+(?:in|from|on)\s+(?:my\s+)?(?:agenda|calendar|schedule|shopping\s+list|list|cart)\s*$/i, '');
   const m2b = cleanedForP2b.match(/^(?:mark|set|tick)\s+(.+?)\s+(?:as\s+)?(?:complete|completed|done|finished)$/i);
   if (m2b) event = m2b[1].trim();
 }

 // Pattern 2c: "delete/remove [my] X [from my agenda/calendar]" or "cancel X"
 if (!event) {
   const m2c = cleanText
     // First strip trailing "from my agenda/calendar" so it doesn't leak into event name
     .replace(/\s+(?:from|off)\s+(?:my\s+)?(?:agenda|calendar|schedule)\s*$/i, '')
     .match(/^(?:remove|delete|cancel)\s+(?:my\s+)?(.+?)(?:\s+as\s+(?:done|completed|finished))?$/i);
   if (m2c) event = m2c[1].replace(/\b(as\s+)?(done|completed|finished)\b/gi, '').trim();
 }

 if (event) event = event
   .replace(/\s+(?:from|off|in|on)\s+(?:my\s+)?(?:agenda|calendar|schedule)\s*$/i, '') // strip trailing "from my agenda"
   .replace(/\b(the|a|an|my|this)\b/gi, '')
   .replace(/\s+/g, ' ')
   .trim();

 entities.event = event;
 console.log(` FINAL EVENT (delete/done): "${entities.event}"`);
 break;
 }

 // =====================================================================
 // AGENDA UNMARK DONE - extract event name
 // Handles: "unmark go to club", "mark go to club undone", "uncheck dentist"
 // =====================================================================
 case 'agenda_unmark_done': {
 let event = null;
 const cleanText = text.toLowerCase()
   .replace(/(please|can you|could you|i want to|i'd like to)/gi, '')
   .trim();

 // Pattern 1: "unmark/uncheck X [from/in calendar/agenda]"
 const m1 = cleanText.match(/^(?:unmark|un-mark|uncheck|un-check|undo\s+mark|clear\s+done|reset\s+done)\s+(.+?)(?:\s+(?:in|from|on)\s+(?:my\s+)?(?:agenda|calendar|schedule))?\s*$/i);
 if (m1) event = m1[1].trim();

 // Pattern 2: "mark X undone/not done/incomplete"
 if (!event) {
   const m2 = cleanText.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:undone|un-done|not\s+done|not\s+complete|not\s+completed|incomplete|unchecked)\s*$/i);
   if (m2) event = m2[1].trim();
 }

 // Pattern 3: Index-based — "unmark point 2" / "uncheck item 3 in agenda"
 if (!event) {
   const m3 = cleanText.match(/^(?:unmark|uncheck|un-mark|un-check)\s+(?:the\s+)?(?:point|item|number|no\.?|#|event)?\s*(\d+)(?:\s+(?:in|from|on)\s+(?:my\s+)?(?:agenda|calendar|schedule))?\s*$/i);
   if (m3) event = m3[1].trim();
 }

 if (event) event = event
   .replace(/\s+(?:from|off|in|on)\s+(?:my\s+)?(?:agenda|calendar|schedule)\s*$/i, '')
   .replace(/\b(the|my|this)\b/gi, '')
   .replace(/\s+/g, ' ')
   .trim();

 entities.event = event || null;
 console.log(` FINAL EVENT (unmark): "${entities.event}"`);
 break;
 }

 default:
 console.log(` No extraction logic for intent: ${intent}`);
 }
 } catch (error) {
 console.error(' Entity extraction error:', error);
 }

 console.log(` Returning entities:`, entities);
 return entities;
 }

 // =========================================================================
 // LOGGING & UTILITY
 // =========================================================================

 logConversation(method, input, intent, confidence, language) {
 const log = {
 timestamp: new Date().toISOString(),
 method,
 input,
 intent,
 confidence: typeof confidence === 'number' ? confidence.toFixed(2) : '0.00',
 language
 };
 this.conversationLogs.push(log);
 if (this.conversationLogs.length > 100) {
 this.conversationLogs.shift();
 }
 }

 getLogs() {
 return this.conversationLogs;
 }

 getConversationHistory() {
 return this.conversationHistory;
 }

 resetConversation() {
 this.conversationHistory = [];
 this.currentLanguage = 'en';
 this.userPreferences = { preferredLanguage: 'en', lastIntent: null, lastEntity: null };
 console.log(' Conversation reset');
 }

 getStats() {
 return {
 totalRules: this.rules.length,
 activeRules: this.rules.filter(r => r.active).length,
 languagesSupported: ['en', 'ro', 'it', 'fr', 'de', 'es', 'pt', 'nl', 'pl', 'ru'],
 intentsAvailable: [...new Set(this.rules.map(r => r.intent))],
 totalConversations: this.conversationLogs.length,
 conversationHistory: this.conversationHistory.length,
 currentLanguage: this.currentLanguage,
 groq: groqService.getStats(),
 ai: aiService.getStats()
 };
 }
}

// Export singleton
module.exports = new NLPService();