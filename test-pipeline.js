const http = require("http");
const app = require("./index");
const { guardCell } = require("./sheets");
const { validateAndSanitize } = require("./validate");

async function runTests() {
  console.log("🚀 Starting FormBridge Multi-Tenant Comprehensive Test Suite...\n");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // 1. Health Check & System Info
    // -------------------------------------------------------------
    console.log("1. System Health & Info Endpoints");
    const healthRes = await fetch(`${baseUrl}/health`);
    const health = await healthRes.json();
    assert(healthRes.status === 200, "Health status is 200");
    assert(health.mode === "multi-tenant", "Server is operating in multi-tenant mode");

    const infoRes = await fetch(`${baseUrl}/api/system/info`);
    const info = await infoRes.json();
    assert(infoRes.status === 200 && info.success, "System info endpoint returns 200");
    assert(typeof info.serviceAccountEmail === "string", "Service account email is exposed");

    // -------------------------------------------------------------
    // 2. User Authentication (Registration, Validation, Login)
    // -------------------------------------------------------------
    console.log("\n2. User Authentication & Security");
    const testEmail1 = `tenant_a_${Date.now()}@example.com`;
    const testPass1 = "password123!";

    // Short password rejection
    const shortPassRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail1, password: "123" }),
    });
    assert(shortPassRes.status === 400, "Registration rejects password shorter than 6 characters");

    // Invalid email rejection
    const badEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "notanemail", password: testPass1 }),
    });
    assert(badEmailRes.status === 400, "Registration rejects malformed email");

    // Successful registration User 1
    const regRes1 = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail1, password: testPass1 }),
    });
    const regData1 = await regRes1.json();
    assert(regRes1.status === 201 && regData1.success, "User 1 registered successfully");
    assert(!!regData1.token, "JWT token returned on registration");
    const token1 = regData1.token;

    // Duplicate email rejection
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail1, password: testPass1 }),
    });
    assert(dupRes.status === 400, "Registration rejects duplicate email");

    // Successful login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail1, password: testPass1 }),
    });
    assert(loginRes.status === 200, "Login with valid credentials succeeds");

    // Invalid password login
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail1, password: "wrongpassword" }),
    });
    assert(badLoginRes.status === 401, "Login with incorrect password returns 401");

    // Auth profile /me
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.user.email === testEmail1, "GET /api/auth/me returns authenticated user");

    // Register User 2 for multi-tenant isolation testing
    const testEmail2 = `tenant_b_${Date.now()}@example.com`;
    const regRes2 = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail2, password: testPass1 }),
    });
    const token2 = (await regRes2.json()).token;

    // -------------------------------------------------------------
    // 3. Multi-Tenant Form Management (CRUD & Isolation)
    // -------------------------------------------------------------
    console.log("\n3. Multi-Tenant Forms Management (CRUD & Tenant Isolation)");
    
    // Create form for User 1
    const createFormRes = await fetch(`${baseUrl}/api/forms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        formName: "Client Inquiry Form",
        sheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        sheetRange: "Leads!A:Z",
        notifyEmail: testEmail1,
        fieldsConfig: [
          { name: "fullName", label: "Full Name", type: "text", required: true, column: "A" },
          { name: "workEmail", label: "Work Email", type: "email", required: true, column: "B" },
          { name: "budget", label: "Project Budget", type: "text", required: false, column: "C" },
          { name: "message", label: "Message", type: "textarea", required: true, column: "D", maxLength: 2000 },
        ],
      }),
    });
    const formCreated = await createFormRes.json();
    assert(createFormRes.status === 201 && formCreated.success, "User 1 created a custom multi-field form");
    const formId1 = formCreated.form.id;

    // List forms for User 1
    const listRes1 = await fetch(`${baseUrl}/api/forms`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const listData1 = await listRes1.json();
    assert(listData1.forms.length === 1 && listData1.forms[0].id === formId1, "User 1 forms list contains created form");

    // List forms for User 2 (should be empty - tenant isolation)
    const listRes2 = await fetch(`${baseUrl}/api/forms`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    const listData2 = await listRes2.json();
    assert(listData2.forms.length === 0, "User 2 cannot see User 1 forms (Tenant isolation)");

    // User 2 trying to get User 1 form details directly (should return 404)
    const crossGetRes = await fetch(`${baseUrl}/api/forms/${formId1}`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    assert(crossGetRes.status === 404, "User 2 blocked from accessing User 1 form details (Returns 404)");

    // Update form
    const updateRes = await fetch(`${baseUrl}/api/forms/${formId1}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ formName: "Updated Client Inquiry Form" }),
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200 && updateData.form.formName === "Updated Client Inquiry Form", "Form name updated successfully");

    // -------------------------------------------------------------
    // 4. Public Form Configuration Endpoint (/f/:formId/config)
    // -------------------------------------------------------------
    console.log("\n4. Public Form Configuration Discovery");
    const configRes = await fetch(`${baseUrl}/f/${formId1}/config`);
    const configData = await configRes.json();
    assert(configRes.status === 200 && configData.success, "Public config retrieved without auth");
    assert(configData.fields.length === 4, "Config contains all 4 defined fields");
    assert(configData.formName === "Updated Client Inquiry Form", "Config returns updated form name");

    const badConfigRes = await fetch(`${baseUrl}/f/non_existent_id/config`);
    assert(badConfigRes.status === 404, "Non-existent form config returns 404");

    // -------------------------------------------------------------
    // 5. Spam Protection (Honeypot)
    // -------------------------------------------------------------
    console.log("\n5. Spam Protection & Honeypot Filtering");
    const spamRes = await fetch(`${baseUrl}/f/${formId1}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Spam Bot",
        workEmail: "bot@spammer.net",
        message: "Buy cheap backlinks now!",
        _gotcha: "http://spamsite.org", // Honeypot filled
      }),
    });
    const spamData = await spamRes.json();
    assert(spamData.success === true, "Silent success returned to fool spam bots");

    // -------------------------------------------------------------
    // 6. Server-Side Validation
    // -------------------------------------------------------------
    console.log("\n6. Server-Side Field Validation");
    const invalidRes = await fetch(`${baseUrl}/f/${formId1}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "", // Missing required
        workEmail: "not-an-email", // Malformed email
        message: "", // Missing required
      }),
    });
    const invalidData = await invalidRes.json();
    assert(invalidRes.status === 400 && !invalidData.success, "Rejected invalid submission with 400");
    assert(invalidData.errors.length >= 2, "Errors include missing fields and invalid email format");

    // -------------------------------------------------------------
    // 7. Legitimate Submission (JSON & Formula Guard)
    // -------------------------------------------------------------
    console.log("\n7. Legitimate Submission & Spreadsheet Formula Defense");
    const legitSubmitRes = await fetch(`${baseUrl}/f/${formId1}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "=HYPERLINK(\"http://evil.com\",\"ClickMe\")",
        workEmail: "client@enterprise.com",
        budget: "$25,000",
        message: "+cmd|' /C calc'!A0",
      }),
    });
    const legitData = await legitSubmitRes.json();
    assert(legitData.success === true || legitData.logged === true, "Submission handled safely without server crash");

    // -------------------------------------------------------------
    // 8. Native HTML <form> Submissions (urlencoded & redirect)
    // -------------------------------------------------------------
    console.log("\n8. Native HTML <form> Embed Submissions (application/x-www-form-urlencoded)");
    
    // Traditional browser form submission (urlencoded + text/html accept)
    const urlencodedRes = await fetch(`${baseUrl}/f/${formId1}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml",
      },
      body: new URLSearchParams({
        fullName: "Sarah Connor",
        workEmail: "sarah@cyberdyne.com",
        budget: "$5,000",
        message: "Need form infrastructure",
      }).toString(),
    });
    const htmlOutput = await urlencodedRes.text();
    assert(urlencodedRes.status === 200, "Native HTML form submission returns 200 OK");
    assert(htmlOutput.includes("Thank You!"), "Native HTML submission renders styled confirmation page");

    // Form submission with custom _next redirect
    const redirectRes = await fetch(`${baseUrl}/f/${formId1}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html",
      },
      redirect: "manual",
      body: new URLSearchParams({
        fullName: "Kyle Reese",
        workEmail: "kyle@resistance.org",
        message: "Come with me if you want to ship forms",
        _next: "https://mywebsite.com/thanks.html",
      }).toString(),
    });
    assert(redirectRes.status === 302, "HTML submission with _next returns 302 Redirect");
    assert(redirectRes.headers.get("location") === "https://mywebsite.com/thanks.html", "Redirects to specified _next URL");

    // -------------------------------------------------------------
    // 9. Submissions History & Real-Time Audit
    // -------------------------------------------------------------
    console.log("\n9. Submissions History & Status Tracking");
    const subsRes = await fetch(`${baseUrl}/api/forms/${formId1}/submissions`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const subsData = await subsRes.json();
    assert(subsRes.status === 200 && subsData.success, "Owner successfully retrieved submissions feed");
    assert(subsData.submissions.length >= 4, `Tracked ${subsData.submissions.length} total submissions in database`);

    const hasSpam = subsData.submissions.some((s) => s.status === "spam_rejected");
    assert(hasSpam, "Spam submission correctly flagged as 'spam_rejected' in submission record");

    // -------------------------------------------------------------
    // 10. Unit Tests: guardCell Formula Sanitization
    // -------------------------------------------------------------
    console.log("\n10. Unit Verification: guardCell Spreadsheet Formula Sanitizer");
    assert(guardCell("=SUM(A1:A10)") === "'=SUM(A1:A10)", "Formula starting with = is prefixed with apostrophe");
    assert(guardCell("+12345") === "'+12345", "Cell starting with + is prefixed with apostrophe");
    assert(guardCell("-20.5") === "'-20.5", "Cell starting with - is prefixed with apostrophe");
    assert(guardCell("@SUM(1,2)") === "'@SUM(1,2)", "Cell starting with @ is prefixed with apostrophe");
    assert(guardCell("\tcmd") === "'\tcmd", "Cell starting with tab is prefixed with apostrophe");
    assert(guardCell("Normal Text") === "Normal Text", "Harmless text remains unchanged");
    assert(guardCell(12345) === "12345", "Numbers handled cleanly without error");
    assert(guardCell(null) === "", "Null handled cleanly as empty string");
    assert(guardCell(undefined) === "", "Undefined handled cleanly as empty string");

    // -------------------------------------------------------------
    // 11. Unit Tests: validateAndSanitize & HTML Escaping
    // -------------------------------------------------------------
    console.log("\n11. Unit Verification: validateAndSanitize XSS & Field Checks");
    const testDefs = [
      { name: "title", required: true, maxLength: 50 },
      { name: "contactEmail", type: "email", required: true },
    ];
    const xssTest = validateAndSanitize({ title: "<script>alert('xss')</script>", contactEmail: "good@test.com" }, testDefs);
    assert(xssTest.clean.title.includes("&lt;script&gt;"), "XSS tags safely escaped by validator");
    assert(xssTest.errors.length === 0, "Valid payload produces zero errors");

    const maxLenTest = validateAndSanitize({ title: "This title is way too long for the twenty char limit", contactEmail: "good@test.com" }, testDefs);
    assert(maxLenTest.errors.some((e) => e.includes("too long")), "Exceeded maxLength correctly flagged as error");

    // -------------------------------------------------------------
    // 12. Form Deletion
    // -------------------------------------------------------------
    console.log("\n12. Form Deletion & Cascade Clean Up");
    // Create temporary form to delete
    const tempFormRes = await fetch(`${baseUrl}/api/forms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ formName: "Temporary Form" }),
    });
    const tempFormId = (await tempFormRes.json()).form.id;

    const delRes = await fetch(`${baseUrl}/api/forms/${tempFormId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert(delRes.status === 200, "Form deleted successfully");

    const getDeletedRes = await fetch(`${baseUrl}/api/forms/${tempFormId}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    // -------------------------------------------------------------
    // 13. Google Apps Script Webhook Support & Submission Status Updates
    // -------------------------------------------------------------
    console.log("\n13. Google Apps Script Webhook Support & DB Updates");
    const { extractSheetId } = require("./sheets");
    const webhookSample = "https://script.google.com/macros/s/AKfycbz_Sample12345/exec";
    const extractedWebhook = extractSheetId(webhookSample);
    assert(extractedWebhook === webhookSample, "extractSheetId preserves clean Google Apps Script Webhook URL");

    const webhookWithQuotes = ` \`https://script.google.com/macros/s/AKfycbz_Sample12345/exec\` `;
    assert(extractSheetId(webhookWithQuotes) === webhookSample, "extractSheetId strips markdown/quotes from Webhook URL");

    // Test form update destination to Webhook URL
    const updateDestRes = await fetch(`${baseUrl}/api/forms/${formId1}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ sheetId: webhookSample }),
    });
    const updateDestData = await updateDestRes.json();
    assert(updateDestData.success === true, "Form destination updated to Google Apps Script Webhook");
    assert(updateDestData.form.sheetId === webhookSample, "Form sheetId persists as Webhook URL");

    // Test db.submissions.update method
    const db = require("./db");
    const subRecord = await db.submissions.create({
      formId: formId1,
      payload: { name: "Test User" },
      status: "sheets_failed",
      errorDetails: "Temporary connection error",
    });
    assert(subRecord.status === "sheets_failed", "Created test submission with initial failed status");

    const updatedSub = await db.submissions.update(subRecord.id, {
      status: "success",
      errorDetails: null,
    });
    assert(updatedSub.status === "success", "db.submissions.update successfully updated status to success");
    assert(updatedSub.errorDetails === null, "db.submissions.update cleared error details");

  } catch (err) {
    console.error("Test execution encountered an unhandled error:", err);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n======================================================`);
  console.log(`Final Test Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
