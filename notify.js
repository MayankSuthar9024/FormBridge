const nodemailer = require("nodemailer");

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Email notify via Gmail App Password (NOT your login password).
// Resolves silently (warn) when SMTP is unconfigured so local dev works.
async function sendNotification(clean) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[notify] SMTP not configured — skipping email.");
    return;
  }
  const lines = Object.entries(clean).map(([k, v]) => `${k}: ${v}`);
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_TO || process.env.SMTP_USER,
    subject: `New contact: ${clean.name || "unknown"}`,
    text: `New FormBridge submission:\n\n${lines.join("\n")}`,
  });
}

module.exports = { sendNotification };
