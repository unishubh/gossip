const {
  getCampaignById,
  incrementCampaignFailed,
  incrementCampaignSent,
  setCampaignStatus
} = require("./campaignService");
const { logMessageResult } = require("./logService");
const { registerTrackedMessage } = require("./messageTrackingService");
const { sendCampaignMessage } = require("./messageService");
const { sleep } = require("../utils/time");

const RETRY_LIMIT = 2;
const MESSAGE_DELAY_MS = 2000;

const queue = [];
let processing = false;

function enqueueCampaignMessages({ campaignId, templateName, languageCode, rows }) {
  for (const row of rows) {
    queue.push({
      campaignId,
      phoneNumber: row.phone,
      templateName,
      languageCode,
      params: row.params,
      attempt: 0
    });
  }

  console.log(
    `[campaign ${campaignId}] queued ${rows.length} template message(s) for processing`
  );

  processQueue().catch((error) => {
    console.error("Queue processor failed:", error.stack || error);
  });
}

async function processQueue() {
  if (processing) {
    return;
  }

  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    await setCampaignStatus(item.campaignId, "processing");

    try {
      const response = await sendCampaignMessage({
        phoneNumber: item.phoneNumber,
        templateName: item.templateName,
        languageCode: item.languageCode,
        params: item.params
      });
      const messageId = response?.data?.messages?.[0]?.id || null;

      await registerTrackedMessage({
        messageId,
        campaignId: item.campaignId,
        recipientId: item.phoneNumber,
        retryCount: item.attempt
      });

      await incrementCampaignSent(item.campaignId);
      await logMessageResult({
        campaignId: item.campaignId,
        phoneNumber: item.phoneNumber,
        status: "success",
        attempt: item.attempt + 1,
        messageId,
        templateName: item.templateName,
        languageCode: item.languageCode,
        params: item.params,
        response
      });

      console.log(
        `[campaign ${item.campaignId}] message sent phone=${item.phoneNumber} message_id=${messageId || "unknown"} attempt=${item.attempt + 1}`
      );
    } catch (error) {
      if (item.attempt < RETRY_LIMIT) {
        const nextAttempt = item.attempt + 1;

        queue.push({
          ...item,
          attempt: nextAttempt
        });

        await logMessageResult({
          campaignId: item.campaignId,
          phoneNumber: item.phoneNumber,
          status: "retry",
          attempt: nextAttempt,
          templateName: item.templateName,
          languageCode: item.languageCode,
          params: item.params,
          error: error.message,
          details: error.details || null
        });

        console.log(
          `[campaign ${item.campaignId}] retry ${nextAttempt}/${RETRY_LIMIT} scheduled for ${item.phoneNumber}`
        );
      } else {
        await incrementCampaignFailed(item.campaignId);
        await logMessageResult({
          campaignId: item.campaignId,
          phoneNumber: item.phoneNumber,
          status: "failed",
          attempt: item.attempt + 1,
          templateName: item.templateName,
          languageCode: item.languageCode,
          params: item.params,
          error: error.message,
          details: error.details || null
        });

        console.log(
          `[campaign ${item.campaignId}] failed for ${item.phoneNumber} after ${
            item.attempt + 1
          } attempt(s)`
        );
      }

      console.error(
        `[campaign ${item.campaignId}] send error for ${item.phoneNumber}:`,
        error.stack || error
      );
    }

    const campaign = await getCampaignById(item.campaignId);

    if (campaign) {
      console.log(
        `[campaign ${item.campaignId}] progress sent=${campaign.sent}, delivered=${campaign.delivered}, failed=${campaign.failed}, total=${campaign.total}`
      );
    }

    if (queue.length > 0) {
      await sleep(MESSAGE_DELAY_MS);
    }
  }

  processing = false;

  if (queue.length > 0) {
    processQueue().catch((error) => {
      console.error("Queue processor failed:", error.stack || error);
    });
  }
}

module.exports = {
  enqueueCampaignMessages
};
