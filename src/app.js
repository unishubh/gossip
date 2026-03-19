require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const campaignRouter = require("./routes/campaign");
const sendTestRouter = require("./routes/sendTest");
const webhookRouter = require("./routes/webhook.routes");

const app = express();
const frontendDistPath = path.join(process.cwd(), "frontend", "dist");
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("Server running");
});

app.use("/campaign", campaignRouter);
app.use("/send-test", sendTestRouter);
app.use("/webhook", webhookRouter);

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get("*", (req, res, next) => {
    if (
      req.path === "/" ||
      req.path.startsWith("/campaign") ||
      req.path.startsWith("/send-test") ||
      req.path.startsWith("/webhook")
    ) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

module.exports = app;
