# FormBridge

> Clone this, fill in `.env` + `fields.json`, deploy — get a working contact-form → Google Sheet → email pipeline. No database, no build step, ~300 lines total.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![No framework frontend](https://img.shields.io/badge/frontend-vanilla%20JS-blue.svg)

Built for the **Persnox Media** website contact form, open-sourced so anyone can fork it for their own site.

---

## What it does

```
Browser form (/public) ──POST /api/submit──▶ Express ──┬──▶ Google Sheet (append row)
                                                        └──▶ Email notify (Gmail SMTP)
                                                        └──▶ fallback-log.jsonl (if Sheets fails)
```

1. Visitor fills the hosted form (or your own site's form posts to the API).
2. Backend validates + sanitizes against `fields.json` (`validate.js`).
3. Appends one row to your Google Sheet via service account (`sheets.js`).
4. Sends you an email notification (`notify.js`, Nodemailer + Gmail App Password).
5. Returns `{ success: true }` JSON so the UI can show a confirmation. Nothing is ever silently lost — Sheets failures are logged locally.

## Features

- **Fork-friendly config** — form fields defined once in `fields.json`; backend validation *and* hosted frontend auto-render from it. No HTML editing to add/remove a field.
- **Hosted form UI** — `/public` (vanilla JS + Tailwind CDN) served statically by Express. Drop-in embeddable via iframe or copy-paste fetch block.
- **Spam protection** — honeypot hidden field + per-IP rate limiting (`express-rate-limit`).
- **Sheet-injection safe** — `validator.escape()` on every string + `'` prefix on values starting with `= + - @` (classic CSV/Sheets formula injection).
- **Resilient** — Sheets write failure → append to `fallback-log.jsonl`, still notify, return honest JSON status.
- **Observable** — `GET /health` endpoint for uptime monitors.

---

## Project structure

```
FormBridge/
├── index.js            # Express server, CORS, static /public, /health, /api/config, /api/submit
├── validate.js         # validateAndSanitize(body, fieldDefs) — ~20 lines
├── sheets.js           # appendRow() — googleapis + service-account JWT
├── notify.js           # sendNotification() — Nodemailer (Gmail App Password)
├── fields.json         # single source of truth: field defs → Sheet columns
├── public/
│   ├── index.html      # Tailwind CDN + HyperUI/Flowbite-inspired markup
│   ├── form.js         # renders inputs from /api/config, honeypot, fetch submit
│   └── style.css       # offscreen honeypot class, toasts
├── .env.example        # all required env vars (no secrets)
├── vercel.json         # Vercel deploy config
├── LICENSE (MIT)
└── CONTRIBUTING.md
```

---

## 10-minute setup

### 1. Create a Google service account

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → New project (any name, e.g. `formbridge`).
2. **APIs & Services → Enable APIs** → enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create** → name it `formbridge-writer` → Create (no roles needed).
4. Open the account → **Keys → Add key → JSON** → downloads a `.json` file. Keep it private.
5. From that JSON note `client_email` and `private_key`.

### 2. Share your Sheet

1. Create (or open) the target Google Sheet. First row = headers, e.g. `Name | Email | Message | Timestamp`.
2. Click **Share** → paste the service-account `client_email` → **Editor** → Send (no email needed).
3. Copy the **Sheet ID** from the URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

### 3. Configure env

```bash
cp .env.example .env
```

Fill in `.env` (see table below). **Gotcha that trips up everyone:**

> `GOOGLE_PRIVATE_KEY` in `.env` must keep its literal `\n` characters. In code we run `.replace(/\\n/g, '\n')` to restore real newlines. Paste the key *as-is* inside double quotes, e.g. `"-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"`.

| Var | Example | Notes |
|-----|---------|-------|
| `PORT` | `3000` | local port |
| `CORS_ORIGIN` | `https://persnoxmedia.com` | locked to your domain; forkers change one value |
| `SHEET_ID` | `1AbC…xyz` | from Sheet URL |
| `SHEET_RANGE` | `Sheet1!A:D` | must cover your columns |
| `GOOGLE_CLIENT_EMAIL` | `…@….iam.gserviceaccount.com` | from service-account JSON |
| `GOOGLE_PRIVATE_KEY` | `"-----BEGIN…\n…\n-----END…\n"` | quoted, `\n` intact (see above) |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail default |
| `SMTP_PORT` | `465` | 465 (SSL) |
| `SMTP_USER` | `you@gmail.com` | your Gmail |
| `SMTP_PASS` | `xxxx xxxx xxxx xxxx` | **App Password**, not login password (see below) |
| `NOTIFY_TO` | `you@gmail.com` | where notifications go |

### 4. Run

```bash
npm install
npm start
# → http://localhost:3000  (form)
# → http://localhost:3000/health
```

### 5. Deploy (free tier)

- **Render:** New Web Service → repo → Build `npm install`, Start `npm start` → set env vars in dashboard.
- **Vercel:** `vercel.json` included (routes `/` → static, `/api/*` → server). Set env vars in project settings → Deploy.

---

## Gmail App Password (zero-cost notify path)

Resend needs a domain + API key; Gmail App Password works immediately, which is why it's the default:

1. Google Account → **Security → 2-Step Verification** → turn **ON**.
2. **Security → App passwords** → create one for `Mail` → copy the 16-char code.
3. Put it in `SMTP_PASS`. Keep it in `.env` only — never commit.

---

## `fields.json` — customize without touching code

```json
{
  "honeypot": "company_website",
  "fields": [
    { "name": "name",    "label": "Your name",  "type": "text",     "column": "A", "required": true,  "maxLength": 100 },
    { "name": "email",   "label": "Email",      "type": "email",    "column": "B", "required": true,  "maxLength": 254 },
    { "name": "message", "label": "Message",    "type": "textarea", "column": "C", "required": true,  "maxLength": 2000 }
  ]
}
```

- `column` maps the field to a Sheet column (`sheets.js` orders values by it).
- `GET /api/config` exposes this (labels/types only) so `form.js` auto-renders matching inputs. Change the JSON → both backend validation and frontend update.

---

## API contract

### `GET /health`

```json
{ "status": "ok", "uptime": 123.4, "timestamp": "2026-09-20T09:00:00.000Z" }
```

### `GET /api/config`

Returns `fields.json` for the frontend renderer.

### `POST /api/submit`

Request (`Content-Type: application/json`):

```json
{ "name": "Ada", "email": "ada@example.com", "message": "Hello!", "company_website": "" }
```

- `company_website` is the honeypot — humans leave it blank (it's offscreen via CSS, not `display:none`, so bots still fill it). If non-empty → silent `{ "success": true }` (bot fooled, nothing written).
- Rate limited: ~10 requests / 15 min / IP (tune in `index.js`).

Responses:

```json
// full success
{ "success": true }
// Sheets failed but logged + emailed
{ "success": false, "logged": true, "error": "sheets_write_failed" }
// validation error
{ "success": false, "errors": ["email is invalid"] }
```

Fallback: failed Sheets writes are appended to `fallback-log.jsonl` (`{ timestamp, data, error }` per line) for manual replay.

---

## Use the form on your own site

Hosted form lives at `https://<your-deploy>/` . Two embed options:

**Option A — iframe (easiest):**

```html
<iframe src="https://<your-deploy>/" width="100%" height="620" style="border:0" title="Contact form"></iframe>
```

**Option B — native POST from any site:**

```html
<form id="contact">
  <input name="name" required maxlength="100" />
  <input name="email" type="email" required />
  <textarea name="message" required></textarea>
  <!-- honeypot: keep offscreen, not display:none -->
  <input name="company_website" class="hp" tabindex="-1" autocomplete="off" />
  <button>Send</button>
</form>
<script>
fetch("https://<your-deploy>/api/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(Object.fromEntries(new FormData(document.querySelector("#contact"))))
});
</script>
```

Set `CORS_ORIGIN` to your site's domain so browsers allow it.

---

## Security notes

- Honeypot + rate limiting are basic spam filters, not CAPTCHA. Add Cloudflare Turnstile/hCaptcha if spam persists.
- All strings are HTML-escaped before Sheet write; formula-leading cells (`=`, `+`, `-`, `@`) are `'`-prefixed.
- Never commit `.env` or the service-account JSON. `.gitignore` covers both.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `invalid_grant` / auth error | `GOOGLE_PRIVATE_KEY` newlines broken — check the `\n` note above |
| `The caller does not have permission` | Sheet not shared with service-account email as Editor |
| `Unable to parse range` | `SHEET_RANGE` tab name mismatch (e.g. `Sheet1` vs `Form`) |
| No email arrives | Wrong App Password, or Gmail blocked sign-in — regenerate App Password; check spam |
| CORS error in browser | `CORS_ORIGIN` doesn't match the site origin exactly |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Fork → branch → PR. No secrets in PRs, please.

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Form markup direction: [HyperUI](https://github.com/markmead/hyperui) + [Flowbite](https://github.com/themesberg/flowbite) (plain HTML/Tailwind snippets, no framework). shadcn/ui was deliberately avoided — React-only, would add a build toolchain this project doesn't need.
- Tailwind via CDN for the single static page; zero frontend dependencies in `package.json`.
