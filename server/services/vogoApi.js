// ============================================================================
// VOGO API SERVICE - Complete REST API Integration
// File: server/services/vogoApi.js
//
// Fixes included in this final version:
// ✅ VIP Bearer token is fetched ONLY when VIP login is attempted (NO startup warm-up)
// ✅ Prevents unnecessary Bearer calls on wrong-password (only try VIP for 403/forbidden/not allowed)
// ✅ Adds browser-like headers (User-Agent/Accept) to reduce WP security blocks
// ✅ Keeps per-process locks to avoid parallel login storms (429)
// ✅ Handles 429 with Retry-After (single retry) for bearer fetch + login
// ✅ Trims/cleans username/password inputs to avoid hidden character issues
// ============================================================================

// API Configuration
// BACKEND_URL is the single source of truth — all endpoints: BACKEND_URL + /path
const BACKEND_URL = (process.env.VOGO_API_BASE || 'https://vogo.me/wp-json').replace(/\/+$/, '');
const USERNAME = process.env.VOGO_USERNAME || 'app_mobile_general@vogo.family';
const PASSWORD = process.env.VOGO_PASSWORD || 'Abc123$';

// Import logging service (optional - only used if SHOW_DETAILED_LOGS is enabled)
let loggingService = null;
try {
  loggingService = require('./logging_service');
} catch (err) {
  // Logging service not available - that's ok, logs will just be console-only
}

// General API token (server app token for normal API calls)
let cachedToken = null;
let tokenExpiresAt = 0;
let loginInProgress = null; // Lock: prevents simultaneous login calls causing 429

// Bearer token cache for VIP client login (fetched only when needed)
let cachedProdToken = null;
let prodTokenExpiresAt = 0;
let prodLoginInProgress = null;

