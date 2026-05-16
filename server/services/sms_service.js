// =============================================================================
// sms_service.js — Twilio SMS Integration for Vogo Chatbot
// =============================================================================
// Features:
//   - Transfer-to-human SMS alert to admin
//   - Send custom SMS from admin panel
//   - Conversation summary SMS
//   - Twilio free trial compatible
//
// Setup (Twilio Free Trial):
//   1. Go to https://www.twilio.com/try-twilio
//   2. Get Account SID, Auth Token, and a free Twilio phone number
//   3. Add to .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_ADMIN_TO
// =============================================================================

let twilioClient = null;
let smsConfig = {};
let smsEnabled = false;

// ---------------------------------------------------------------------------
// configure() — call once at server startup
// ---------------------------------------------------------------------------
function configure() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken  = process.env.TWILIO_AUTH_TOKEN  || '';
  const from       = process.env.TWILIO_FROM        || ''; // your Twilio number e.g. +15551234567
  const adminTo    = process.env.TWILIO_ADMIN_TO    || ''; // admin phone e.g. +923001234567

  smsConfig = { accountSid, authToken, from, adminTo };

  if (!accountSid || !authToken || !from || !adminTo) {
    console.log(' SmsService: DISABLED (set TWILIO_* in .env)');
    smsEnabled = false;
    return;
  }

  try {
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    smsEnabled = true;
    console.log(` SmsService: ENABLED → Twilio from ${from} → admin ${adminTo}`);
  } catch (e) {
    console.error(' SmsService: Failed to init Twilio:', e.message);
    smsEnabled = false;
  }
}

// ---------------------------------------------------------------------------
// isEnabled()
// ---------------------------------------------------------------------------
function isEnabled() {
  return smsEnabled;
}

// ---------------------------------------------------------------------------
// sendSms() — generic send
// ---------------------------------------------------------------------------
async function sendSms(to, body) {
  if (!smsEnabled || !twilioClient) {
    console.warn('[SMS] Attempted send but SMS is not configured.');
    return { success: false, error: 'SMS not configured' };
  }

  const toNumber = to || smsConfig.adminTo;
  if (!toNumber) return { success: false, error: 'No recipient number' };

  try {
    const msg = await twilioClient.messages.create({
      body: body.substring(0, 1600), // SMS max length
      from: smsConfig.from,
      to: toNumber
    });
    console.log(`[SMS] Sent to ${toNumber} (SID: ${msg.sid})`);
    return { success: true, sid: msg.sid, to: toNumber };
  } catch (err) {
    console.error('[SMS] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// sendTransferToHumanSms() — alert admin when bot transfers user to human
// ---------------------------------------------------------------------------
async function sendTransferToHumanSms({ userIp, userMessage, reason, language }) {
  if (!smsEnabled) return { success: false, error: 'SMS not configured' };

  const body = [
    '🚨 VOGO CHATBOT ALERT',
    `Transfer to Human Requested`,
    `Time: ${new Date().toLocaleTimeString()}`,
    `Lang: ${(language || 'en').toUpperCase()}`,
    reason ? `Reason: ${reason.substring(0, 60)}` : '',
    `Msg: "${(userMessage || '').substring(0, 100)}"`,
    `IP: ${userIp || 'Unknown'}`,
    `→ Login to admin panel to respond`
  ].filter(Boolean).join('\n');

  return sendSms(smsConfig.adminTo, body);
}

// ---------------------------------------------------------------------------
// sendCustomSms() — send any SMS from admin panel
// ---------------------------------------------------------------------------
async function sendCustomSms(to, message) {
  return sendSms(to, message);
}

// ---------------------------------------------------------------------------
// sendTestSms() — verify Twilio is working
// ---------------------------------------------------------------------------
async function sendTestSms(to) {
  const body = `✅ Vogo Chatbot SMS Test\nSMS notifications are working correctly!\nTime: ${new Date().toLocaleString()}`;
  return sendSms(to || smsConfig.adminTo, body);
}

// ---------------------------------------------------------------------------
// getStatus() — for admin panel
// ---------------------------------------------------------------------------
function getStatus() {
  return {
    enabled: smsEnabled,
    from: smsConfig.from || null,
    adminTo: smsConfig.adminTo || null,
    provider: 'Twilio'
  };
}

module.exports = {
  configure,
  isEnabled,
  sendSms,
  sendTransferToHumanSms,
  sendCustomSms,
  sendTestSms,
  getStatus
};
