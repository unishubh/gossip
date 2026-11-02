const express = require("express");
const { getLeads, leadsCsvPath, ensureLeadsCsvFile } = require("../services/leadService");
const {
  getGoogleSheetWebhookUrl,
  setGoogleSheetWebhookUrl,
  testGoogleSheetConnection
} = require("../services/googleSheetService");
const fs = require("fs");

const router = express.Router();

// GET /leads - Return list of captured leads as JSON
router.get("/", async (req, res) => {
  try {
    const leads = await getLeads();
    return res.status(200).json({
      success: true,
      data: leads
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch leads"
    });
  }
});

// GET /leads/google-sheet - Get currently configured Google Sheet Webhook URL
router.get("/google-sheet", (req, res) => {
  const url = getGoogleSheetWebhookUrl();
  return res.status(200).json({
    success: true,
    url
  });
});

// POST /leads/google-sheet - Save Google Sheet Webhook URL
router.post("/google-sheet", (req, res) => {
  const { url } = req.body || {};
  const savedUrl = setGoogleSheetWebhookUrl(url);
  return res.status(200).json({
    success: true,
    url: savedUrl
  });
});

// POST /leads/test-google-sheet - Send a test row to Google Sheet
router.post("/test-google-sheet", async (req, res) => {
  const { url } = req.body || {};
  try {
    const result = await testGoogleSheetConnection(url);
    return res.status(200).json({
      success: true,
      message: "Row written to Google Sheet successfully!",
      details: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to connect to Google Sheet"
    });
  }
});

// GET /leads/export - Direct download of Excel-compatible CSV file
router.get("/export", (req, res) => {
  ensureLeadsCsvFile();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="whatsapp_leads.csv"');

  const fileStream = fs.createReadStream(leadsCsvPath);
  fileStream.pipe(res);
});

module.exports = router;
