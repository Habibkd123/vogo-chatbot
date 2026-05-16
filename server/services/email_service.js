// =============================================================================
// email_service.js — Nodemailer Email Integration for Vogo Chatbot
// =============================================================================
// Features:
//   - Transfer-to-human notifications
//   - Conversation summary emails
//   - Test email functionality
//   - Configurable SMTP (Gmail, Outlook, custom)
// =============================================================================

const nodemailer = require('nodemailer');

let transporter = null;
let emailConfig = {};
let emailEnabled = false;

// ---------------------------------------------------------------------------
// configure() — call once at server startup
// ---------------------------------------------------------------------------
function configure() {
  const host     = process.env.EMAIL_HOST     || '';
  const port     = parseInt(process.env.EMAIL_PORT || '587');
  const user     = process.env.EMAIL_USER     || '';
  const pass     = process.env.EMAIL_PASS     || '';
  const from     = process.env.EMAIL_FROM     || user;
  const adminTo  = process.env.EMAIL_ADMIN_TO || user;
  const secure   = process.env.EMAIL_SECURE   === 'true';

  emailConfig = { host, port, user, pass, from, adminTo, secure };

  if (!host || !user || !pass) {
    console.log(' EmailService: DISABLED (set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env)');
    emailEnabled = false;
    return;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  emailEnabled = true;
  console.log(` EmailService: ENABLED → SMTP ${host}:${port} (from: ${from})`);
}

// ---------------------------------------------------------------------------
// isEnabled() — check if email is configured
// ---------------------------------------------------------------------------
function isEnabled() {
  return emailEnabled;
}

// ---------------------------------------------------------------------------
// sendEmail() — generic send function
// ---------------------------------------------------------------------------
async function sendEmail({ to, subject, html, text }) {
  if (!emailEnabled || !transporter) {
    console.warn('[EMAIL] Attempted send but email is not configured.');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Vogo Chatbot" <${emailConfig.from}>`,
      to: to || emailConfig.adminTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    });
    console.log(`[EMAIL] Sent: ${subject} → ${to || emailConfig.adminTo} (id: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EMAIL] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// sendTransferToHumanEmail() — when chatbot transfers user to human agent
// ---------------------------------------------------------------------------
async function sendTransferToHumanEmail({ userIp, userMessage, reason, language, conversationHistory }) {
  if (!emailEnabled) return { success: false, error: 'Email not configured' };

  const historyHtml = (conversationHistory || []).slice(-10).map(t => `
    <tr>
      <td style="padding:6px 10px;background:#f0f4ff;border-radius:4px;"><strong>User:</strong> ${escapeHtml(t.userMessage || '')}</td>
    </tr>
    <tr>
      <td style="padding:6px 10px;background:#f9fafb;border-radius:4px;color:#555;"><strong>Bot:</strong> ${escapeHtml(t.botResponse || '')}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#f5f5f5;">
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:24px;color:white;">
          <h1 style="margin:0;font-size:22px;">🚨 Transfer to Human Agent</h1>
          <p style="margin:8px 0 0;opacity:0.9;">Vogo Chatbot — Action Required</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px;font-weight:bold;color:#666;width:140px;">User IP:</td><td style="padding:8px;">${escapeHtml(userIp || 'Unknown')}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Language:</td><td style="padding:8px;">${escapeHtml(language || 'en')}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Time:</td><td style="padding:8px;">${new Date().toLocaleString()}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Reason:</td><td style="padding:8px;color:#dc2626;">${escapeHtml(reason || 'User requested human agent')}</td></tr>
          </table>
          <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
            <strong>Last User Message:</strong><br>
            <span style="font-size:16px;">"${escapeHtml(userMessage || '')}"</span>
          </div>
          <h3 style="color:#333;border-bottom:2px solid #667eea;padding-bottom:8px;">Conversation History</h3>
          <table style="width:100%;border-spacing:0 4px;">${historyHtml}</table>
          <div style="margin-top:24px;padding:16px;background:#f0f4ff;border-radius:8px;text-align:center;">
            <p style="margin:0;color:#555;">Please contact this user as soon as possible.</p>
          </div>
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;color:#999;font-size:12px;">
          Vogo Chatbot Admin Notification • ${new Date().getFullYear()}
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: emailConfig.adminTo,
    subject: `🚨 [Vogo Chatbot] Human Agent Transfer Request — ${new Date().toLocaleTimeString()}`,
    html
  });
}