// ============================================================================
// MULTILINGUAL MESSAGES
// ============================================================================
const MESSAGES = {
  agendaAdded: {
    en: (name, date) => `Added "${name}" to your calendar on ${date}`,
    ro: (name, date) => `Am adăugat "${name}" în calendarul tău pe ${date}`,
    it: (name, date) => `"${name}" aggiunto al tuo calendario il ${date}`,
    fr: (name, date) => `"${name}" ajouté à votre calendrier le ${date}`,
    de: (name, date) => `"${name}" wurde am ${date} zu Ihrem Kalender hinzugefügt`,
    es: (name, date) => `"${name}" añadido a tu calendario el ${date}`,
    pt: (name, date) => `"${name}" adicionado ao seu calendário em ${date}`,
    nl: (name, date) => `"${name}" toegevoegd aan uw agenda op ${date}`,
    pl: (name, date) => `"${name}" dodano do kalendarza na ${date}`,
  },
  agendaAddedNoDate: {
    en: (name) => `Added "${name}" to your calendar`,
    ro: (name) => `Am adăugat "${name}" în calendarul tău`,
    it: (name) => `"${name}" aggiunto al tuo calendario`,
    fr: (name) => `"${name}" ajouté à votre calendrier`,
    de: (name) => `"${name}" wurde zu Ihrem Kalender hinzugefügt`,
    es: (name) => `"${name}" añadido a tu calendario`,
    pt: (name) => `"${name}" adicionado ao seu calendário`,
    nl: (name) => `"${name}" toegevoegd aan uw agenda`,
    pl: (name) => `"${name}" dodano do kalendarza`,
  },
  agendaFailed: {
    en: (name, err) => `Failed to add "${name}": ${err}`,
    ro: (name, err) => `Nu am putut adăuga "${name}": ${err}`,
    it: (name, err) => `Impossibile aggiungere "${name}": ${err}`,
    fr: (name, err) => `Impossible d'ajouter "${name}": ${err}`,
    de: (name, err) => `"${name}" konnte nicht hinzugefügt werden: ${err}`,
    es: (name, err) => `No se pudo añadir "${name}": ${err}`,
    pt: (name, err) => `Não foi possível adicionar "${name}": ${err}`,
    nl: (name, err) => `"${name}" kon niet worden toegevoegd: ${err}`,
    pl: (name, err) => `Nie udało się dodać "${name}": ${err}`,
  },
  shoppingAdded: {
    en: (name) => `Added "${name}" to your shopping list`,
    ro: (name) => `Am adăugat "${name}" în lista de cumpărături`,
    it: (name) => `"${name}" aggiunto alla lista della spesa`,
    fr: (name) => `"${name}" ajouté à votre liste de courses`,
    de: (name) => `"${name}" zur Einkaufsliste hinzugefügt`,
    es: (name) => `"${name}" añadido a tu lista de compras`,
    pt: (name) => `"${name}" adicionado à sua lista de compras`,
    nl: (name) => `"${name}" toegevoegd aan uw boodschappenlijst`,
    pl: (name) => `"${name}" dodano do listy zakupów`,
  },
  shoppingFailed: {
    en: (name, err) => `Failed to add "${name}": ${err}`,
    ro: (name, err) => `Nu am putut adăuga "${name}": ${err}`,
    it: (name, err) => `Impossibile aggiungere "${name}": ${err}`,
    fr: (name, err) => `Impossible d'ajouter "${name}": ${err}`,
    de: (name, err) => `"${name}" konnte nicht hinzugefügt werden: ${err}`,
    es: (name, err) => `No se pudo añadir "${name}": ${err}`,
    pt: (name, err) => `Não foi possível adicionar "${name}": ${err}`,
    nl: (name, err) => `"${name}" kon niet worden toegevoegd: ${err}`,
    pl: (name, err) => `Nie udało się dodać "${name}": ${err}`,
  },
  shoppingList: {
    en: (n) => `You have ${n} items in your shopping list`,
    ro: (n) => `Ai ${n} produse în lista de cumpărături`,
    it: (n) => `Hai ${n} articoli nella lista della spesa`,
    fr: (n) => `Vous avez ${n} articles dans votre liste de courses`,
    de: (n) => `Sie haben ${n} Artikel in Ihrer Einkaufsliste`,
    es: (n) => `Tienes ${n} artículos en tu lista de compras`,
    pt: (n) => `Você tem ${n} itens na sua lista de compras`,
    nl: (n) => `U heeft ${n} items in uw boodschappenlijst`,
    pl: (n) => `Masz ${n} produktów na liście zakupów`,
  },
  agendaList: {
    en: (n) => `You have ${n} events in your calendar`,
    ro: (n) => `Ai ${n} evenimente în calendar`,
    it: (n) => `Hai ${n} eventi nel tuo calendario`,
    fr: (n) => `Vous avez ${n} événements dans votre calendrier`,
    de: (n) => `Sie haben ${n} Termine in Ihrem Kalender`,
    es: (n) => `Tienes ${n} eventos en tu calendario`,
    pt: (n) => `Você tem ${n} eventos no seu calendário`,
    nl: (n) => `U heeft ${n} evenementen in uw agenda`,
    pl: (n) => `Masz ${n} wydarzeń w kalendarzu`,
  },
};

// Get translated message, fall back to English
function msg(key, lang, ...args) {
  const map = MESSAGES[key];
  if (!map) return '';
  const fn = map[lang] || map['en'];
  return fn(...args);
}

// ============================================================================
// HELPERS
// ============================================================================

function vogoUrl(path) {
  const p = String(path || '').replace(/^\/+/, '');
  return `${BACKEND_URL}/${p}`;
}

function cleanInput(v) {
  // trims + removes accidental wrapping quotes from UI copy/paste
  return String(v ?? '').trim().replace(/^"+|"+$/g, '');
}

function defaultHeaders() {
  // Browser-like headers to reduce WP security blocks
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 VOGO-Chatbot/1.0',
  };
}

async function readJsonSafe(res) {
  return res.json().catch(() => ({}));
}

