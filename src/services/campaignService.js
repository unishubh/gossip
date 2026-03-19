const { randomUUID } = require("crypto");
const { all, get, run } = require("./dbService");

function mapCampaignRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    templateName: row.template_name,
    status: row.status,
    total: row.total,
    queued: row.queued,
    sent: row.sent,
    delivered: row.delivered,
    failed: row.failed,
    success: row.sent,
    createdAt: row.created_at
  };
}

async function createCampaign({
  templateName,
  total,
  queued = total,
  status = "processing"
}) {
  const id = randomUUID();

  try {
    await run(
      `
        INSERT INTO campaigns (id, template_name, status, total, queued, sent, delivered, failed)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0)
      `,
      [id, templateName, status, total, queued]
    );

    return getCampaignById(id);
  } catch (error) {
    console.error("Failed to create campaign:", error.stack || error);
    throw error;
  }
}

async function getCampaignById(id) {
  try {
    const row = await get(
      `
        SELECT id, template_name, status, total, queued, sent, delivered, failed, created_at
        FROM campaigns
        WHERE id = ?
      `,
      [id]
    );

    return mapCampaignRow(row);
  } catch (error) {
    console.error("Failed to load campaign:", error.stack || error);
    return null;
  }
}

async function listCampaigns() {
  try {
    const rows = await all(
      `
        SELECT id, template_name, status, total, queued, sent, delivered, failed, created_at
        FROM campaigns
        ORDER BY datetime(created_at) DESC, id DESC
      `
    );

    return rows.map(mapCampaignRow);
  } catch (error) {
    console.error("Failed to list campaigns:", error.stack || error);
    return [];
  }
}

async function setCampaignStatus(id, status) {
  try {
    await run(
      `
        UPDATE campaigns
        SET status = ?
        WHERE id = ?
      `,
      [status, id]
    );
    console.log(`[campaign ${id}] DB update status=${status}`);
  } catch (error) {
    console.error("Failed to update campaign status:", error.stack || error);
  }
}

async function incrementCampaignSent(id) {
  try {
    await run(
      `
        UPDATE campaigns
        SET sent = sent + 1,
            status = 'processing'
        WHERE id = ?
      `,
      [id]
    );
    console.log(`[campaign ${id}] DB update sent=sent+1`);
  } catch (error) {
    console.error("Failed to increment campaign sent count:", error.stack || error);
  }
}

async function incrementCampaignFailed(id) {
  try {
    await run(
      `
        UPDATE campaigns
        SET failed = failed + 1
        WHERE id = ?
      `,
      [id]
    );
    console.log(`[campaign ${id}] DB update failed=failed+1`);

    await updateCampaignCompletion(id);
  } catch (error) {
    console.error("Failed to increment campaign failed count:", error.stack || error);
  }
}

async function incrementCampaignDelivered(id) {
  try {
    await run(
      `
        UPDATE campaigns
        SET delivered = delivered + 1
        WHERE id = ?
      `,
      [id]
    );
    console.log(`[campaign ${id}] DB update delivered=delivered+1`);

    await updateCampaignCompletion(id);
  } catch (error) {
    console.error("Failed to increment campaign delivered count:", error.stack || error);
  }
}

async function updateCampaignCompletion(id) {
  const campaign = await getCampaignById(id);

  if (!campaign) {
    return;
  }

  if (campaign.delivered + campaign.failed >= campaign.total) {
    await setCampaignStatus(id, "completed");
  }
}

module.exports = {
  createCampaign,
  getCampaignById,
  listCampaigns,
  setCampaignStatus,
  incrementCampaignSent,
  incrementCampaignDelivered,
  incrementCampaignFailed
};
