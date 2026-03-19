const { readFile } = require("fs/promises");

const {
  createCampaign,
  getCampaignById,
  listCampaigns,
  incrementCampaignFailed,
  setCampaignStatus
} = require("../services/campaignService");
const { logMessageResult } = require("../services/logService");
const { enqueueCampaignMessages } = require("../services/queueService");
const { parseCampaignCsvFile } = require("../utils/csv.parser");

async function createCampaignFromUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "CSV file is required"
    });
  }

  const templateName =
    typeof req.body.templateName === "string" ? req.body.templateName.trim() : "";
  const languageCode =
    typeof req.body.languageCode === "string" && req.body.languageCode.trim()
      ? req.body.languageCode.trim()
      : "en_US";

  if (!templateName) {
    return res.status(400).json({
      success: false,
      error: "templateName is required"
    });
  }

  try {
    const fileContent = await readFile(req.file.path, "utf8");
    const { total, validRows, invalidRows } = parseCampaignCsvFile(
      fileContent
    );

    if (total === 0) {
      return res.status(400).json({
        success: false,
        error: "CSV file has no data rows"
      });
    }

    const campaign = await createCampaign({
      templateName,
      total,
      queued: validRows.length,
      status: "processing"
    });

    for (const invalidMessage of invalidRows) {
      await incrementCampaignFailed(campaign.id);
      await logMessageResult({
        campaignId: campaign.id,
        phoneNumber: invalidMessage.phone,
        status: "invalid",
        templateName,
        languageCode,
        params: invalidMessage.params,
        reason: invalidMessage.reason,
        row: invalidMessage.row
      });
    }

    if (validRows.length > 0) {
      enqueueCampaignMessages({
        campaignId: campaign.id,
        templateName,
        languageCode,
        rows: validRows
      });
    } else {
      await setCampaignStatus(campaign.id, "completed");
      console.log(`[campaign ${campaign.id}] no valid messages to process`);
    }

    return res.status(202).json({
      campaignId: campaign.id,
      status: "started"
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to parse CSV"
    });
  }
}

async function getCampaignStatus(req, res) {
  const campaign = await getCampaignById(req.params.id);

  if (!campaign) {
    return res.status(404).json({
      success: false,
      error: "Campaign not found"
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      id: campaign.id,
      templateName: campaign.templateName,
      total: campaign.total,
      queued: campaign.queued,
      sent: campaign.sent,
      success: campaign.success,
      delivered: campaign.delivered,
      failed: campaign.failed,
      status: campaign.status
    }
  });
}

async function listCampaignsHandler(req, res) {
  const campaigns = await listCampaigns();

  return res.status(200).json({
    success: true,
    data: campaigns.map((campaign) => ({
      id: campaign.id,
      templateName: campaign.templateName,
      total: campaign.total,
      queued: campaign.queued,
      sent: campaign.sent,
      delivered: campaign.delivered,
      failed: campaign.failed,
      status: campaign.status,
      createdAt: campaign.createdAt
    }))
  });
}

module.exports = {
  createCampaignFromUpload,
  getCampaignStatus,
  listCampaignsHandler
};
