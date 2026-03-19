const express = require("express");
const {
  createCampaignFromUpload,
  getCampaignStatus,
  listCampaignsHandler
} = require("../controllers/campaignController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.post("/", upload.single("file"), createCampaignFromUpload);
router.get("/", listCampaignsHandler);
router.get("/:id", getCampaignStatus);

module.exports = router;