// ============================================================================
// PERFORMANCE FIX: fetchWithTimeout
// ============================================================================
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .then(res => { clearTimeout(timer); return res; })
    .catch(err => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms — API may be slow or unreachable`);
      }
      throw err;
    });
}

// Single retry helper for 429 (respects Retry-After if present)
async function fetchRetry429(url, options, timeoutMs, label = 'request') {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (res.status !== 429) return res;

  const retryAfter = Number(res.headers?.get?.('retry-after') || 8);
  console.warn(`⚠️  [${label}] 429 rate limited. Retrying after ${retryAfter}s...`);
  await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
  return fetchWithTimeout(url, options, timeoutMs);
}

// ============================================================================
// AUTHENTICATION (APP TOKEN for general API calls)
// Login: POST /vogo/v1/public/login_jwt/
// ============================================================================
async function loginJwt() {
  const loginUrl = vogoUrl('vogo/v1/public/login_jwt/');

  console.log('🔐 Logging in to API...');
  console.log(`   URL: ${loginUrl}`);

  const res = await fetchRetry429(loginUrl, {
    method: 'POST',
    headers: defaultHeaders(),
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  }, 15000, 'app-login');

  const data = await readJsonSafe(res);

  if (!res.ok) {
    console.error('❌ Login failed:', data);
    throw new Error(`JWT login failed ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data.token) {
    throw new Error(`JWT login missing token: ${JSON.stringify(data)}`);
  }

  cachedToken = data.token;
  const expiresInSec = Number(data.expires_in || 3600);
  tokenExpiresAt = Date.now() + expiresInSec * 1000 - 60_000;

  console.log('✅ API Login successful');
  console.log(`   User: ${data.user_email || USERNAME}`);
  return cachedToken;
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  if (loginInProgress) {
    console.log('[AUTH] Login already in progress — waiting for existing login to complete...');
    return loginInProgress;
  }

  loginInProgress = loginJwt().finally(() => { loginInProgress = null; });
  return loginInProgress;
}

async function getAuthHeaders() {
  const token = await getToken();
  return {
    ...defaultHeaders(),
    'Authorization': `Bearer ${token}`
  };
}

// ============================================================================
// VIP BEARER TOKEN (ONLY when VIP login is attempted)
// Fetches Bearer from public login using app credentials.
// ============================================================================
async function getProdToken() {
  if (cachedProdToken && Date.now() < prodTokenExpiresAt) return cachedProdToken;
  if (prodLoginInProgress) return prodLoginInProgress;

  prodLoginInProgress = (async () => {
    const url = `${BACKEND_URL}/vogo/v1/public/login_jwt/`;
    console.log('🔐 [bearer] Fetching from', url);

    const res = await fetchRetry429(url, {
      method: 'POST',
      headers: defaultHeaders(),
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    }, 15000, 'bearer');

    const data = await readJsonSafe(res);

    if (!res.ok || !data.token) {
      console.warn('⚠️  [bearer] Failed:', data.message || data.code || res.status);
      return null;
    }

    cachedProdToken = data.token;
    prodTokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000) - 60_000;

    console.log('✅ [bearer] Cached');
    return cachedProdToken;
  })().finally(() => { prodLoginInProgress = null; });

  return prodLoginInProgress;
}

