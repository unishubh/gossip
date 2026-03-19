const {
  incrementCampaignDelivered,
  incrementCampaignFailed
} = require("./campaignService");
const { all, get, run } = require("./dbService");

const finalStatuses = new Set(["delivered", "read", "failed"]);

async function registerTrackedMessage({
  messageId,
  campaignId,
  recipientId,
  retryCount = 0
}) {
  if (!messageId) {
    return null;
  }

  try {
    await run(
      `
        INSERT OR REPLACE INTO messages (id, campaign_id, phone, status, retry_count)
        VALUES (?, ?, ?, 'sent', ?)
      `,
      [messageId, campaignId, recipientId, retryCount]
    );

    return getTrackedMessageById(messageId);
  } catch (error) {
    console.error("Failed to register tracked message:", error.message);
    return null;
  }
}

async function getTrackedMessageById(messageId) {
  try {
    return await get(
      `
        SELECT id, campaign_id, phone, status, retry_count, created_at
        FROM messages
        WHERE id = ?
      `,
      [messageId]
    );
  } catch (error) {
    console.error("Failed to load tracked message:", error.message);
    return null;
  }
}

async function updateTrackedMessageStatus({
  messageId,
  status,
  recipientId,
  rawStatusEvent
}) {
  const trackedMessage = await getTrackedMessageById(messageId);

  if (!trackedMessage) {
    return null;
  }

  try {
    await run(
      `
        INSERT INTO message_status_events (message_id, status, recipient_id, raw_payload)
        VALUES (?, ?, ?, ?)
      `,
      [messageId, status, recipientId, JSON.stringify(rawStatusEvent || null)]
    );

    await run(
      `
        UPDATE messages
        SET status = ?,
            phone = COALESCE(?, phone)
        WHERE id = ?
      `,
      [status, recipientId, messageId]
    );

    if (!finalStatuses.has(trackedMessage.status)) {
      if (status === "delivered" || status === "read") {
        await incrementCampaignDelivered(trackedMessage.campaign_id);
      } else if (status === "failed") {
        await incrementCampaignFailed(trackedMessage.campaign_id);
      }
    }

    return getTrackedMessageById(messageId);
  } catch (error) {
    console.error("Failed to update tracked message status:", error.message);
    return null;
  }
}

module.exports = {
  registerTrackedMessage,
  updateTrackedMessageStatus,
  getTrackedMessageById,
  getMessageStatusEvents
};

async function getMessageStatusEvents(messageId) {
  try {
    return await all(
      `
        SELECT id, message_id, status, recipient_id, raw_payload, created_at
        FROM message_status_events
        WHERE message_id = ?
        ORDER BY created_at ASC, id ASC
      `,
      [messageId]
    );
  } catch (error) {
    console.error("Failed to load message status events:", error.message);
    return [];
  }
}
