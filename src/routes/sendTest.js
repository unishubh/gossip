const express = require("express");
const { sendTestMessage } = require("../controllers/sendTestController");

const router = express.Router();

router.post("/", sendTestMessage);

module.exports = router;
