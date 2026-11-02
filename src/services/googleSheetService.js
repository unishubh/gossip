const fs = require("fs");
const path = require("path");

const settingsPath = path.join(process.cwd(), "data", "settings.json");

function ensureSettingsFile() {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({}, null, 2), "utf8");
  }
}

function getGoogleSheetWebhookUrl() {
  if (process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    return process.env.GOOGLE_SHEET_WEBHOOK_URL.trim();
  }

  try {
    ensureSettingsFile();
    const content = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(content || "{}");
    return parsed.googleSheetWebhookUrl || "";
  } catch (err) {
    return "";
  }
}

function setGoogleSheetWebhookUrl(url) {
  ensureSettingsFile();
  let currentSettings = {};
  try {
    currentSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8") || "{}");
  } catch (e) {
    currentSettings = {};
  }

  currentSettings.googleSheetWebhookUrl = (url || "").trim();
  fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), "utf8");
  return currentSettings.googleSheetWebhookUrl;
}

async function appendLeadToGoogleSheet({ name, phone, triggerMessage, timestamp }) {
  const webhookUrl = getGoogleSheetWebhookUrl();

  if (!webhookUrl) {
    console.warn("[google sheets] No webhook URL configured. Skipping Google Sheet append.");
    return { success: false, reason: "NOT_CONFIGURED" };
  }

  const payload = {
    name: name || "WhatsApp User",
    phone: phone || "",
    triggerMessage: triggerMessage || "",
    timestamp: timestamp || new Date().toISOString()
  };

  try {
    console.log(`[google sheets] Appending row to Google Sheet for ${phone}...`);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const text = await response.text();
    console.log(`[google sheets] Google Sheet response status=${response.status}:`, text);

    return {
      success: response.ok,
      status: response.status,
      response: text
    };
  } catch (error) {
    console.error("[google sheets] Append error:", error.stack || error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function testGoogleSheetConnection(targetUrl) {
  const url = (targetUrl || getGoogleSheetWebhookUrl()).trim();

  if (!url) {
    throw new Error("Google Sheet Webhook URL is empty. Please provide a valid Apps Script Web App URL.");
  }

  const testPayload = {
    name: "Gossip Test Contact",
    phone: "919999999999",
    triggerMessage: "TEST_CONNECTION_PING",
    timestamp: new Date().toISOString()
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(testPayload),
    redirect: "follow"
  });

  const bodyText = await response.text();
  return {
    success: response.ok,
    status: response.status,
    response: bodyText
  };
}

module.exports = {
  getGoogleSheetWebhookUrl,
  setGoogleSheetWebhookUrl,
  appendLeadToGoogleSheet,
  testGoogleSheetConnection
};
