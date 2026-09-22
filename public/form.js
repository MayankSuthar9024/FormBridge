// Dynamic Form Renderer for FormBridge Multi-Tenant
// Supports both dynamic hosted forms (/f/:formId) and legacy root (/api/submit)
(function () {
  const form = document.getElementById("contact");
  const fieldsBox = document.getElementById("fields");
  const statusEl = document.getElementById("status");
  const sendBtn = document.getElementById("send-btn");
  const toasts = document.getElementById("toasts");
  const titleEl = document.querySelector("h1");
  const subtitleEl = document.querySelector("header p");

  // Determine if we're on a dynamic form route: /f/:formId
  const match = window.location.pathname.match(/\/f\/([^/]+)/);
  const formId = match ? match[1] : null;

  const configEndpoint = formId ? `/f/${formId}/config` : "/api/config";
  const submitEndpoint = formId ? `/f/${formId}` : "/api/submit";

  const inputCls =
    "w-full rounded-xl border border-[#F0F0F5] bg-white px-3.5 py-2.5 text-sm text-[#14142B] " +
    "placeholder-[#8A8FA3] focus:border-[#7C5CFC] focus:outline-none focus:ring-1 focus:ring-[#7C5CFC]/40 transition";
  const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#6E7191]";

  function toast(msg, kind) {
    if (!toasts) return;
    const el = document.createElement("div");
    el.className = "toast " + (kind || "info");
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function setStatus(msg, ok) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className =
      "text-xs min-h-[1.25rem] font-medium " + (ok === true ? "text-[#6E56E8]" : ok === false ? "text-red-500" : "text-[#8A8FA3]");
  }

  function fieldNode(f) {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.className = labelCls;
    label.htmlFor = "f-" + f.name;
    label.textContent = f.label + (f.required ? " *" : "");
    wrap.appendChild(label);

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 4;
    } else {
      input = document.createElement("input");
      input.type = f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text";
      if (f.type === "email") input.autocomplete = "email";
    }
    input.id = "f-" + f.name;
    input.name = f.name;
    input.className = inputCls;
    input.required = !!f.required;
    if (f.maxLength) input.maxLength = f.maxLength;
    wrap.appendChild(input);
    return wrap;
  }

  async function init() {
    let config;
    try {
      const res = await fetch(configEndpoint);
      if (!res.ok) throw new Error("config " + res.status);
      config = await res.json();
    } catch (err) {
      if (fieldsBox) fieldsBox.innerHTML = "";
      setStatus("Could not load the form. Please check the Form ID or try again later.", false);
      return;
    }

    if (config.formName && titleEl) {
      titleEl.textContent = config.formName;
      document.title = `${config.formName} | FormBridge`;
    }

    if (fieldsBox) {
      fieldsBox.innerHTML = "";
      for (const f of config.fields || []) {
        fieldsBox.appendChild(fieldNode(f));
      }
    }

    // Honeypot: offscreen (not display:none), humans never fill it
    const hp = document.createElement("input");
    hp.name = config.honeypot || "_gotcha";
    hp.className = "hp";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    form.appendChild(hp);
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      sendBtn.disabled = true;
      const original = sendBtn.textContent;
      sendBtn.textContent = "Sending…";
      setStatus("");

      const payload = Object.fromEntries(new FormData(form));
      try {
        const res = await fetch(submitEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setStatus("Message sent — thank you!", true);
          toast("Message sent — thank you!", "success");
          form.reset();
        } else if (data.logged) {
          setStatus("Received — we'll process it shortly.", true);
          toast("Received — we'll process it shortly.", "warn");
          form.reset();
        } else if (data.errors) {
          setStatus(data.errors.join(". "), false);
          toast(data.errors.join(". "), "error");
        } else {
          setStatus("Something went wrong. Please try again.", false);
          toast("Something went wrong. Please try again.", "error");
        }
      } catch (err) {
        setStatus("Network error. Please check your connection.", false);
        toast("Network error. Please check your connection.", "error");
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = original;
      }
    });
  }

  init();
})();
