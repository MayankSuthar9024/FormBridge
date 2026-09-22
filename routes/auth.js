const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const db = require("../db");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !validator.isEmail(String(email).trim())) {
      return res.status(400).json({ success: false, error: "Please provide a valid email address." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.users.getByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ success: false, error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.users.create({ email: normalizedEmail, passwordHash });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error("[auth] register error:", err);
    return res.status(500).json({ success: false, error: err.message || "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await db.users.getByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

    return res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error("[auth] login error:", err);
    return res.status(500).json({ success: false, error: "Login failed" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await db.users.getById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  return res.json({ success: true, user });
});

module.exports = router;
