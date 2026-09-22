const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

let fallbackFields = [];
try {
  fallbackFields = require("./fields.json").fields;
} catch (e) {
  fallbackFields = [
    { name: "name", column: "A" },
    { name: "email", column: "B" },
    { name: "message", column: "C" },
  ];
}

// Prefix cells that start with a formula trigger so Sheets never
// interprets user input as a formula (CSV/Sheets injection).
function guardCell(v) {
  const str = String(v ?? "");
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

// Automatically extract clean Google Spreadsheet ID even if user pasted full URL or text with markdown
function extractSheetId(input) {
  if (!input) return "";
  const str = String(input).trim();
  // If it's a Google Apps Script Webhook URL (extract exec url even if wrapped in quotes or markdown)
  const scriptMatch = str.match(/(https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9-_]+\/exec)/);
  if (scriptMatch) return scriptMatch[1];
  if (str.startsWith("https://script.google.com/")) {
    return str;
  }
  const urlMatch = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{25,})/);
  if (urlMatch) return urlMatch[1];

  const docIdMatch = str.match(/(?:Document ID|Spreadsheet ID)[^a-zA-Z0-9-_]*[`"']?([a-zA-Z0-9-_]{25,})[`"']?/i);
  if (docIdMatch) return docIdMatch[1];

  const rawMatch = str.match(/([a-zA-Z0-9-_]{30,})/);
  if (rawMatch) return rawMatch[1];

  return str;
}

function getServiceAccountCredentials() {
  // 1. Check if an explicit JSON key file exists in root directory
  const possibleFiles = [
    path.join(__dirname, "service-account.json"),
    path.join(__dirname, "credentials.json"),
    path.join(__dirname, "google-key.json"),
  ];

  for (const file of possibleFiles) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.client_email && parsed.private_key) {
          return {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
          };
        }
      } catch (e) {
        console.error(`[sheets] Error reading key file ${file}:`, e.message);
      }
    }
  }

  // 2. Check if any downloaded service account JSON key file exists in root
  try {
    const files = fs.readdirSync(__dirname);
    for (const f of files) {
      if (f.endsWith(".json") && f !== "package.json" && f !== "package-lock.json" && f !== "fields.json") {
        const filePath = path.join(__dirname, f);
        try {
          const content = fs.readFileSync(filePath, "utf8");
          const parsed = JSON.parse(content);
          if (parsed.client_email && parsed.private_key) {
            return {
              client_email: parsed.client_email,
              private_key: parsed.private_key,
            };
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 3. Fall back to environment variables (.env)
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY,
    };
  }

  return null;
}

function getAuth() {
  const creds = getServiceAccountCredentials();
  if (!creds || !creds.client_email || !creds.private_key) {
    throw new Error(
      "Google service account credentials not configured. Please place your service-account.json key in this folder or set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env"
    );
  }
  // NOTE: .env keeps literal \n — restore real newlines here.
  const key = creds.private_key.replace(/\\n/g, "\n");
  return new google.auth.JWT(
    creds.client_email,
    null,
    key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

async function appendViaWebhook(webhookUrl, clean) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: clean,
      ...clean,
      timestamp: new Date().toISOString(),
    }),
    redirect: "follow",
  });

  const text = await response.text().catch(() => "");
  if (!response.ok && response.status !== 302) {
    throw new Error(`Google Apps Script returned status ${response.status}: ${text}`);
  }

  try {
    const json = JSON.parse(text);
    if (json && json.success === false) {
      throw new Error(json.error || "Google Apps Script reported an execution error.");
    }
  } catch (e) {
    if (e.message && e.message.includes("Google Apps Script")) throw e;
  }

  return true;
}

// Append one row to the specified Google Sheet.
// Supports both new dynamic format: appendRow({ sheetId, sheetRange, fields, clean })
// and legacy backward compatibility: appendRow(clean)
async function appendRow(options) {
  let clean;
  let targetSheetId;
  let targetRange;
  let targetFields;

  if (options && options.clean) {
    clean = options.clean;
    targetSheetId = extractSheetId(options.sheetId || process.env.SHEET_ID);
    targetRange = options.sheetRange || process.env.SHEET_RANGE || "Sheet1!A:Z";
    targetFields = options.fields || fallbackFields;
  } else {
    clean = options || {};
    targetSheetId = extractSheetId(process.env.SHEET_ID);
    targetRange = process.env.SHEET_RANGE || "Sheet1!A:Z";
    targetFields = fallbackFields;
  }

  if (!targetSheetId) {
    throw new Error("No Google Sheet ID or Apps Script Webhook specified for this form.");
  }

  // If user linked a Google Apps Script Webhook (zero-cloud setup mode)
  if (targetSheetId.startsWith("https://script.google.com/")) {
    return await appendViaWebhook(targetSheetId, clean);
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const ordered = [...targetFields]
    .sort((a, b) => (a.column || "").localeCompare(b.column || ""))
    .map((f) => guardCell(clean[f.name] ?? ""));

  ordered.push(new Date().toISOString()); // timestamp in the following column

  await sheets.spreadsheets.values.append({
    spreadsheetId: targetSheetId,
    range: targetRange,
    valueInputOption: "RAW",
    requestBody: { values: [ordered] },
  });
}

module.exports = { appendRow, guardCell, extractSheetId, getServiceAccountCredentials };
