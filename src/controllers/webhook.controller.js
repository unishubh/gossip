const fs = require("fs");
const path = require("path");
const { recordLead } = require("../services/leadService");
const { updateTrackedMessageStatus } = require("../services/messageTrackingService");
const { sendWhatsAppMessage } = require("../services/whatsappService");

const logsDir = path.join(process.cwd(), "logs");
const webhookLogFile = path.join(logsDir, "webhook.log");

function logWebhookEvent(data) {
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const entry = `\n--- [${new Date().toISOString()}] ---\n${JSON.stringify(data, null, 2)}\n`;
    fs.appendFileSync(webhookLogFile, entry, "utf8");
  } catch (err) {
    console.error("Failed to write to webhook.log:", err.message);
  }
}

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[webhook verify] mode=${mode} token=${verifyToken}`);

  if (
    mode === "subscribe" &&
    verifyToken &&
    verifyToken === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("✓ Webhook verification challenge accepted!");
    return res.status(200).send(challenge);
  }

  console.warn("✗ Webhook verification failed. Check WEBHOOK_VERIFY_TOKEN.");
  return res.sendStatus(403);
}

function receiveWebhook(req, res) {
  const payload = req.body;

  res.sendStatus(200);

  setImmediate(async () => {
    console.log("\n==================== WEBHOOK RECEIVED ====================");
    console.log(JSON.stringify(payload, null, 2));
    console.log("==========================================================\n");

    // Persist full payload to logs/webhook.log for easy inspection
    logWebhookEvent(payload);

    const value = payload?.entry?.[0]?.changes?.[0]?.value;

    // 1. Process Inbound Messages (Lead Capture via QR scan or direct message)
    const messages = value?.messages;
    const contacts = value?.contacts;

    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        const fromPhone = msg.from;
        const contactObj =
          contacts?.find((c) => c.wa_id === fromPhone) || contacts?.[0];
        const profileName = contactObj?.profile?.name || "WhatsApp User";
        const bodyText =
          msg.text?.body ||
          msg.button?.text ||
          (msg.type !== "text" ? `[${msg.type}]` : "");
        const timestamp = msg.timestamp
          ? new Date(Number(msg.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        console.log(
          `[inbound lead] phone=${fromPhone} name=${profileName} text="${bodyText}"`
        );

        try {
          await recordLead({
            name: profileName,
            phone: fromPhone,
            triggerMessage: bodyText,
            timestamp
          });

          // Optional Auto-reply within the 24h Customer Care window if configured
          if (process.env.AUTO_REPLY_ENABLED === "true") {
            await sendWhatsAppMessage({
              to: fromPhone,
              type: "text",
              text: {
                body: `Hello ${profileName}! Thanks for reaching out. We have logged your request: "${bodyText}".`
              }
            }).catch((err) => {
              console.log("Auto-reply skipped/failed:", err.message);
            });
          }
        } catch (error) {
          console.error("Failed to record inbound lead:", error.stack || error);
        }
      }
    }

    // 2. Process Outbound Status Updates (sent, delivered, read, failed)
    const statuses = value?.statuses;

    if (Array.isArray(statuses) && statuses.length > 0) {
      for (const statusEvent of statuses) {
        const messageId = statusEvent?.id || "unknown";
        const status = statusEvent?.status || "unknown";
        const recipientId = statusEvent?.recipient_id || "unknown";

        console.log(`[status update] message_id=${messageId} status=${status} recipient=${recipientId}`);

        if (statusEvent?.errors && statusEvent.errors.length > 0) {
          console.error(
            `\n🚨 [META DELIVERY FAILURE for ${recipientId}]:\n`,
            JSON.stringify(statusEvent.errors, null, 2)
          );
        }

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
    }
  });
}

module.exports = {
  verifyWebhook,
  receiveWebhook,
  webhookLogFile
};
