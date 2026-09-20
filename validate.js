const validator = require("validator");

// Validate + sanitize a POST body against fields.json definitions.
// Returns { clean, errors }. Every string is validator.escape()d so it is
// safe to store in Sheets and render back in emails/HTML.
function validateAndSanitize(body, fieldDefs) {
  const clean = {};
  const errors = [];
  for (const f of fieldDefs) {
    let v = body[f.name];
    v = v === undefined || v === null ? "" : String(v).trim();
    if (f.required && !v) errors.push(`${f.name} is required`);
    if (v && f.maxLength && v.length > f.maxLength) errors.push(`${f.name} is too long`);
    if (v && f.type === "email" && !validator.isEmail(v)) errors.push(`${f.name} is invalid`);
    clean[f.name] = validator.escape(v);
  }
  return { clean, errors };
}

module.exports = { validateAndSanitize };