// ============================================================================
// USER LOGIN
// Step 1: BACKEND_URL/vogo/v1/public/login_jwt/ — general users
// Step 2: BACKEND_URL/vogo/v1/client/login_jwt/ — VIP users (requires cached Bearer)
// ============================================================================
async function loginUserJwt(username, password) {
  const publicUrl = `${BACKEND_URL}/vogo/v1/public/login_jwt/`;
  const clientUrl = `${BACKEND_URL}/vogo/v1/client/login_jwt/`;

  const u = cleanInput(username);
  const p = cleanInput(password);

  async function attemptLogin(url, label, bearerToken = null) {
    console.log(`🔐 [${label}] ${u} → ${url}`);
    const headers = { ...defaultHeaders() };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
      console.log(`🔑 [${label}] Using Bearer token`);
    }

    const res = await fetchRetry429(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: u, password: p })
    }, 15000, label);

    const data = await readJsonSafe(res);
    return { res, data };
  }

  function parseSuccess(data) {
    let userRoles = [];
    if (Array.isArray(data.user_roles)) userRoles = data.user_roles;
    else if (typeof data.user_roles === 'string') userRoles = data.user_roles.split(',').map(r => r.trim());
    else if (Array.isArray(data.roles)) userRoles = data.roles;

    const rolesStr = userRoles.join(' ').toLowerCase();
    let aiEngine = 'ai_groq';
    if (rolesStr.includes('ai_openai')) aiEngine = 'ai_openai';
    else if (rolesStr.includes('ai_gemini')) aiEngine = 'ai_gemini';
    else if (
      rolesStr.includes('vip') ||
      rolesStr.includes('premium') ||
      rolesStr.includes('customer') ||
      rolesStr.includes('client')
    ) aiEngine = 'ai_openai';

    console.log(`✅ Login OK: ${data.user_email || u} | roles: [${userRoles.join(', ')}] | engine: ${aiEngine}`);

    return {
      success: true,
      token: data.token,
      userEmail: data.user_email || u,
      userId: data.user_id || data.ID || data.id || null,
      userRoles,
      aiEngine,
      message: `Welcome, ${data.user_email || u}!`
    };
  }

  function shouldTryVip(res, data) {
    const code = String(data?.code || '').toLowerCase();
    const message = String(data?.message || '').toLowerCase();

    // Only try VIP when it's a permission/endpoint restriction signal.
    // DO NOT try VIP just for wrong password (usually 401 with "invalid").
    const looksLikeInvalidCreds =
      message.includes('invalid') ||
      message.includes('incorrect') ||
      message.includes('wrong') ||
      message.includes('unknown user') ||
      message.includes('authentication failed');

    const looksForbidden =
      res.status === 403 ||
      code.includes('rest_forbidden') ||
      message.includes('not allowed') ||
      message.includes('forbidden') ||
      message.includes('vip') ||
      message.includes('client');

    return looksForbidden && !looksLikeInvalidCreds;
  }

  try {
    const { res: res1, data: data1 } = await attemptLogin(publicUrl, 'public');

    if (res1.ok && data1.token) return parseSuccess(data1);

    if (shouldTryVip(res1, data1)) {
      console.log(`⚠️  Public rejected ${u} (${res1.status}) — trying VIP client endpoint...`);

      let bearer = (cachedProdToken && Date.now() < prodTokenExpiresAt) ? cachedProdToken : null;
      if (!bearer) bearer = await getProdToken();

      if (!bearer) {
        return {
          success: false,
          message: 'VIP login unavailable (bearer token not available). Please try again later.',
          token: null,
          userRoles: [],
          aiEngine: 'ai_groq'
        };
      }

      const { res: res2, data: data2 } = await attemptLogin(clientUrl, 'client', bearer);
      if (res2.ok && data2.token) return parseSuccess(data2);

      console.error('❌ VIP login failed:', data2);
      return {
        success: false,
        message: data2.error || data2.message || data1.message || `Login failed (${res2.status})`,
        token: null,
        userRoles: [],
        aiEngine: 'ai_groq'
      };
    }

    // No VIP attempt — normal failure
    return {
      success: false,
      message: data1.message || data1.error || `Login failed (${res1.status})`,
      token: null,
      userRoles: [],
      aiEngine: 'ai_groq'
    };
  } catch (err) {
    return {
      success: false,
      message: err.message.includes('timed out')
        ? 'Login timed out. Please try again.'
        : `Login error: ${err.message}`,
      token: null,
      userRoles: [],
      aiEngine: 'ai_groq'
    };
  }
}

// ============================================================================
// GENERIC API CALL WRAPPER
// ============================================================================
async function apiCall(endpoint, method = 'POST', body = null) {
  const url = vogoUrl(`vogo/v1${endpoint}`);
  const headers = await getAuthHeaders();

  const options = { method, headers };
  if (method === 'POST') options.body = body ? JSON.stringify(body) : '';

  const startTime = Date.now();
  console.log(`🌐 API ${method}: ${endpoint}`);
  if (body) console.log('   Body:', JSON.stringify(body).substring(0, 100));

  try {
    const res = await fetchWithTimeout(url, options, 60000);
    const data = await readJsonSafe(res);
    const responseTime = Date.now() - startTime;

    if (!res.ok) {
      console.error(`❌ API Error ${res.status}:`, data);
      const logData = { endpoint, method, requestBody: body, responseBody: data, status: res.status, responseTime, error: data.message };
      if (loggingService && typeof loggingService.logApiCall === 'function') loggingService.logApiCall(endpoint, method, body, data, res.status, responseTime);
      return { success: false, error: data.message || `HTTP ${res.status}`, status: res.status, data };
    }

    console.log('✅ API Success');
    const logData = { endpoint, method, requestBody: body, responseBody: data, status: res.status, responseTime };
    if (loggingService && typeof loggingService.logApiCall === 'function') loggingService.logApiCall(endpoint, method, body, data, res.status, responseTime);
    return { success: true, data };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ API Call Failed:', error.message);
    if (loggingService && typeof loggingService.logApiCall === 'function') loggingService.logApiCall(endpoint, method, body, { error: error.message }, 0, responseTime);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PREDEFINED Q&A
// ============================================================================
async function fetchPredefinedQA(parentId = null, lang = 'en') {
  const body = { parent_id: parentId === undefined ? null : parentId };
  if (lang && lang !== 'en') body.lang = lang;

  const result = await apiCall('/predefined_qa', 'POST', body);

  if (result.success) {
    const data = result.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.questions)) return data.questions;
    return data;
  }

  throw new Error(result.error || 'Failed to fetch predefined QA');
}

