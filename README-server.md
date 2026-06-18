# Local server for CoralSoft assistant

Steps to run locally:

1. Copy `.env.example` to `.env` and set your `ANTHROPIC_API_KEY`.

2. Install dependencies:

```bash
npm install
```

3. Start the website and chatbot together:

```bash
npm start
```

4. Open the site in your browser:

http://localhost:3000

Notes:
- `npm start` runs one Node server for both the website and the chatbot.
- The server serves `coralsoft.html` at `/` and exposes `POST /api/chat` which proxies requests to Anthropic using the API key from `.env`.
- The server also exposes `POST /api/enquiry` which sends enquiry emails through Cloudflare Email Sending.
- Keep your API key secret; do not commit `.env` to source control.

Environment variables for enquiries:

- `CF_EMAIL_ACCOUNT_ID`
- `CF_EMAIL_API_TOKEN`
- `ENQUIRY_FROM_EMAIL`
- `ENQUIRY_TO_EMAIL` (optional, defaults to `sales@supremebrands.co.zw`)
