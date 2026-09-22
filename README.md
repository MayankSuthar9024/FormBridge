# FormBridge — Multi-Tenant Form Backend & SaaS Platform

> A multi-tenant form backend platform (like Formspree) that connects website contact forms directly to each user's own Google Sheet and email notification system.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Architecture: Multi-Tenant](https://img.shields.io/badge/architecture-multi--tenant-blue.svg)

---

## 🚀 Overview & User Journey

FormBridge is e-evolving from a single-site contact form script into a full multi-tenant SaaS platform. Any user can sign up, create forms, connect their own Google Sheet, and drop embed code into their website.

```
[ Visitor Form on User Site ]
              │
      POST /f/:formId
              │
              ▼
    ┌───────────────────┐
    │  FormBridge API   │
    └─────────┬─────────┘
              ├───────────────────────────────┐
              ▼                               ▼
    ┌───────────────────┐           ┌───────────────────┐
    │ User's Google     │           │ User's Email      │
    │ Sheet (Row Added) │           │ Notification      │
    └───────────────────┘           └───────────────────┘
```

### End-to-End Flow
1. **User Sign Up**: User registers on the FormBridge dashboard.
2. **Create New Form**: Platform generates a unique `Form ID` and public API endpoint (e.g. `https://formbridge.com/f/8f3a1c`).
3. **Connect Google Sheet & Email**: User shares their Google Sheet with FormBridge's Service Account email (or connects via Google OAuth in v2) and sets a notification email address.
4. **Embed Snippet**: Dashboard generates a ready-to-use HTML `<form>` embed snippet or raw fetch endpoint URL.
5. **Form Submission**: When site visitors submit the form, FormBridge validates fields, guards against spreadsheet formula injection, appends a row to the user's Sheet, and notifies the user via email.
6. **Dashboard Management**: User views submission history, edits field mapping, and manages API keys.

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express (or Next.js API Routes).
- **Database**: PostgreSQL via Supabase or Neon.
- **Authentication**: Supabase Auth or Clerk.
- **Frontend & Dashboard**: Next.js + Tailwind CSS.
- **Google Sheets Integration**: `googleapis` Node.js client library using Google Service Account (Shared Service Account for MVP, migrating to per-user Google OAuth in later release).
- **Email Delivery**: Nodemailer (Gmail SMTP for MVP) → Resend for production deliverability.
- **Hosting**: Vercel (Frontend & API) + Supabase/Neon (Database).

---

## 🗄️ Core Data Model

```
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │      users      │       │      forms      │       │   submissions   │
 ├─────────────────┤       ├─────────────────┤       ├─────────────────┤
 │ id (PK)         │1     *│ id (PK)         │1     *│ id (PK)         │
 │ email           ├───────┤ user_id (FK)    ├───────┤ form_id (FK)    │
 │ auth_provider_id│       │ form_name       │       │ payload (JSONB) │
 │ created_at      │       │ sheet_id        │       │ status          │
 └─────────────────┘       │ sheet_range     │       │ created_at      │
                           │ notify_email    │       └─────────────────┘
                           │ fields_config   │
                           │ created_at      │
                           └─────────────────┘
```

---

## 🔐 Security & Protection

- **Per-Form Rate Limiting**: Rate limits enforced per `formId` + IP so high-volume or abused forms do not affect other tenants.
- **Server-Side Field Validation**: Strict validation against each form's server-defined `fields_config` — client submissions are never blindly trusted.
- **Spreadsheet Formula Injection Prevention**: Automatic sanitization of formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) with `'` prefixing.
- **CORS Policies**: Public form endpoints (`POST /f/:formId`) permit cross-origin requests (`*`), while dashboard/management routes are restricted to the platform domain.
- **Spam Honeypots**: Invisible honeypot fields to trick bots into silent failures.

---

## 🗺️ Phased Roadmap

- [x] **Phase 1 — Core Pipeline Refactor**: Dynamic form config looked up by `Form ID`, multi-tenant endpoint `/f/:formId`, public metadata `/f/:formId/config`, and legacy fallback.
- [x] **Phase 2 — Database & Auth**: User model & authentication (bcrypt + JWT), form schema with relational data model, zero-config persistent local adapter + PostgreSQL schema (`db/schema.sql`).
- [x] **Phase 3 — Dashboard UI**: Modern responsive dashboard with sign up/login toggle (`login.html`), forms overview, creation modal with dynamic field builder, and detailed form management (`dashboard.html`).
- [x] **Phase 4 — Embed Snippet Generator**: Multi-format code generator for HTML `<form>`, JavaScript `fetch()`, and `<iframe>`, with one-click clipboard copying.
- [x] **Phase 5 — Submission History & Fallbacks**: Real-time submissions table with live status tracking (`success`, `sheets_failed`, `spam_rejected`), error diagnostics, and offline fallback logging (`fallback-log.jsonl`).
- [ ] **Phase 6 — Public Launch & Polish**:
  - [x] High-converting landing page (`public/index.html`)
  - [x] URL-encoded & JSON multi-format submission support with custom `_next` redirect
  - [x] Rate limiting per Form ID + IP
  - [ ] Standalone Terms of Service & Privacy Policy pages
  - [ ] Optional Google OAuth v2 (as an alternative to the Service Account flow)
  - [ ] Direct cloud PostgreSQL connection driver when `DATABASE_URL` is configured

---

## 📡 API Contract (Phase 1 Target)

### `POST /f/:formId`
Public form submission endpoint.
- **Body**: JSON payload matching the form's `fields_config`.
- **Response**: `{ "success": true }` or error details.

### `GET /f/:formId/config`
Public endpoint returning field metadata for dynamic frontend rendering and embed snippet builders.

### `GET /health`
System health check returning server status, uptime, and timestamp.

---

## ⚙️ Quick Setup for Local Development

### 1. Google Service Account Setup
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Sheets API**.
3. Create a Service Account and generate a **JSON Key**.
4. Note the `client_email` and `private_key` from the key file.

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and configure:

```env
PORT=3000
GOOGLE_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### 3. Run Server
```bash
npm install
npm run dev
# Server running at http://localhost:3000
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE).
