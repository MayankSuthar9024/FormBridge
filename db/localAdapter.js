const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let writeQueue = Promise.resolve();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [],
      forms: [],
      submissions: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readDb() {
  ensureDataFile();
  const raw = await fs.promises.readFile(DB_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { users: [], forms: [], submissions: [] };
  }
}

async function writeDb(data) {
  writeQueue = writeQueue.then(async () => {
    ensureDataFile();
    const tempFile = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), "utf8");
    await fs.promises.rename(tempFile, DB_FILE);
  });
  return writeQueue;
}

const localAdapter = {
  async init() {
    ensureDataFile();
  },

  // Users
  async createUser({ email, passwordHash }) {
    const db = await readDb();
    const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error("A user with this email already exists.");
    }
    const user = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    await writeDb(db);
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  },

  async getUserByEmail(email) {
    const db = await readDb();
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserById(id) {
    const db = await readDb();
    const user = db.users.find((u) => u.id === id);
    if (!user) return null;
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  },

  // Forms
  async createForm({ id, userId, formName, sheetId, sheetRange, notifyEmail, honeypot, fieldsConfig, allowedOrigins }) {
    const db = await readDb();
    const formId = id || crypto.randomBytes(4).toString("hex"); // e.g. '8f3a1c'
    const existing = db.forms.find((f) => f.id === formId);
    if (existing) {
      throw new Error("Form ID already exists.");
    }
    const form = {
      id: formId,
      userId,
      formName: formName || "Untitled Form",
      sheetId: sheetId || "",
      sheetRange: sheetRange || "Sheet1!A:Z",
      notifyEmail: notifyEmail || "",
      honeypot: honeypot || "_gotcha",
      fieldsConfig: Array.isArray(fieldsConfig) ? fieldsConfig : [],
      allowedOrigins: Array.isArray(allowedOrigins) ? allowedOrigins : ["*"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.forms.push(form);
    await writeDb(db);
    return form;
  },

  async getFormsByUserId(userId) {
    const db = await readDb();
    const forms = db.forms.filter((f) => f.userId === userId);
    // Attach submission count
    return forms.map((f) => {
      const submissionCount = db.submissions.filter((s) => s.formId === f.id).length;
      return { ...f, submissionCount };
    });
  },

  async getFormById(id) {
    const db = await readDb();
    return db.forms.find((f) => f.id === id) || null;
  },

  async updateForm(id, userId, updates) {
    const db = await readDb();
    const idx = db.forms.findIndex((f) => f.id === id && f.userId === userId);
    if (idx === -1) return null;

    const allowedKeys = ["formName", "sheetId", "sheetRange", "notifyEmail", "honeypot", "fieldsConfig", "allowedOrigins"];
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        db.forms[idx][key] = updates[key];
      }
    }
    db.forms[idx].updatedAt = new Date().toISOString();
    await writeDb(db);
    return db.forms[idx];
  },

  async deleteForm(id, userId) {
    const db = await readDb();
    const idx = db.forms.findIndex((f) => f.id === id && f.userId === userId);
    if (idx === -1) return false;
    db.forms.splice(idx, 1);
    // Also remove associated submissions
    db.submissions = db.submissions.filter((s) => s.formId !== id);
    await writeDb(db);
    return true;
  },

  // Submissions
  async createSubmission({ formId, payload, status, errorDetails }) {
    const db = await readDb();
    const submission = {
      id: crypto.randomUUID(),
      formId,
      payload,
      status, // 'success' | 'sheets_failed' | 'spam'
      errorDetails: errorDetails || null,
      createdAt: new Date().toISOString(),
    };
    db.submissions.unshift(submission); // newest first
    // Keep max 500 submissions per form in local adapter to prevent unbounded file size
    const formSubmissions = db.submissions.filter((s) => s.formId === formId);
    if (formSubmissions.length > 500) {
      const toKeep = new Set(formSubmissions.slice(0, 500).map((s) => s.id));
      db.submissions = db.submissions.filter((s) => s.formId !== formId || toKeep.has(s.id));
    }
    await writeDb(db);
    return submission;
  },

  async getSubmissionsByFormId(formId, limit = 50) {
    const db = await readDb();
    return db.submissions.filter((s) => s.formId === formId).slice(0, limit);
  },

  async updateSubmission(id, updates) {
    const db = await readDb();
    const sub = db.submissions.find((s) => s.id === id);
    if (!sub) return null;
    if (updates.status !== undefined) sub.status = updates.status;
    if (updates.errorDetails !== undefined) sub.errorDetails = updates.errorDetails;
    await writeDb(db);
    return sub;
  },
};

module.exports = localAdapter;
