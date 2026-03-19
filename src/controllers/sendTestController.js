const {
  sendWhatsAppMessage,
  WhatsAppApiError
} = require("../services/messageService");

async function sendTestMessage(req, res) {
  try {
    const result = await sendWhatsAppMessage(req.body);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    const statusCode =
      error instanceof WhatsAppApiError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to send WhatsApp message",
      details: error.details || null
    });
  }
}

module.exports = {
  sendTestMessage
};
