const express = require("express");
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { extractSheetId } = require("../sheets");

const router = express.Router();
router.use(authMiddleware);

// List user's forms
router.get("/", async (req, res) => {
  try {
    const forms = await db.forms.getByUserId(req.user.id);
    return res.json({ success: true, forms });
  } catch (err) {
    console.error("[forms] list error:", err);
    return res.status(500).json({ success: false, error: "Failed to list forms" });
  }
});

// Create new form
router.post("/", async (req, res) => {
  try {
    const {
      formName,
      sheetId,
      sheetRange,
      notifyEmail,
      honeypot,
      fieldsConfig,
      allowedOrigins,
    } = req.body || {};

    if (!formName || !String(formName).trim()) {
      return res.status(400).json({ success: false, error: "Form name is required" });
    }

    const validFields = Array.isArray(fieldsConfig) && fieldsConfig.length > 0
      ? fieldsConfig
      : [
          { name: "name", label: "Your Name", type: "text", column: "A", required: true, maxLength: 100 },
          { name: "email", label: "Email Address", type: "email", column: "B", required: true, maxLength: 254 },
          { name: "message", label: "Message", type: "textarea", column: "C", required: true, maxLength: 2000 },
        ];

    const form = await db.forms.create({
      userId: req.user.id,
      formName: String(formName).trim(),
      sheetId: sheetId ? extractSheetId(sheetId) : "",
      sheetRange: sheetRange ? String(sheetRange).trim() : "Sheet1!A:Z",
      notifyEmail: notifyEmail ? String(notifyEmail).trim() : req.user.email,
      honeypot: honeypot ? String(honeypot).trim() : "_gotcha",
      fieldsConfig: validFields,
      allowedOrigins: Array.isArray(allowedOrigins) && allowedOrigins.length > 0 ? allowedOrigins : ["*"],
    });

    return res.status(201).json({ success: true, form });
  } catch (err) {
    console.error("[forms] create error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to create form" });
  }
});

// Get specific form details (owner only)
router.get("/:id", async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.id);
    if (!form || form.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    return res.json({ success: true, form });
  } catch (err) {
    console.error("[forms] get error:", err);
    return res.status(500).json({ success: false, error: "Failed to get form" });
  }
});

// Update form
router.put("/:id", async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.id);
    if (!form || form.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    const updates = { ...(req.body || {}) };
    if (updates.sheetId !== undefined) {
      updates.sheetId = extractSheetId(updates.sheetId);
    }
    const updated = await db.forms.update(req.params.id, req.user.id, updates);
    return res.json({ success: true, form: updated });
  } catch (err) {
    console.error("[forms] update error:", err);
    return res.status(500).json({ success: false, error: "Failed to update form" });
  }
});

// Delete form
router.delete("/:id", async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.id);
    if (!form || form.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    await db.forms.delete(req.params.id, req.user.id);
    return res.json({ success: true, message: "Form deleted" });
  } catch (err) {
    console.error("[forms] delete error:", err);
    return res.status(500).json({ success: false, error: "Failed to delete form" });
  }
});

// Get submissions for a form
router.get("/:id/submissions", async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.id);
    if (!form || form.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const submissions = await db.submissions.getByFormId(req.params.id, limit);
    return res.json({ success: true, submissions });
  } catch (err) {
    console.error("[forms] get submissions error:", err);
    return res.status(500).json({ success: false, error: "Failed to get submissions" });
  }
});

// Retry / Sync pending or failed submissions to Google Sheet
router.post("/:id/sync", async (req, res) => {
  try {
    const form = await db.forms.getById(req.params.id);
    if (!form || form.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    if (!form.sheetId) {
      return res.status(400).json({ success: false, error: "No Google Sheet ID linked to this form." });
    }

    const { appendRow } = require("../sheets");
    const submissions = await db.submissions.getByFormId(req.params.id, 200);
    const pendingSubs = submissions.filter((s) => s.status === "sheets_failed" || s.status === "recorded");

    if (pendingSubs.length === 0) {
      return res.json({ success: true, message: "No pending submissions to sync.", syncedCount: 0 });
    }

    let syncedCount = 0;
    let lastError = null;

    for (const sub of pendingSubs) {
      try {
        await appendRow({
          sheetId: form.sheetId,
          sheetRange: form.sheetRange || "Sheet1!A:Z",
          fields: form.fieldsConfig || [],
          clean: sub.payload,
        });
        await db.submissions.update(sub.id, { status: "success", errorDetails: null });
        syncedCount++;
      } catch (err) {
        lastError = err.message;
        await db.submissions.update(sub.id, { errorDetails: err.message });
        break; // stop loop if credentials fail
      }
    }

    return res.json({
      success: syncedCount > 0,
      syncedCount,
      remainingFailed: pendingSubs.length - syncedCount,
      error: lastError,
    });
  } catch (err) {
    console.error("[forms] sync error:", err);
    return res.status(500).json({ success: false, error: err.message || "Sync failed" });
  }
});

module.exports = router;