// ============================================================================
// SHOPPING LIST API
// ============================================================================
async function addShoppingItem(productName, quantity = 1, productId = null, vendor = null, otherInfo = null, lang = 'en') {
  const body = { product_name: productName, quantity, done_checked: 0 };
  if (productId) body.product_id = productId;
  if (vendor) body.product_vendor = vendor;
  if (otherInfo) body.other_info = otherInfo;

  const result = await apiCall('/shopListAddItem', 'POST', body);

  return {
    success: result.success,
    item: result.data,
    message: result.success
      ? msg('shoppingAdded', lang, productName)
      : msg('shoppingFailed', lang, productName, result.error)
  };
}

async function getShoppingList(lang = 'en') {
  const result = await apiCall('/shopListShowUserItems', 'POST', null);

  if (result.success) {
    let rawItems = [];
    const data = result.data;
    if (Array.isArray(data)) rawItems = data;
    else if (Array.isArray(data?.data)) rawItems = data.data;
    else if (Array.isArray(data?.items)) rawItems = data.items;

    const parseDone = v => v === 1 || v === true || v === '1' || v === 'true';
    const items = rawItems.map(i => ({
      ...i,
      id: i.id || i.item_id || i.list_id,
      _name: i.product_name || i.item_name || i.name || i.title || i.item_text || i.product || '',
      _done: parseDone(i.done_checked) || parseDone(i.is_done) || parseDone(i.done) || parseDone(i.completed)
    }));

    return {
      success: true,
      items,
      count: items.length,
      message: msg('shoppingList', lang, items.length)
    };
  }

  return {
    success: false,
    items: [],
    error: result.error,
    message: `Failed to get shopping list: ${result.error}`
  };
}

async function deleteShoppingItem(itemId) {
  const result = await apiCall('/shopListDeleteItem', 'POST', { item_id: itemId });
  return {
    success: result.success,
    message: result.success ? 'Item deleted from shopping list' : `Failed to delete: ${result.error}`
  };
}

async function markShoppingItemDone(itemId) {
  const result = await apiCall('/shopListMarkDone', 'POST', { item_id: itemId, done_checked: 1 });
  return { success: result.success, message: result.success ? 'Item marked as done' : `Failed: ${result.error}` };
}

async function unmarkShoppingItemDone(itemId) {
  const result = await apiCall('/shopListMarkDone', 'POST', { item_id: itemId, done_checked: 0 });
  return { success: result.success, message: result.success ? 'Item unmarked' : `Failed: ${result.error}` };
}

// ============================================================================
// AGENDA/CALENDAR API
// ============================================================================
async function addAgendaItem(eventName, eventDatetime = null, location = null, duration = null, participants = null, lang = 'en') {
  const body = { event_name: eventName, done_checked: 0 };
  if (eventDatetime) body.event_datetime = eventDatetime;
  if (location) body.location = location;
  if (duration) body.duration = duration;
  if (participants) body.participants_names = participants;

  const result = await apiCall('/agendaAddItem', 'POST', body);

  return {
    success: result.success,
    event: result.data,
    message: result.success
      ? (eventDatetime ? msg('agendaAdded', lang, eventName, eventDatetime) : msg('agendaAddedNoDate', lang, eventName))
      : msg('agendaFailed', lang, eventName, result.error)
  };
}

