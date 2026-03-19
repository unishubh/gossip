const { appendFile, mkdir } = require("fs/promises");
const path = require("path");

const logDirectory = path.join(process.cwd(), "logs");
const logFilePath = path.join(logDirectory, "campaign.log");

async function logMessageResult(entry) {
  await mkdir(logDirectory, { recursive: true });

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  });

  await appendFile(logFilePath, `${line}\n`, "utf8");
}

module.exports = {
  logMessageResult,
  logFilePath
};
