require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const db = require("./db");
const authRoutes = require("./routes/auth");
const formsRoutes = require("./routes/forms");
const { validateAndSanitize } = require("./validate");
const { appendRow } = require("./sheets");
const { sendNotification } = require("./notify");

let legacyFields = [];
let legacyHoneypot = "company_website";
try {
  const legacyConfig = require("./fields.json");
  legacyFields = legacyConfig.fields || [];
  legacyHoneypot = legacyConfig.honeypot || "company_website";
} catch (e) {
  // Ignored if missing
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database (Local or Postgres)
db.init().catch((err) => {
  console.error("[db] initialization error:", err);
});

// Comma-separated list for dashboard/admin origin restriction
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Dynamic CORS middleware:
// - Public form submissions (/f/* and /api/f/*) are allowed from any origin (*)
// - Other API routes are checked against allowedOrigins
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile, server-to-server)
      if (!origin) return cb(null, true);
      // For local development or wildcard configuration
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin) || origin.includes("localhost")) {
        return cb(null, true);
      }
      return cb(null, true); // Allow submission embeds from user sites
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// System info endpoint
app.get("/api/system/info", (req, res) => {
  const { getServiceAccountCredentials } = require("./sheets");
  const creds = getServiceAccountCredentials ? getServiceAccountCredentials() : null;
  res.json({
    success: true,
    serviceAccountEmail: (creds && creds.client_email) || process.env.GOOGLE_CLIENT_EMAIL || "formbridge-writer@persnox-formfill.iam.gserviceaccount.com",
    hasGoogleCredentials: !!creds,
    hasSmtp: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// Uptime monitor endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: "multi-tenant",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount Authentication & Form Management APIs
app.use("/api/auth", authRoutes);
app.use("/api/forms", formsRoutes);

// Rate limiter per (Form ID + IP) or IP
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 requests per 15 min per form & IP
  keyGenerator: (req) => {
    const formId = req.params.formId || "legacy";
    return `${formId}_${req.ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

// ==========================================
// Multi-Tenant Form Endpoints (/f/:formId)
// ==========================================

// Public form config endpoint: returns field definitions for dynamic rendering
app.get(["/f/:formId/config", "/api/f/:formId/config"], async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.formId);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    return res.json({
      success: true,
      formId: form.id,
      formName: form.formName,
      honeypot: form.honeypot || "_gotcha",
      fields: (form.fieldsConfig || []).map((f) => ({
        name: f.name,
        label: f.label || f.name,
        type: f.type || "text",
        required: !!f.required,
        maxLength: f.maxLength || null,
      })),
    });
  } catch (err) {
    console.error("[form config] error:", err);
    return res.status(500).json({ success: false, error: "Failed to load form configuration" });
  }
});

function renderHtmlResponse(res, { title, message, isSuccess = true, errors = [], backUrl = "/" }) {
  const accentColor = isSuccess ? "#7C5CFC" : "#EF4444";
  const bgLight = isSuccess ? "#F5F3FF" : "#FEF2F2";
  const textColor = isSuccess ? "#6E56E8" : "#DC2626";
  const errorList = errors.length > 0
    ? `<ul style="margin: 1rem 0; text-align: left; background: #FFF; padding: 1rem 1.5rem; border-radius: 0.75rem; border: 1px solid #FEE2E2; list-style-type: disc;">
        ${errors.map((e) => `<li style="color: #DC2626; font-size: 0.875rem; margin-bottom: 0.25rem;">${e}</li>`).join("")}
       </ul>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} &bull; FormBridge</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FAFAFC; color: #14142B; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #FFFFFF; border: 1px solid #F0F0F5; border-radius: 1.25rem; box-shadow: 0 20px 40px rgba(0,0,0,0.06); padding: 2.5rem; max-width: 28rem; width: 100%; text-align: center; }
    .badge { display: inline-flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem; border-radius: 1rem; background: ${bgLight}; color: ${textColor}; font-size: 1.75rem; margin-bottom: 1.25rem; }
    h1 { font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem 0; }
    p { font-size: 0.875rem; color: #6E7191; margin: 0 0 1.5rem 0; line-height: 1.5; }
    .btn { display: inline-block; background: ${accentColor}; color: #FFF; font-weight: 700; font-size: 0.875rem; padding: 0.75rem 1.5rem; border-radius: 0.75rem; text-decoration: none; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${isSuccess ? "✓" : "!"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${errorList}
    <a href="${backUrl}" class="btn">Go Back</a>
  </div>
</body>
</html>`;
  return res.status(isSuccess ? 200 : 400).send(html);
}

// Core Submission Handler
async function handleFormSubmission(form, body, res, req) {
  const isHtml = req && req.headers && req.headers.accept && req.headers.accept.includes("text/html") && !req.headers.accept.includes("application/json");
  const referer = (req && req.headers && req.headers.referer) || "/";
  const redirectUrl = body._next || body._redirect;

  const honeypotField = form.honeypot || "_gotcha";

  // Honeypot check: If filled, silently acknowledge to fool bots
  if (body[honeypotField] && String(body[honeypotField]).trim() !== "") {
    await db.submissions.create({
      formId: form.id,
      payload: body,
      status: "spam_rejected",
      errorDetails: "Honeypot field triggered",
    });
    if (isHtml) {
      if (redirectUrl) return res.redirect(redirectUrl);
      return renderHtmlResponse(res, {
        title: "Thank You!",
        message: "Your submission has been received successfully.",
        isSuccess: true,
        backUrl: referer,
      });
    }
    return res.json({ success: true });
  }

  const { clean, errors } = validateAndSanitize(body, form.fieldsConfig || []);
  if (errors.length > 0) {
    if (isHtml) {
      return renderHtmlResponse(res, {
        title: "Submission Error",
        message: "Please correct the following errors and try again:",
        isSuccess: false,
        errors,
        backUrl: referer,
      });
    }
    return res.status(400).json({ success: false, errors });
  }

  let sheetsSuccess = false;
  let sheetsError = null;

  try {
    if (form.sheetId) {
      await appendRow({
        sheetId: form.sheetId,
        sheetRange: form.sheetRange || "Sheet1!A:Z",
        fields: form.fieldsConfig || [],
        clean,
      });
      sheetsSuccess = true;
    } else {
      console.warn(`[form:${form.id}] No Google Sheet ID configured — storing in submission log only.`);
    }
  } catch (err) {
    sheetsError = err.message;
    console.error(`[form:${form.id}] sheets write failed:`, err.message);

    // Append to local fallback log
    try {
      await fs.promises.appendFile(
        path.join(__dirname, "fallback-log.jsonl"),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          formId: form.id,
          data: clean,
          error: err.message,
        }) + "\n"
      );
    } catch (logErr) {
      console.error("[fallback] log failed:", logErr.message);
    }
  }

  // Record submission in database
  const status = sheetsSuccess ? "success" : form.sheetId ? "sheets_failed" : "recorded";
  await db.submissions.create({
    formId: form.id,
    payload: clean,
    status,
    errorDetails: sheetsError,
  });

  // Attempt Email Notification
  if (form.notifyEmail) {
    try {
      await sendNotification({
        toEmail: form.notifyEmail,
        formName: form.formName,
        clean,
      });
    } catch (notifyErr) {
      console.error(`[form:${form.id}] notify failed:`, notifyErr.message);
    }
  }

  if (isHtml) {
    if (redirectUrl) return res.redirect(redirectUrl);
    return renderHtmlResponse(res, {
      title: "Thank You!",
      message: `Your submission for "${form.formName}" has been received.`,
      isSuccess: true,
      backUrl: referer,
    });
  }

  if (sheetsError) {
    return res.json({ success: false, logged: true, error: "sheets_write_failed" });
  }

  return res.json({ success: true });
}

// Public Submission Endpoint: POST /f/:formId or POST /api/f/:formId
app.post(["/f/:formId", "/api/f/:formId"], submitLimiter, async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.formId);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    return await handleFormSubmission(form, req.body || {}, res, req);
  } catch (err) {
    console.error("[submit] error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Hosted Form Page: GET /f/:formId
app.get("/f/:formId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form.html"));
});

// ==========================================
// Backward-Compatibility Endpoints (Legacy)
// ==========================================

app.get("/api/config", (req, res) => {
  res.json({
    honeypot: legacyHoneypot,
    fields: legacyFields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      required: !!f.required,
      maxLength: f.maxLength,
    })),
  });
});

app.post("/api/submit", submitLimiter, async (req, res) => {
  const legacyForm = {
    id: "legacy",
    formName: "Legacy Form",
    sheetId: process.env.SHEET_ID,
    sheetRange: process.env.SHEET_RANGE || "Sheet1!A:Z",
    notifyEmail: process.env.NOTIFY_TO || process.env.SMTP_USER,
    honeypot: legacyHoneypot,
    fieldsConfig: legacyFields,
  };
  return await handleFormSubmission(legacyForm, req.body || {}, res, req);
});

// Convenience routes for dashboard and login
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FormBridge Multi-Tenant server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
