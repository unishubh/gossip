const db = require("../config/db");

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function onRun(error) {
      if (error) {
        console.error("SQLite run error:", error.message, { query, params });
        reject(error);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (error, row) => {
      if (error) {
        console.error("SQLite get error:", error.message, { query, params });
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

async function initDatabase() {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        template_name TEXT,
        status TEXT,
        total INTEGER,
        queued INTEGER DEFAULT 0,
        sent INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        phone TEXT,
        status TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS message_status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT,
        status TEXT,
        recipient_id TEXT,
        raw_payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id)
      )
    `);

    await ensureColumnExists("campaigns", "queued", "INTEGER DEFAULT 0");
  } catch (error) {
    console.error("Database initialization error:", error.message);
  }
}

async function ensureColumnExists(tableName, columnName, definition) {
  try {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);

    if (!exists) {
      await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (error) {
    console.error("SQLite schema check error:", error.message, {
      tableName,
      columnName
    });
  }
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (error, rows) => {
      if (error) {
        console.error("SQLite all error:", error.message, { query, params });
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

module.exports = {
  run,
  get,
  all,
  initDatabase
};
