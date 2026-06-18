const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CF_EMAIL_ACCOUNT_ID = process.env.CF_EMAIL_ACCOUNT_ID;
const CF_EMAIL_API_TOKEN = process.env.CF_EMAIL_API_TOKEN;
const ENQUIRY_FROM_EMAIL = process.env.ENQUIRY_FROM_EMAIL;
const ENQUIRY_TO_EMAIL = process.env.ENQUIRY_TO_EMAIL || 'sale@supremebrands.co.zw';

if(!ANTHROPIC_API_KEY){
  console.warn('Warning: ANTHROPIC_API_KEY not set. /api/chat will return a local mock response until a key is configured.');
}

app.use(express.json({limit:'1mb'}));

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

// Serve static files from project root so the website and chatbot run from one server.
app.use(express.static(path.join(__dirname)));

app.post('/api/enquiry', async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  try {
    const result = await sendEnquiryEmail({
      type: String(payload.type || 'enquiry').trim(),
      name: String(payload.name).trim(),
      email: String(payload.email).trim(),
      message: String(payload.message || '').trim(),
      product: String(payload.product || '').trim(),
      source: String(payload.source || 'website').trim(),
    });

    if (!result.ok) {
      return res.status(503).json(result);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Enquiry email error', error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({
      error: 'Failed to send enquiry email',
      details: error.response?.data || error.message,
    });
  }
});

app.post('/api/chat', async (req, res) => {
  if(!ANTHROPIC_API_KEY){
    // Return a lightweight mock response so the frontend can function without a real API key.
    const userMsgs = (req.body && req.body.messages) || [];
    const lastUser = userMsgs.length? userMsgs[userMsgs.length-1].content || userMsgs[userMsgs.length-1] : '';
    const mock = {
      mock: true,
      message: `Mock reply: I don't have an API key configured. You asked: "${String(lastUser).slice(0,200)}". This is a demo response.`
    };
    return res.json(mock);
  }
  try{
    const resp = await axios.post('https://api.anthropic.com/v1/messages', req.body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANTHROPIC_API_KEY}`
      },
      timeout: 20000
    });
    res.json(resp.data);
  }catch(err){
    console.error('Anthropic proxy error', err.response?.data || err.message);
    const status = err.response?.status || 500;
    res.status(status).json({error:'upstream error', details: err.response?.data || err.message});
  }
});

app.listen(PORT, () => {
  console.log(`CoralSoft website and chatbot running at http://localhost:${PORT}`);
});
