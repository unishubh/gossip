const { updateTrackedMessageStatus } = require("../services/messageTrackingService");

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    verifyToken &&
    verifyToken === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

function receiveWebhook(req, res) {
  const payload = req.body;

  res.sendStatus(200);

  setImmediate(async () => {
    console.log("Webhook received");
    console.log(JSON.stringify(payload, null, 2));

    const statuses =
      payload?.entry?.[0]?.changes?.[0]?.value?.statuses;

    if (!Array.isArray(statuses) || statuses.length === 0) {
      return;
    }

    for (const statusEvent of statuses) {
      const messageId = statusEvent?.id || "unknown";
      const status = statusEvent?.status || "unknown";
      const recipientId = statusEvent?.recipient_id || "unknown";

      console.log(`Message ID: ${messageId}`);
      console.log(`Status: ${status}`);
      console.log(`Recipient: ${recipientId}`);

      try {
        const trackedMessage = await updateTrackedMessageStatus({
          messageId,
          status,
          recipientId,
          rawStatusEvent: statusEvent
        });

        if (trackedMessage) {
          console.log(
            `[campaign ${trackedMessage.campaign_id}] webhook status ${status} for ${recipientId}`
          );
        }
      } catch (error) {
        console.error("Webhook status update error:", error.stack || error);
      }
    }
  });
}

module.exports = {
  verifyWebhook,
  receiveWebhook
};
