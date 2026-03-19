require("dotenv").config();

const app = require("./app");
const { initDatabase } = require("./services/dbService");

const PORT = process.env.PORT || 3000;
const requiredEnvVars = [
  "WHATSAPP_ACCESS_TOKEN",
  "PHONE_NUMBER_ID",
  "WEBHOOK_VERIFY_TOKEN"
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.warn(
    `Startup warning: missing environment variables: ${missingEnvVars.join(", ")}`
  );
}

initDatabase();

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
