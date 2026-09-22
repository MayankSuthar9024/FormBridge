// FormBridge SaaS Dashboard Logic
(function () {
  const token = localStorage.getItem("fb_token");
  const storedUser = localStorage.getItem("fb_user");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const user = storedUser ? JSON.parse(storedUser) : { email: "User" };

  // Elements
  const userBadge = document.getElementById("user-badge");
  const btnLogout = document.getElementById("btn-logout");
  const navLogo = document.getElementById("nav-logo");
  const toasts = document.getElementById("toasts");

  const viewFormsList = document.getElementById("view-forms-list");
  const viewFormDetail = document.getElementById("view-form-detail");
  const formsGrid = document.getElementById("forms-grid");
  const emptyForms = document.getElementById("empty-forms");
  const metricTotalForms = document.getElementById("metric-total-forms");
  const metricTotalSubmissions = document.getElementById("metric-total-submissions");

  const btnNewForm = document.getElementById("btn-new-form");
  const btnEmptyNew = document.getElementById("btn-empty-new");
  const modalNewForm = document.getElementById("modal-new-form");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCancelModal = document.getElementById("btn-cancel-modal");
  const createForm = document.getElementById("create-form");
  const fieldsContainer = document.getElementById("fields-container");
  const btnAddField = document.getElementById("btn-add-field");

  // Detail View Elements
  const btnBackToForms = document.getElementById("btn-back-to-forms");
  const detailFormName = document.getElementById("detail-form-name");
  const detailFormId = document.getElementById("detail-form-id");
  const detailFormMeta = document.getElementById("detail-form-meta");
  const linkTestForm = document.getElementById("link-test-form");
  const btnDeleteForm = document.getElementById("btn-delete-form");
  const btnEditDestination = document.getElementById("btn-edit-destination");
  const btnOpenEditNow = document.getElementById("btn-open-edit-now");
  const saEmailDisplay = document.getElementById("sa-email-display");
  const btnCopySa = document.getElementById("btn-copy-sa");
  const snippetTabs = document.getElementById("snippet-tabs");
  const snippetCode = document.getElementById("snippet-code");
  const btnCopySnippet = document.getElementById("btn-copy-snippet");
  const submissionsTbody = document.getElementById("submissions-tbody");
  const btnRefreshSubmissions = document.getElementById("btn-refresh-submissions");

  // Edit Modal Elements
  const modalEditForm = document.getElementById("modal-edit-form");
  const btnCloseEditModal = document.getElementById("btn-close-edit-modal");
  const btnCancelEditModal = document.getElementById("btn-cancel-edit-modal");
  const editFormForm = document.getElementById("edit-form-form");
  const editFormName = document.getElementById("edit-form-name");
  const editSheetId = document.getElementById("edit-sheet-id");
  const editSheetRange = document.getElementById("edit-sheet-range");
  const editNotifyEmail = document.getElementById("edit-notify-email");

  // Setup Tabs Elements
  const tabSetupAppsScript = document.getElementById("tab-setup-apps-script");
  const tabSetupServiceAccount = document.getElementById("tab-setup-service-account");
  const panelSetupAppsScript = document.getElementById("panel-setup-apps-script");
  const panelSetupServiceAccount = document.getElementById("panel-setup-service-account");
  const btnCopyAppsScript = document.getElementById("btn-copy-apps-script");

  let currentForms = [];
  let activeForm = null;
  let activeSnippetTab = "html";
  let SERVICE_ACCOUNT_EMAIL = "formbridge-writer@persnox-formfill.iam.gserviceaccount.com";

  const saStatusDot = document.getElementById("sa-status-dot");
  const saStatusText = document.getElementById("sa-status-text");
  const credentialsWarning = document.getElementById("credentials-warning-banner");
  const btnSyncSubmissions = document.getElementById("btn-sync-submissions");

  // Fetch configured system info
  fetch("/api/system/info")
    .then((r) => r.json())
    .then((info) => {
      if (info.serviceAccountEmail) {
        SERVICE_ACCOUNT_EMAIL = info.serviceAccountEmail;
        if (saEmailDisplay) saEmailDisplay.textContent = SERVICE_ACCOUNT_EMAIL;
      }

      if (info.hasGoogleCredentials) {
        if (saStatusDot) saStatusDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
        if (saStatusText) {
          saStatusText.className = "text-xs font-semibold text-emerald-600";
          saStatusText.textContent = "Active & Connected";
        }
        if (credentialsWarning) credentialsWarning.classList.add("hidden");
      } else {
        if (saStatusDot) saStatusDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400";
        if (saStatusText) {
          saStatusText.className = "text-xs font-semibold text-amber-600";
          saStatusText.textContent = "Missing .env Key";
        }
        if (credentialsWarning) credentialsWarning.classList.remove("hidden");
      }
    })
    .catch(() => {});

  if (userBadge) userBadge.textContent = user.email;
  if (saEmailDisplay) saEmailDisplay.textContent = SERVICE_ACCOUNT_EMAIL;

  function toast(msg, kind = "info") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // API Client with Auth Header
  async function api(path, options = {}) {
    options.headers = options.headers || {};
    options.headers["Authorization"] = `Bearer ${token}`;
    options.headers["Content-Type"] = "application/json";

    const res = await fetch(path, options);
    if (res.status === 401) {
      localStorage.removeItem("fb_token");
      localStorage.removeItem("fb_user");
      window.location.href = "/login.html";
      throw new Error("Session expired");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "API request failed");
    }
    return data;
  }

  // Load and Render Forms List
  async function loadForms() {
    try {
      const res = await api("/api/forms");
      currentForms = res.forms || [];
      renderFormsList();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function renderFormsList() {
    metricTotalForms.textContent = currentForms.length;
    const totalSubs = currentForms.reduce((acc, f) => acc + (f.submissionCount || 0), 0);
    metricTotalSubmissions.textContent = totalSubs;

    if (currentForms.length === 0) {
      formsGrid.innerHTML = "";
      emptyForms.classList.remove("hidden");
      return;
    }

    emptyForms.classList.add("hidden");
    formsGrid.innerHTML = currentForms
      .map((form) => {
        const hasSheet = !!form.sheetId;
        return `
        <div class="bg-white rounded-2xl border border-[#F0F0F5] hover:border-[#7C5CFC]/40 p-5 shadow-sm hover:shadow-md transition cursor-pointer form-card flex flex-col justify-between group" data-id="${form.id}">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-mono bg-[#F5F3FF] text-[#6E56E8] px-2 py-0.5 rounded-md border border-[#7C5CFC]/20">${form.id}</span>
              <span class="text-xs flex items-center gap-1.5 font-medium ${hasSheet ? 'text-[#6E56E8]' : 'text-amber-500'}">
                <span class="w-2 h-2 rounded-full ${hasSheet ? 'bg-[#7C5CFC] animate-pulse' : 'bg-amber-400'}"></span>
                ${hasSheet ? 'Sheet Linked' : 'No Sheet'}
              </span>
            </div>
            <h3 class="font-bold text-[#14142B] text-base line-clamp-1 group-hover:text-[#6E56E8] transition">${form.formName}</h3>
            <p class="text-xs text-[#6E7191] mt-1">Fields: ${(form.fieldsConfig || []).map(f => f.name).join(", ") || "None"}</p>
          </div>

          <div class="mt-5 pt-3 border-t border-[#F0F0F5] flex items-center justify-between">
            <span class="text-xs text-[#6E7191]"><strong class="text-[#7C5CFC] font-bold">${form.submissionCount || 0}</strong> submissions</span>
            <button class="text-xs font-semibold text-[#7C5CFC] group-hover:text-[#6E56E8] flex items-center gap-1">
              View & Embed &rarr;
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    // Bind card clicks
    document.querySelectorAll(".form-card").forEach((card) => {
      card.addEventListener("click", () => {
        const formId = card.getAttribute("data-id");
        openFormDetail(formId);
      });
    });
  }

  // Open Form Detail View
  async function openFormDetail(formId) {
    const form = currentForms.find((f) => f.id === formId);
    if (!form) return;

    activeForm = form;
    viewFormsList.classList.add("hidden");
    viewFormDetail.classList.remove("hidden");

    detailFormName.textContent = form.formName;
    detailFormId.textContent = form.id;
    const isWebhook = form.sheetId && form.sheetId.startsWith("https://script.google.com/");
    const destLabel = isWebhook
      ? "Google Apps Script Webhook"
      : (form.sheetId ? `Google Sheet (${form.sheetRange})` : "Database log only");
    detailFormMeta.textContent = `Destination: ${destLabel} • Email alerts: ${form.notifyEmail || "None"}`;
    linkTestForm.href = `/f/${form.id}`;

    generateSnippet();
    loadSubmissions(form.id);
  }

  // Embed Snippet Generator
  function generateSnippet() {
    if (!activeForm) return;
    const origin = window.location.origin;
    const endpoint = `${origin}/f/${activeForm.id}`;
    const fields = activeForm.fieldsConfig || [];

    if (activeSnippetTab === "html") {
      const inputsHtml = fields
        .map((f) => {
          const isTextarea = f.type === "textarea";
          return `  <div>
    <label for="${f.name}">${f.label || f.name}</label>
    <${isTextarea ? 'textarea' : 'input'} id="${f.name}" name="${f.name}" ${f.required ? 'required' : ''} ${f.maxLength ? 'maxlength="' + f.maxLength + '"' : ''}${isTextarea ? '></textarea>' : ' />'}
  </div>`;
        })
        .join("\n");

      snippetCode.textContent = `<!-- FormBridge Embed: ${activeForm.formName} -->
<form action="${endpoint}" method="POST">
${inputsHtml}
  <!-- Spam protection honeypot: Keep hidden from human visitors -->
  <input type="text" name="${activeForm.honeypot || '_gotcha'}" style="display:none !important;" tabindex="-1" autocomplete="off" />
  
  <button type="submit">Submit</button>
</form>`;
    } else if (activeSnippetTab === "js") {
      snippetCode.textContent = `// Submit to FormBridge via JavaScript Fetch API
async function submitForm(formData) {
  const response = await fetch("${endpoint}", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(formData)
  });

  const result = await response.json();
  if (result.success) {
    alert("Form submitted successfully!");
  } else {
    alert("Submission error: " + (result.errors ? result.errors.join(", ") : result.error));
  }
}`;
    } else if (activeSnippetTab === "iframe") {
      snippetCode.textContent = `<iframe
  src="${endpoint}"
  width="100%"
  height="600"
  style="border:0; border-radius: 12px;"
  title="${activeForm.formName}">
</iframe>`;
    }
  }

  // Load Submissions
  async function loadSubmissions(formId) {
    submissionsTbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-[#8A8FA3]">Loading submissions...</td></tr>`;
    try {
      const res = await api(`/api/forms/${formId}/submissions`);
      const subs = res.submissions || [];

      if (subs.length === 0) {
        submissionsTbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-[#8A8FA3]">No submissions recorded yet for this form.</td></tr>`;
        return;
      }

      submissionsTbody.innerHTML = subs
        .map((s) => {
          const date = new Date(s.createdAt).toLocaleString();
          let badgeClass = "bg-[#F5F3FF] text-[#6E56E8] border-[#7C5CFC]/30";
          let label = "Success";
          if (s.status === "sheets_failed") {
            badgeClass = "bg-amber-50 text-amber-600 border-amber-200";
            label = "Sheet Error";
          } else if (s.status === "spam_rejected") {
            badgeClass = "bg-gray-100 text-[#8A8FA3] border-gray-200";
            label = "Spam Filtered";
          } else if (s.status === "recorded") {
            badgeClass = "bg-blue-50 text-blue-600 border-blue-200";
            label = "Logged";
          }

          const dataPreview = Object.entries(s.payload || {})
            .filter(([k]) => k !== "_gotcha" && k !== "company_website")
            .map(([k, v]) => `<strong class="text-[#14142B]">${k}:</strong> ${v}`)
            .join(" &bull; ");

          const errorMsg = s.status === "sheets_failed" && s.errorDetails
            ? `<div class="mt-1 text-[10px] text-amber-700 font-mono bg-amber-50 px-2 py-1 rounded border border-amber-200">${s.errorDetails}</div>`
            : "";

          return `
          <tr class="hover:bg-[#F5F3FF]/60 transition">
            <td class="py-3 px-4 font-mono text-[11px] text-[#8A8FA3] whitespace-nowrap align-top">${date}</td>
            <td class="py-3 px-4 whitespace-nowrap align-top">
              <span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeClass}">
                ${label}
              </span>
              ${errorMsg}
            </td>
            <td class="py-3 px-4 text-xs font-normal text-[#6E7191] break-words align-top">${dataPreview}</td>
          </tr>
        `;
        })
        .join("");
    } catch (err) {
      submissionsTbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-red-500">Failed to load submissions: ${err.message}</td></tr>`;
    }
  }

  // Dynamic Fields Builder inside Modal
  function addFieldRow(field = { name: "", label: "", type: "text", required: true, column: "" }) {
    const row = document.createElement("div");
    row.className = "field-row flex items-center gap-2";
    row.innerHTML = `
      <input type="text" placeholder="Field name (e.g. email)" value="${field.name}" class="f-name w-1/3 rounded-xl border border-[#F0F0F5] bg-white px-2.5 py-1.5 text-xs text-[#14142B] placeholder-[#8A8FA3] focus:border-[#7C5CFC] focus:outline-none" required>
      <input type="text" placeholder="Label" value="${field.label}" class="f-label w-1/3 rounded-xl border border-[#F0F0F5] bg-white px-2.5 py-1.5 text-xs text-[#14142B] placeholder-[#8A8FA3] focus:border-[#7C5CFC] focus:outline-none">
      <select class="f-type w-1/4 rounded-xl border border-[#F0F0F5] bg-white px-2 py-1.5 text-xs text-[#14142B] focus:border-[#7C5CFC] focus:outline-none">
        <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
        <option value="email" ${field.type === 'email' ? 'selected' : ''}>Email</option>
        <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Textarea</option>
        <option value="tel" ${field.type === 'tel' ? 'selected' : ''}>Phone</option>
      </select>
      <button type="button" class="btn-remove-field text-[#8A8FA3] hover:text-red-500 px-1 font-bold text-sm">&times;</button>
    `;
    row.querySelector(".btn-remove-field").addEventListener("click", () => row.remove());
    fieldsContainer.appendChild(row);
  }

  function resetFieldRows() {
    fieldsContainer.innerHTML = "";
    addFieldRow({ name: "name", label: "Full Name", type: "text", required: true, column: "A" });
    addFieldRow({ name: "email", label: "Email Address", type: "email", required: true, column: "B" });
    addFieldRow({ name: "message", label: "Message", type: "textarea", required: true, column: "C" });
  }

  // Event Listeners
  navLogo.addEventListener("click", () => {
    viewFormDetail.classList.add("hidden");
    viewFormsList.classList.remove("hidden");
  });

  btnBackToForms.addEventListener("click", () => {
    viewFormDetail.classList.add("hidden");
    viewFormsList.classList.remove("hidden");
    loadForms();
  });

  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("fb_token");
    localStorage.removeItem("fb_user");
    window.location.href = "/login.html";
  });

  btnNewForm.addEventListener("click", () => {
    document.getElementById("modal-notify-email").value = user.email || "";
    resetFieldRows();
    modalNewForm.classList.remove("hidden");
  });
  btnEmptyNew.addEventListener("click", () => btnNewForm.click());
  btnCloseModal.addEventListener("click", () => modalNewForm.classList.add("hidden"));
  btnCancelModal.addEventListener("click", () => modalNewForm.classList.add("hidden"));

  btnAddField.addEventListener("click", () => {
    addFieldRow({ name: "", label: "", type: "text", required: false, column: "" });
  });

  // Create Form Submission
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formName = document.getElementById("modal-form-name").value;
    const sheetId = document.getElementById("modal-sheet-id").value;
    const sheetRange = document.getElementById("modal-sheet-range").value;
    const notifyEmail = document.getElementById("modal-notify-email").value;

    const fieldRows = document.querySelectorAll(".field-row");
    const fieldsConfig = [];
    const cols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    fieldRows.forEach((row, i) => {
      const name = row.querySelector(".f-name").value.trim();
      const label = row.querySelector(".f-label").value.trim() || name;
      const type = row.querySelector(".f-type").value;
      if (name) {
        fieldsConfig.push({
          name,
          label,
          type,
          column: cols[i % cols.length],
          required: true,
          maxLength: type === "textarea" ? 2000 : 250,
        });
      }
    });

    try {
      const res = await api("/api/forms", {
        method: "POST",
        body: JSON.stringify({
          formName,
          sheetId,
          sheetRange,
          notifyEmail,
          fieldsConfig,
        }),
      });

      toast("Form created successfully!", "success");
      modalNewForm.classList.add("hidden");
      createForm.reset();
      await loadForms();
      openFormDetail(res.form.id);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // Delete Form
  btnDeleteForm.addEventListener("click", async () => {
    if (!activeForm) return;
    if (!confirm(`Are you sure you want to delete form "${activeForm.formName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api(`/api/forms/${activeForm.id}`, { method: "DELETE" });
      toast("Form deleted", "success");
      viewFormDetail.classList.add("hidden");
      viewFormsList.classList.remove("hidden");
      loadForms();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // Copy Snippet
  btnCopySnippet.addEventListener("click", () => {
    navigator.clipboard.writeText(snippetCode.textContent);
    toast("Snippet copied to clipboard!", "success");
  });

  // Copy Service Account
  btnCopySa.addEventListener("click", () => {
    navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
    toast("Service Account email copied!", "success");
  });

  // Snippet Tabs Toggle
  snippetTabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      snippetTabs.querySelectorAll(".tab-btn").forEach((b) => {
        b.className = "tab-btn px-3 py-1.5 rounded-lg text-[#6E7191] hover:text-[#14142B]";
      });
      btn.className = "tab-btn px-3 py-1.5 rounded-lg bg-[#7C5CFC] text-white font-bold shadow-sm";
      activeSnippetTab = btn.getAttribute("data-tab");
      generateSnippet();
    });
  });

  btnRefreshSubmissions.addEventListener("click", () => {
    if (activeForm) loadSubmissions(activeForm.id);
  });

  if (btnSyncSubmissions) {
    btnSyncSubmissions.addEventListener("click", async () => {
      if (!activeForm) return;
      btnSyncSubmissions.disabled = true;
      const origText = btnSyncSubmissions.innerHTML;
      btnSyncSubmissions.innerHTML = "Syncing...";
      try {
        const res = await api(`/api/forms/${activeForm.id}/sync`, { method: "POST" });
        if (res.syncedCount > 0) {
          toast(`Successfully synced ${res.syncedCount} submission(s) to Google Sheets!`, "success");
        } else if (res.error) {
          toast(`Sync failed: ${res.error}`, "error");
        } else {
          toast(res.message || "All submissions already synced.", "info");
        }
        await loadSubmissions(activeForm.id);
        await loadForms();
      } catch (err) {
        toast(`Sync error: ${err.message}`, "error");
      } finally {
        btnSyncSubmissions.disabled = false;
        btnSyncSubmissions.innerHTML = origText;
      }
    });
  }  // Google Apps Script Webhook Code Template (with auto-sync and header reorganization)
  const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }
    
    var data = payload.data || payload;
    
    // Ignore internal metadata fields
    var ignored = {
      data: true,
      timestamp: true,
      _gotcha: true,
      _next: true,
      company_website: true
    };
    
    // 1. Extract form fields in the exact order they are submitted
    var incomingFields = [];
    for (var k in data) {
      if (!ignored[k.toLowerCase()] && data.hasOwnProperty(k)) {
        incomingFields.push(k);
      }
    }
    
    // Format field key into clean column header title
    function formatTitle(key) {
      var kLower = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (kLower === "email") return "Email Address";
      if (kLower === "phone") return "Phone Number";
      return key
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .trim()
        .replace(/\\b\\w/g, function(char) { return char.toUpperCase(); });
    }
    
    function normalize(str) {
      return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    
    // Build expected clean headers matching the actual form
    var expectedHeaders = ["Timestamp"];
    for (var f = 0; f < incomingFields.length; f++) {
      expectedHeaders.push(formatTitle(incomingFields[f]));
    }
    
    // Auto-delete duplicate "Name" column if "First Name" already exists
    var checkCol = Math.max(sheet.getLastColumn(), 1);
    var rawCheck = sheet.getRange(1, 1, 1, checkCol).getValues()[0];
    var hasFirstName = false;
    var nameColIndex = -1;
    for (var ch = 0; ch < rawCheck.length; ch++) {
      var hTitle = String(rawCheck[ch] || "").trim().toLowerCase();
      if (hTitle === "first name") hasFirstName = true;
      if (hTitle === "name") nameColIndex = ch + 1;
    }
    if (hasFirstName && nameColIndex !== -1) {
      try { sheet.deleteColumn(nameColIndex); } catch (e) {}
    }

    // Read current headers in Sheet
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
      return String(h || "").trim();
    });
    
    // Check if current headers are outdated, disorganized, or have duplicate Name columns
    var hasDuplicateNames = currentHeaders.indexOf("Name") !== -1 && currentHeaders.indexOf("First Name") !== -1;
    var isDisorganized = currentHeaders.length <= 2 || currentHeaders[1] === "Untitled Question" || hasDuplicateNames;
    
    var matchesExact = (currentHeaders.length === expectedHeaders.length);
    if (matchesExact) {
      for (var m = 0; m < expectedHeaders.length; m++) {
        if (currentHeaders[m].toLowerCase() !== expectedHeaders[m].toLowerCase()) {
          matchesExact = false;
          break;
        }
      }
    }
    
    // AUTO-SYNC: If headers are disorganized or form changed, reorganize Row 1 to match form perfectly!
    if (isDisorganized || !matchesExact) {
      if (lastCol > 0) {
        sheet.getRange(1, 1, 1, Math.max(lastCol, expectedHeaders.length + 5)).clearContent();
      }
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold");
      currentHeaders = expectedHeaders;
    }
    
    // Build row matching organized headers
    var row = [];
    for (var colIdx = 0; colIdx < currentHeaders.length; colIdx++) {
      var colHeader = currentHeaders[colIdx];
      var normColHeader = normalize(colHeader);
      
      if (normColHeader === "timestamp" || normColHeader === "date") {
        row.push(new Date().toLocaleString());
      } else {
        var val = "";
        for (var dKey in data) {
          if (formatTitle(dKey).toLowerCase() === colHeader.toLowerCase() ||
              normalize(dKey) === normColHeader) {
            val = data[dKey];
            break;
          }
        }
        
        if (val === "" && normColHeader.indexOf("name") !== -1) {
          val = data.name || data.fullName || data.first_name || "";
        }
        row.push(val !== undefined && val !== null ? val : "");
      }
    }
    
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ success: true, headers: currentHeaders, row: row }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("FormBridge Google Apps Script Webhook is active and auto-syncing headers!")
    .setMimeType(ContentService.MimeType.TEXT);
}`;

  // Copy Apps Script Code
  if (btnCopyAppsScript) {
    btnCopyAppsScript.addEventListener("click", () => {
      navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      toast("Google Apps Script code copied to clipboard!", "success");
    });
  }

  // Setup Tabs Switching
  if (tabSetupAppsScript && tabSetupServiceAccount) {
    tabSetupAppsScript.addEventListener("click", () => {
      tabSetupAppsScript.className = "px-3 py-1 rounded-lg bg-[#7C5CFC] text-white shadow-sm transition";
      tabSetupServiceAccount.className = "px-3 py-1 rounded-lg text-[#6E7191] hover:text-[#14142B] transition";
      panelSetupAppsScript.classList.remove("hidden");
      panelSetupServiceAccount.classList.add("hidden");
    });

    tabSetupServiceAccount.addEventListener("click", () => {
      tabSetupServiceAccount.className = "px-3 py-1 rounded-lg bg-[#7C5CFC] text-white shadow-sm transition";
      tabSetupAppsScript.className = "px-3 py-1 rounded-lg text-[#6E7191] hover:text-[#14142B] transition";
      panelSetupServiceAccount.classList.remove("hidden");
      panelSetupAppsScript.classList.add("hidden");
    });
  }

  // Open Edit Form Modal
  function openEditModal() {
    if (!activeForm) return;
    editFormName.value = activeForm.formName || "";
    editSheetId.value = activeForm.sheetId || "";
    editSheetRange.value = activeForm.sheetRange || "Sheet1!A:Z";
    editNotifyEmail.value = activeForm.notifyEmail || "";
    modalEditForm.classList.remove("hidden");
  }

  if (btnEditDestination) btnEditDestination.addEventListener("click", openEditModal);
  if (btnOpenEditNow) btnOpenEditNow.addEventListener("click", openEditModal);
  if (btnCloseEditModal) btnCloseEditModal.addEventListener("click", () => modalEditForm.classList.add("hidden"));
  if (btnCancelEditModal) btnCancelEditModal.addEventListener("click", () => modalEditForm.classList.add("hidden"));

  // Save Edit Form Changes
  if (editFormForm) {
    editFormForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeForm) return;

      const formName = editFormName.value.trim();
      const sheetId = editSheetId.value.trim();
      const sheetRange = editSheetRange.value.trim() || "Sheet1!A:Z";
      const notifyEmail = editNotifyEmail.value.trim();

      try {
        const res = await api(`/api/forms/${activeForm.id}`, {
          method: "PUT",
          body: JSON.stringify({ formName, sheetId, sheetRange, notifyEmail }),
        });

        toast("Form destination updated successfully!", "success");
        modalEditForm.classList.add("hidden");
        activeForm = res.form;
        await loadForms();
        openFormDetail(activeForm.id);
      } catch (err) {
        toast(`Update failed: ${err.message}`, "error");
      }
    });
  }

  // Initial Load
  loadForms();
})();
