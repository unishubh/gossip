const fs = require("fs");
const path = require("path");
const { run, all } = require("./dbService");
const { appendLeadToGoogleSheet } = require("./googleSheetService");

const dataDirectory = path.join(process.cwd(), "data");
const leadsCsvPath = path.join(dataDirectory, "leads.csv");

function ensureDirectoryExists() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function escapeCsvField(field) {
  if (field === null || field === undefined) return '""';
  const stringValue = String(field).replace(/"/g, '""');
  return `"${stringValue}"`;
}

function ensureLeadsCsvFile() {
  ensureDirectoryExists();
  if (!fs.existsSync(leadsCsvPath)) {
    // Write UTF-8 BOM (\uFEFF) so Excel opens UTF-8 characters seamlessly
    const header = "\uFEFFName,Phone,Trigger Message,Captured At\n";
    fs.writeFileSync(leadsCsvPath, header, "utf8");
  }
}

async function recordLead({ name, phone, triggerMessage, timestamp }) {
  ensureLeadsCsvFile();

  const formattedTimestamp = timestamp || new Date().toISOString();
  const safeName = (name || "WhatsApp User").trim();
  const safePhone = (phone || "").trim();
  const safeMessage = (triggerMessage || "").trim();

  // 1. Append directly to Excel-compatible CSV file
  const csvRow = [
    escapeCsvField(safeName),
    escapeCsvField(safePhone),
    escapeCsvField(safeMessage),
    escapeCsvField(formattedTimestamp)
  ].join(",") + "\n";

  try {
    fs.appendFileSync(leadsCsvPath, csvRow, "utf8");
  } catch (err) {
    console.error("Failed to append lead to leads.csv:", err.stack || err);
  }

  // 2. Also record in SQLite for fast query / dashboard display
  try {
    run(
      `
        INSERT INTO leads (name, phone, trigger_message, created_at)
        VALUES (?, ?, ?, ?)
      `,
      [safeName, safePhone, safeMessage, formattedTimestamp]
    );
  } catch (err) {
    console.error("Failed to save lead in SQLite:", err.stack || err);
  }

  // 3. Automatically append directly to Google Sheet if configured
  try {
    await appendLeadToGoogleSheet({
      name: safeName,
      phone: safePhone,
      triggerMessage: safeMessage,
      timestamp: formattedTimestamp
    });
  } catch (err) {
    console.error("Failed to append to Google Sheet:", err.stack || err);
  }

  return {
    name: safeName,
    phone: safePhone,
    triggerMessage: safeMessage,
    createdAt: formattedTimestamp
  };
}

async function getLeads() {
  try {
    const rows = all(
      `
        SELECT id, name, phone, trigger_message as triggerMessage, created_at as createdAt
        FROM leads
        ORDER BY datetime(created_at) DESC, id DESC
      `
    );
    return rows;
  } catch (err) {
    console.error("Failed to query leads from SQLite:", err.stack || err);
    return [];
  }
}

function getLeadsCsvContent() {
  ensureLeadsCsvFile();
  return fs.readFileSync(leadsCsvPath, "utf8");
}

module.exports = {
  recordLead,
  getLeads,
  getLeadsCsvContent,
  leadsCsvPath,
  ensureLeadsCsvFile
};
