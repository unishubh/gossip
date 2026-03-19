const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "gossip.db");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory);
}

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

console.log(`SQLite connected: ${databasePath}`);

module.exports = db;
