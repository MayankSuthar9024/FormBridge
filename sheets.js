const { google } = require("googleapis");
const { fields } = require("./fields.json");

// Prefix cells that start with a formula trigger so Sheets never
// interprets user input as a formula (CSV/Sheets injection).
function guardCell(v) {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function getAuth() {
  // NOTE: .env keeps literal \n — restore real newlines here.
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

// Append one row, ordering values by fields.json column letters.
async function appendRow(clean) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const ordered = [...fields]
    .sort((a, b) => a.column.localeCompare(b.column))
    .map((f) => guardCell(clean[f.name] ?? ""));
  ordered.push(new Date().toISOString()); // timestamp lands in next column
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: process.env.SHEET_RANGE || "Sheet1!A:Z",
    valueInputOption: "RAW",
    requestBody: { values: [ordered] },
  });
}

module.exports = { appendRow, guardCell };