// ---------------------------------------------------------------------------
// sendDailySummaryEmail() — send daily stats summary to admin
// ---------------------------------------------------------------------------
async function sendDailySummaryEmail({ totalRequests, totalConversations, topIntents, errorCount, uptime }) {
  if (!emailEnabled) return { success: false, error: 'Email not configured' };

  const intentsHtml = (topIntents || []).map(([intent, count]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(intent)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold;color:#667eea;">${count}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#f5f5f5;">
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;color:white;">
          <h1 style="margin:0;font-size:22px;">📊 Daily Chatbot Summary</h1>
          <p style="margin:8px 0 0;opacity:0.9;">${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding:24px;">
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#10b981;">${totalRequests || 0}</div>
              <div style="color:#666;font-size:13px;margin-top:4px;">Total Messages</div>
            </div>
            <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#3b82f6;">${totalConversations || 0}</div>
              <div style="color:#666;font-size:13px;margin-top:4px;">Conversations</div>
            </div>
            <div style="background:#fef3c7;border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#f59e0b;">${errorCount || 0}</div>
              <div style="color:#666;font-size:13px;margin-top:4px;">Errors</div>
            </div>
            <div style="background:#f5f3ff;border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#8b5cf6;">${Math.floor((uptime || 0)/3600)}h</div>
              <div style="color:#666;font-size:13px;margin-top:4px;">Uptime</div>
            </div>
          </div>
          ${intentsHtml ? `
          <h3 style="color:#333;border-bottom:2px solid #10b981;padding-bottom:8px;">Top Intents</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>
              <th style="padding:8px 12px;background:#f0fdf4;text-align:left;">Intent</th>
              <th style="padding:8px 12px;background:#f0fdf4;text-align:right;">Count</th>
            </tr></thead>
            <tbody>${intentsHtml}</tbody>
          </table>` : ''}
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;color:#999;font-size:12px;">
          Vogo Chatbot Daily Report • Auto-generated
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: emailConfig.adminTo,
    subject: `📊 [Vogo Chatbot] Daily Summary — ${new Date().toLocaleDateString()}`,
    html
  });
}

// ---------------------------------------------------------------------------
// sendTestEmail() — verify SMTP config works
// ---------------------------------------------------------------------------
async function sendTestEmail(to) {
  return sendEmail({
    to: to || emailConfig.adminTo,
    subject: '✅ [Vogo Chatbot] Email Test Successful',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f0fdf4;border-radius:12px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">✅</div>
        <h2 style="color:#10b981;margin:0 0 12px;">Email is Working!</h2>
        <p style="color:#555;">Your Nodemailer SMTP configuration is correct.<br>Vogo Chatbot will send notifications to this address.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Sent at ${new Date().toLocaleString()}</p>
      </div>
    `
  });
}

// ---------------------------------------------------------------------------
// verifyConnection() — test SMTP connection without sending
// ---------------------------------------------------------------------------
async function verifyConnection() {
  if (!emailEnabled || !transporter) return { ok: false, error: 'Not configured' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// getStatus() — for admin panel
// ---------------------------------------------------------------------------
function getStatus() {
  return {
    enabled: emailEnabled,
    host: emailConfig.host || null,
    port: emailConfig.port || null,
    from: emailConfig.from || null,
    adminTo: emailConfig.adminTo || null
  };
}

// ---------------------------------------------------------------------------
// Utility: escape HTML to prevent XSS in emails
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  configure,
  isEnabled,
  sendEmail,
  sendTransferToHumanEmail,
  sendDailySummaryEmail,
  sendTestEmail,
  verifyConnection,
  getStatus
};
