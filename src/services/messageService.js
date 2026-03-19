const {
  sendWhatsAppMessage,
  WhatsAppApiError
} = require("./whatsappService");

async function sendCampaignMessage({
  phoneNumber,
  templateName,
  languageCode,
  params
}) {
  return sendWhatsAppMessage({
    to: phoneNumber,
    type: "template",
    templateName,
    languageCode,
    components: [
      {
        type: "body",
        parameters: (params || []).map((param) => ({
          type: "text",
          text: param
        }))
      }
    ]
  });
}

module.exports = {
  sendCampaignMessage,
  sendWhatsAppMessage,
  WhatsAppApiError
};
