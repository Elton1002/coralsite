const express = require('express');
const axios = require('axios');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CF_EMAIL_ACCOUNT_ID = process.env.CF_EMAIL_ACCOUNT_ID;
const CF_EMAIL_API_TOKEN = process.env.CF_EMAIL_API_TOKEN;
const ENQUIRY_FROM_EMAIL = process.env.ENQUIRY_FROM_EMAIL;
const ENQUIRY_TO_EMAIL = process.env.ENQUIRY_TO_EMAIL || 'sales@supremebrands.co.zw';
const ALLOWED_CHAT_MODEL = 'claude-sonnet-4-20250514';
const MAX_CHAT_TOKENS = 800;
const MAX_CHAT_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 2000;

if(!ANTHROPIC_API_KEY){
  console.warn('Warning: ANTHROPIC_API_KEY not set. /api/chat will return a local mock response until a key is configured.');
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enquiries. Please try again later.' },
});

app.use(express.json({limit:'100kb'}));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function buildEnquiryText(payload) {
  const lines = [
    `Type: ${payload.type || 'enquiry'}`,
    `Name: ${payload.name || ''}`,
    `Email: ${payload.email || ''}`,
  ];
  if (payload.product) lines.push(`Product: ${payload.product}`);
  if (payload.message) lines.push(`Message: ${payload.message}`);
  if (payload.source) lines.push(`Source: ${payload.source}`);
  return lines.join('\n');
}

function buildEnquiryHtml(payload) {
  const rows = [
    ['Type', payload.type || 'enquiry'],
    ['Name', payload.name || ''],
    ['Email', payload.email || ''],
  ];
  if (payload.product) rows.push(['Product', payload.product]);
  if (payload.message) rows.push(['Message', payload.message]);
  if (payload.source) rows.push(['Source', payload.source]);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;">CoralSoft enquiry</h2>
      <table style="border-collapse:collapse;">${rows.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-weight:600;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(value)}</td></tr>`).join('')}</table>
    </div>
  `;
}

async function sendEnquiryEmail(payload) {
  if (!CF_EMAIL_ACCOUNT_ID || !CF_EMAIL_API_TOKEN || !ENQUIRY_FROM_EMAIL) {
    return {
      ok: false,
      configured: false,
      message: 'Email service is not configured. Set CF_EMAIL_ACCOUNT_ID, CF_EMAIL_API_TOKEN, and ENQUIRY_FROM_EMAIL.'
    };
  }

  const response = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${CF_EMAIL_ACCOUNT_ID}/email/sending/send`,
    {
      from: { address: ENQUIRY_FROM_EMAIL, name: 'CoralSoft Website' },
      to: ENQUIRY_TO_EMAIL,
      subject: `CoralSoft enquiry: ${payload.name}${payload.product ? ` - ${payload.product}` : ''}`,
      reply_to: { address: payload.email, name: payload.name },
      text: buildEnquiryText(payload),
      html: buildEnquiryHtml(payload),
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CF_EMAIL_API_TOKEN}`,
      },
      timeout: 20000,
    }
  );

  return { ok: true, data: response.data };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'coralsoft.html'));
});

const BLOCKED_FILES = [
  'server.js', 'package.json', 'package-lock.json',
  'wrangler.toml', '.env.example', '.gitignore',
  'README-server.md', 'README-cloudflare.md',
];

app.use((req, res, next) => {
  const requestedFile = path.basename(decodeURIComponent(req.path));
  if (BLOCKED_FILES.includes(requestedFile)) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(path.join(__dirname), {
  dotfiles: 'deny',
  index: false,
}));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ENQUIRY_TYPES = ['enquiry', 'product-enquiry', 'contact'];

app.post('/api/enquiry', enquiryLimiter, async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const email = String(payload.email).trim();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const type = String(payload.type || 'enquiry').trim();
  if (!VALID_ENQUIRY_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid enquiry type.' });
  }

  try {
    const result = await sendEnquiryEmail({
      type,
      name: String(payload.name).trim().slice(0, 200),
      email: email.slice(0, 254),
      message: String(payload.message || '').trim().slice(0, 2000),
      product: String(payload.product || '').trim().slice(0, 200),
      source: String(payload.source || 'website').trim().slice(0, 50),
    });

    if (!result.ok) {
      return res.status(503).json({ error: 'Email service is not available.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Enquiry email error', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to send enquiry email.' });
  }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  if(!ANTHROPIC_API_KEY){
    return res.json({ mock: true, message: 'Chat is running in demo mode.' });
  }

  const userMessages = req.body && req.body.messages;
  if (!Array.isArray(userMessages) || userMessages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  if (userMessages.length > MAX_CHAT_MESSAGES) {
    return res.status(400).json({ error: 'Too many messages in conversation.' });
  }

  const sanitized = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, MAX_MESSAGE_LENGTH),
  }));

  try{
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: ALLOWED_CHAT_MODEL,
      max_tokens: MAX_CHAT_TOKENS,
      system: req.body.system ? String(req.body.system).slice(0, 4000) : undefined,
      messages: sanitized,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      timeout: 20000
    });
    res.json(resp.data);
  }catch(err){
    console.error('Anthropic proxy error', err.response?.data || err.message);
    res.status(502).json({ error: 'Chat service temporarily unavailable.' });
  }
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 413 ? 'Request too large.' : 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`CoralSoft website and chatbot running at http://localhost:${PORT}`);
});