async function getAgendaItems(dateFrom = null, dateTo = null, lang = 'en') {
  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAhead = new Date(now); oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

  const formatDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const body = { dateFrom: dateFrom || formatDate(oneYearAgo), dateTo: dateTo || formatDate(oneYearAhead) };
  const result = await apiCall('/agendaShowUserItems', 'POST', body);

  if (result.success) {
    let rawEvents = [];
    const data = result.data;
    if (Array.isArray(data)) rawEvents = data;
    else if (Array.isArray(data?.data)) rawEvents = data.data;
    else if (Array.isArray(data?.events)) rawEvents = data.events;
    else if (Array.isArray(data?.items)) rawEvents = data.items;

    const parseDoneAgenda = v => v === 1 || v === true || v === '1' || v === 'true';
    const events = rawEvents.map(e => ({
      ...e,
      id: e.id || e.event_id,
      _done: parseDoneAgenda(e.done_checked) || parseDoneAgenda(e.is_done) || parseDoneAgenda(e.done) || parseDoneAgenda(e.completed)
    }));

    return {
      success: true,
      events,
      count: events.length,
      message: msg('agendaList', lang, events.length)
    };
  }

  return {
    success: false,
    events: [],
    error: result.error,
    message: `Failed to get agenda: ${result.error}`
  };
}

async function deleteAgendaItem(eventId) {
  const result = await apiCall('/agendaDeleteItem', 'POST', { id: eventId });
  return { success: result.success, message: result.success ? 'Event deleted from calendar' : `Failed: ${result.error}` };
}

async function markAgendaItemDone(eventId) {
  const result = await apiCall('/agendaMarkDone', 'POST', { id: eventId, done_checked: 1 });
  return { success: result.success, message: result.success ? 'Event marked as done' : `Failed: ${result.error}` };
}

async function unmarkAgendaItemDone(eventId) {
  const result = await apiCall('/agendaMarkDone', 'POST', { id: eventId, done_checked: 0 });
  return { success: result.success, message: result.success ? 'Event unmarked' : `Failed: ${result.error}` };
}

// ============================================================================
// PRODUCT SEARCH API
// ============================================================================
async function searchProducts(searchText, location = 'Brașov') {
  const url = vogoUrl('vogo/v1/search_by_keyword');
  const headers = await getAuthHeaders();
  const body = { searchText, location };

  console.log('🌐 API POST: /search_by_keyword');
  console.log('   Body:', JSON.stringify(body).substring(0, 100));

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, 60000);

    const data = await readJsonSafe(res);

    if (!res.ok) {
      console.error(`❌ Search Error ${res.status}:`, data);
      return { success: false, products: [], error: data.message || `HTTP ${res.status}`, message: `Search failed: ${data.message || res.status}` };
    }

    let products = [];
    if (Array.isArray(data?.results)) products = data.results;
    else if (Array.isArray(data)) products = data;
    else if (Array.isArray(data?.products)) products = data.products;

    console.log(`✅ Search complete: ${products.length} results for "${searchText}"`);
    return {
      success: true,
      products,
      count: products.length,
      searchText: data?.searchText || searchText,
      message: products.length > 0
        ? `Found ${products.length} result(s) for "${searchText}"`
        : `No results found for "${searchText}"`
    };
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    const isTimeout = error.message.includes('timed out');
    return {
      success: false,
      products: [],
      error: error.message,
      message: isTimeout
        ? 'The search is taking longer than usual. Please try again in a moment.'
        : `Search failed: ${error.message}`
    };
  }
}

// ============================================================================
// HUMAN OPERATOR - Forum Chat API (Phase C)
// These methods use the USER's own token (not the app token)
// ============================================================================

