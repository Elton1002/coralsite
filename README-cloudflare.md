# Deploy to Cloudflare Pages

This repository can deploy as a Cloudflare Pages site with Pages Functions for `/api/chat` and `/api/enquiry`.

## What was added

- `index.html` — copy of `coralsoft.html` so the homepage works on Pages.
- `functions/api/chat.js` — Cloudflare Pages Function that proxies requests to Anthropic.
- `functions/api/enquiry.js` — Cloudflare Pages Function that sends enquiry emails through Cloudflare Email Sending.

## Deploy steps

1. Create a Cloudflare Pages project.
2. Set the project root to this repository.
3. Set the framework preset to "None" and build command to empty.
4. Set the build output directory to `.`.
5. Add an environment variable in Pages:
   - `ANTHROPIC_API_KEY`
   - `CF_EMAIL_ACCOUNT_ID`
   - `CF_EMAIL_API_TOKEN`
   - `ENQUIRY_FROM_EMAIL`
   - `ENQUIRY_TO_EMAIL` (optional, defaults to `sale@supremebrands.co.zw`)
6. Deploy.

## Notes

- The page uses local image assets in `1/`, `4/`, `9/`, `18/`, `PT/`, `SV/`, and `CoralSoft Package mockups/`.
- The chat function handles `POST /api/chat` and the enquiry function handles `POST /api/enquiry`.
- Keep your `ANTHROPIC_API_KEY` secret.

## Local preview

This repository now includes Wrangler as a local development dependency.

To install dependencies and preview locally:

```bash
npm install
npm run pages:login
npm run pages:dev
```

## Wrangler configuration

A `wrangler.toml` file has been added to this repository so Cloudflare Pages can find your site root and Pages Functions.

The configuration includes:

- `name = "coralsoft-pages"`
- `compatibility_date = "2026-06-10"`
- `site.bucket = "."`
- `site.entry-point = "functions"`

This keeps `index.html` at the repo root and loads `functions/api/chat.js` for `/api/chat`.

If you prefer a global install, use:

```bash
npm install -g wrangler
wrangler pages dev .
```
