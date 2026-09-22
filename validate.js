const validator = require("validator");

function getFieldValue(body, fieldName) {
  if (!body) return "";
  if (body[fieldName] !== undefined && body[fieldName] !== null && String(body[fieldName]).trim() !== "") {
    return body[fieldName];
  }

  // Case-insensitive match
  const lowerTarget = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, val] of Object.entries(body)) {
    if (k.toLowerCase().replace(/[^a-z0-9]/g, "") === lowerTarget) {
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        return val;
      }
    }
  }

  // Semantic aliases for common fields
  if (lowerTarget === "name") {
    if (body.first_name && body.last_name) {
      return `${body.first_name} ${body.last_name}`;
    }
    if (body.firstName && body.lastName) {
      return `${body.firstName} ${body.lastName}`;
    }
    return (
      body.fullName ||
      body.full_name ||
      body.first_name ||
      body.firstName ||
      body.your_name ||
      body.yourName ||
      body.name1 ||
      body.fname ||
      ""
    );
  }
  if (lowerTarget === "email") {
    return (
      body.workEmail ||
      body.work_email ||
      body.emailAddress ||
      body.email_address ||
      body.mail ||
      body.user_email ||
      ""
    );
  }
  if (lowerTarget === "message") {
    return (
      body.details ||
      body.detail ||
      body.comments ||
      body.comment ||
      body.notes ||
      body.note ||
      body.msg ||
      body.messag ||
      ""
    );
  }

  return "";
}

function validateAndSanitize(body, fieldDefs) {
  const clean = {};
  const errors = [];
  const knownFieldNames = new Set();

  for (const f of fieldDefs) {
    knownFieldNames.add(f.name);
    let raw = getFieldValue(body, f.name);
    let v = "";
    if (Array.isArray(raw)) {
      v = raw.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ");
    } else {
      v = raw === undefined || raw === null ? "" : String(raw).trim();
    }

    if (f.required && !v) errors.push(`${f.name} is required`);
    if (v && f.maxLength && v.length > f.maxLength) errors.push(`${f.name} is too long`);
    if (v && f.type === "email" && !validator.isEmail(v)) errors.push(`${f.name} is invalid`);
    clean[f.name] = validator.escape(v);
  }

  // Also preserve any dynamic / extra inputs submitted from the user's custom form
  const ignoredKeys = new Set(["_gotcha", "_next", "_redirect", "company_website"]);
  for (const [key, rawVal] of Object.entries(body || {})) {
    if (!knownFieldNames.has(key) && !ignoredKeys.has(key)) {
      let valStr = "";
      if (Array.isArray(rawVal)) {
        valStr = rawVal.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ");
      } else {
        valStr = rawVal === undefined || rawVal === null ? "" : String(rawVal).trim();
      }
      if (valStr.length > 2000) valStr = valStr.slice(0, 2000);
      clean[key] = validator.escape(valStr);
    }
  }

  return { clean, errors };
}

module.exports = { validateAndSanitize };
