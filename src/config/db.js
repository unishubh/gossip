const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const databasePath = path.join(process.cwd(), "gossip.db");

const db = new sqlite3.Database(databasePath, (error) => {
  if (error) {
    console.error("SQLite connection error:", error.message);
    return;
  }

  console.log(`SQLite connected: ${databasePath}`);
});

db.run("PRAGMA foreign_keys = ON", (error) => {
  if (error) {
    console.error("SQLite pragma error:", error.message);
  }
});

module.exports = db;
