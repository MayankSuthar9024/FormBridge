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

// Email notification handler.
// Supports multi-tenant options: sendNotification({ toEmail, formName, clean })
// or legacy signature: sendNotification(clean)
async function sendNotification(options) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[notify] SMTP not configured — skipping email.");
    return;
  }

  let clean;
  let toEmail;
  let formName;

  if (options && options.clean) {
    clean = options.clean;
    toEmail = options.toEmail || process.env.NOTIFY_TO || process.env.SMTP_USER;
    formName = options.formName || "FormBridge Form";
  } else {
    clean = options || {};
    toEmail = process.env.NOTIFY_TO || process.env.SMTP_USER;
    formName = "Contact Form";
  }

  if (!toEmail) {
    console.warn("[notify] No destination email specified — skipping.");
    return;
  }

  const lines = Object.entries(clean).map(([k, v]) => `${k}: ${v}`);
  const contactName = clean.name || clean.fullName || "Someone";

  await transporter.sendMail({
    from: `FormBridge <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `New submission: ${formName} (${contactName})`,
    text: `You received a new submission on "${formName}":\n\n${lines.join("\n")}\n\n---\nSent via FormBridge`,
  });
}

module.exports = { sendNotification };
