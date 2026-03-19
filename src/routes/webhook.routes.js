const express = require("express");
const {
  verifyWebhook,
  receiveWebhook
} = require("../controllers/webhook.controller");

const router = express.Router();

router.get("/", verifyWebhook);
router.post("/", receiveWebhook);

module.exports = router;