async function apiCallWithUserToken(endpoint, body, userToken) {
  const url = vogoUrl(`vogo/v1${endpoint}`);
  const headers = {
    ...defaultHeaders(),
    'Authorization': `Bearer ${userToken}`
  };

  const options = { method: 'POST', headers };
  if (body) options.body = JSON.stringify(body);

  console.log(`🌐 API (user-token) POST: ${endpoint}`);
  if (body) console.log('   Body:', JSON.stringify(body).substring(0, 150));

  try {
    const res = await fetchWithTimeout(url, options, 30000);
    const data = await readJsonSafe(res);

    if (!res.ok) {
      console.error(`❌ API Error ${res.status}:`, data);
      return { success: false, error: data.message || `HTTP ${res.status}`, status: res.status, data };
    }

    console.log('✅ API Success');
    return { success: true, data };
  } catch (error) {
    console.error('❌ API Call Failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function getRandomSupportUser(userToken) {
  const result = await apiCallWithUserToken('/support/get-random-user', {}, userToken);
  if (result.success) {
    const d = result.data;
    // API returns: { userId: <own_id>, support_user: { user_id: <agent_id>, nickname: <agent_name> } }
    const supportUserId = (d.support_user && d.support_user.user_id) || d.user_id || d.id;
    const supportUserName = (d.support_user && d.support_user.nickname) || d.display_name || d.username || 'Support Agent';
    console.log(`[SUPPORT] Assigned support user: ${supportUserName} (ID: ${supportUserId})`);
    return { success: true, supportUserId, supportUserName };
  }
  return { success: false, error: result.error };
}

async function startChatThread(userToken, chatUserId, userEmail) {
  // Per client doc: must include chat_user_id, product_id, order_id, mesaj
  const result = await apiCallWithUserToken('/forum-chat/start_or_update_chat_thread', {
    chat_user_id: chatUserId,
    product_id: null,
    order_id: null,
    mesaj: `Transfer ${userEmail || 'user'} to human operator`
  }, userToken);

  if (result.success) {
    const d = result.data;
    const threadId = d.thread_id || d.id || d.post_id;
    console.log(`[THREAD] Got thread ID: ${threadId} for agent ${chatUserId}`);
    return { success: true, threadId };
  }
  console.error(`[THREAD] Failed:`, result.error);
  return { success: false, error: result.error };
}

async function getThreadAnswers(userToken, threadId) {
  const result = await apiCallWithUserToken('/forum-chat/get_answers_by_post_id', {
    post_id: threadId
  }, userToken);

  if (result.success) {
    const d = result.data;
    let answers = [];
    if (Array.isArray(d)) answers = d;
    else if (Array.isArray(d.answers)) answers = d.answers;
    else if (Array.isArray(d.data)) answers = d.data;
    return { success: true, answers };
  }
  return { success: false, error: result.error, answers: [] };
}

async function postThreadAnswer(userToken, threadId, message, imageUrl = null) {
  const payload = {
    PARENT_ID_vogo_forum_post: threadId,
    mesaj: message
  };
  if (imageUrl) {
    payload.image_url = imageUrl;
  }
  const result = await apiCallWithUserToken('/forum-chat/forum_post_answer', payload, userToken);

  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

async function getDiscussionsByUser(userToken, page = 1, perPage = 10) {
  const result = await apiCallWithUserToken('/forum-chat/get_forum_discussions_by_user', {
    POST_TYPE: 'CHAT',
    current_page: page,
    per_page: perPage
  }, userToken);

  if (result.success) {
    const d = result.data;
    let discussions = [];
    if (Array.isArray(d)) discussions = d;
    else if (Array.isArray(d.discussions)) discussions = d.discussions;
    else if (Array.isArray(d.data)) discussions = d.data;
    return {
      success: true,
      discussions,
      totalPages: d.total_pages || 1,
      totalItems: d.total_items || discussions.length
    };
  }
  return { success: false, error: result.error, discussions: [] };
}

async function getThreadById(userToken, threadId) {
  const result = await apiCallWithUserToken('/forum-chat/get_forum_discussion_by_id', {
    id: threadId
  }, userToken);

  if (result.success) {
    return { success: true, thread: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// EXPORTS
// ============================================================================

// ✅ IMPORTANT: No bearer warm-up. Bearer is fetched ONLY when VIP login is attempted.
module.exports = {
  getToken,
  loginJwt,
  loginUserJwt,
  fetchPredefinedQA,
  addShoppingItem,
  getShoppingList,
  deleteShoppingItem,
  markShoppingItemDone,
  unmarkShoppingItemDone,
  addAgendaItem,
  getAgendaItems,
  deleteAgendaItem,
  markAgendaItemDone,
  unmarkAgendaItemDone,
  searchProducts,
  // Human Operator (Phase C)
  getRandomSupportUser,
  startChatThread,
  getThreadAnswers,
  postThreadAnswer,
  getDiscussionsByUser,
  getThreadById
};