require("dotenv").config();

const app = require("./app");
const { initDatabase } = require("./services/dbService");

const port = process.env.PORT || 3000;

initDatabase()
  .catch((error) => {
    console.error("Database startup error:", error.message);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  });
