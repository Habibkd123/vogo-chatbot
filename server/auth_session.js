// ============================================================================
// auth_session.js - Per-User Authentication Session State Manager
// ============================================================================
// Manages the step-by-step login flow for users who want to connect their
// Vogo Family account to the chatbot.
//
// Flow:
//   Step 0: idle           - no auth in progress
//   Step 1: awaiting_username  - bot asked for username, waiting for user's reply
//   Step 2: awaiting_password  - bot got username, now waiting for password
//   Step 3: authenticated  - user has a valid token, stored here
//
// Key: userIp (string) | Value: session state object
// TTL: 10 minutes of inactivity clears the session
// ============================================================================

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory store: ip -> { step, username, pendingIntent, pendingText, token, userRoles, expiresAt }
const authSessions = new Map();

// Periodically clean expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of authSessions) {
    if (now > session.expiresAt) {
      authSessions.delete(key);
      console.log(`[AUTH_SESSION] Expired session cleaned for: ${key}`);
    }
  }
}, 60 * 1000);

// ============================================================================
// GET session for a user (returns null if not found or expired)
// ============================================================================
function getAuthSession(ip) {
  const session = authSessions.get(ip);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    authSessions.delete(ip);
    return null;
  }
  return session;
}

// ============================================================================
// SET / UPDATE session for a user
// Merges new data into existing session (or creates new one)
// ============================================================================
function setAuthSession(ip, data) {
  const existing = authSessions.get(ip) || {};
  authSessions.set(ip, {
    ...existing,
    ...data,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
}

// ============================================================================
// CLEAR session for a user (logout or auth complete)
// ============================================================================
function clearAuthSession(ip) {
  authSessions.delete(ip);
}

// ============================================================================
// START AUTH FLOW - called when user triggers a feature that needs login
// Saves the original intent so we can retry it after login succeeds
// ============================================================================
function startAuthFlow(ip, pendingIntent, pendingText, lang) {
  setAuthSession(ip, {
    step: 'awaiting_username',
    username: null,
    pendingIntent,
    pendingText,
    lang: lang || 'en',
    token: null,
    userRoles: []
  });
  console.log(`[AUTH_SESSION] Started auth flow for ${ip} | pendingIntent: ${pendingIntent}`);
}

// ============================================================================
// CHECK if user is authenticated (has a valid token stored)
// ============================================================================
function isAuthenticated(ip) {
  const session = getAuthSession(ip);
  return !!(session && session.token && session.step === 'authenticated');
}

// ============================================================================
// GET stored user token
// ============================================================================
function getUserToken(ip) {
  const session = getAuthSession(ip);
  return session ? session.token : null;
}

// ============================================================================
// GET user roles
// ============================================================================
function getUserRoles(ip) {
  const session = getAuthSession(ip);
  return session ? (session.userRoles || []) : [];
}

// ============================================================================
// COMPLETE AUTH - store token and mark as authenticated
// ============================================================================
function completeAuth(ip, token, userRoles, userEmail) {
  setAuthSession(ip, {
    step: 'authenticated',
    token,
    userRoles: userRoles || [],
    userEmail: userEmail || null
  });
  console.log(`[AUTH_SESSION] Auth completed for ${ip} | roles: ${(userRoles || []).join(', ')} | email: ${userEmail || 'N/A'}`);
}

module.exports = {
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  startAuthFlow,
  isAuthenticated,
  getUserToken,
  getUserRoles,
  completeAuth
};