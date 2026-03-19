const WHATSAPP_API_VERSION = "v21.0";

class WhatsAppApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "WhatsAppApiError";
    this.statusCode = options.statusCode || 500;
    this.details = options.details || null;
  }
}

function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new WhatsAppApiError("WhatsApp API credentials are not configured", {
      statusCode: 500,
      details: {
        missing: [
          !accessToken ? "WHATSAPP_ACCESS_TOKEN" : null,
          !phoneNumberId ? "PHONE_NUMBER_ID" : null
        ].filter(Boolean)
      }
    });
  }

  return {
    accessToken,
    phoneNumberId
  };
}

function buildTemplatePayload(payload) {
  const { to, templateName, languageCode, components } = payload;

  if (!templateName || !languageCode) {
    throw new WhatsAppApiError(
      "templateName and languageCode are required for template messages",
      {
        statusCode: 400,
        details: {
          payload
        }
      }
    );
  }

  const requestBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  };

  if (Array.isArray(components) && components.length > 0) {
    requestBody.template.components = components;
  }

  return requestBody;
}

function buildTextPayload(payload) {
  const { to, text } = payload;

  if (!text || typeof text.body !== "string" || !text.body.trim()) {
    throw new WhatsAppApiError("text.body is required for text messages", {
      statusCode: 400,
      details: {
        payload
      }
    });
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      body: text.body
    }
  };
}

function buildRequestBody(payload) {
  if (!payload || typeof payload !== "object") {
    throw new WhatsAppApiError("Payload is required", {
      statusCode: 400
    });
  }

  if (!payload.to || typeof payload.to !== "string") {
    throw new WhatsAppApiError("to is required", {
      statusCode: 400,
      details: {
        payload
      }
    });
  }

  if (payload.type === "template") {
    return buildTemplatePayload(payload);
  }

  if (payload.type === "text") {
    return buildTextPayload(payload);
  }

  throw new WhatsAppApiError("Unsupported WhatsApp message type", {
    statusCode: 400,
    details: {
      supportedTypes: ["template", "text"],
      payload
    }
  });
}

async function parseApiResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function sendWhatsAppMessage(payload) {
  const { accessToken, phoneNumberId } = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  const requestBody = buildRequestBody(payload);

  console.log("WhatsApp API request:", requestBody);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    console.error("WhatsApp API transport error:", error.message);
    throw new WhatsAppApiError("Failed to reach WhatsApp API", {
      statusCode: 502,
      details: {
        cause: error.message
      }
    });
  }

  const data = await parseApiResponse(response);
  const result = {
    success: response.ok,
    statusCode: response.status,
    data
  };

  console.log("WhatsApp API response:", result);

  if (!response.ok) {
    const apiMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "WhatsApp API request failed";

    console.error("WhatsApp API error:", {
      statusCode: response.status,
      message: apiMessage,
      details: data
    });

    throw new WhatsAppApiError(apiMessage, {
      statusCode: response.status,
      details: data
    });
  }

  return result;
}

module.exports = {
  sendWhatsAppMessage,
  WhatsAppApiError
};
