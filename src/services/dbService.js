const db = require("../config/db");

function run(query, params = []) {
  try {
    const result = db.prepare(query).run(params);

    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes
    };
  } catch (error) {
    console.error("SQLite run error:", error.stack || error, { query, params });
    throw error;
  }
}

function get(query, params = []) {
  try {
    return db.prepare(query).get(params) || null;
  } catch (error) {
    console.error("SQLite get error:", error.stack || error, { query, params });
    throw error;
  }
}

function all(query, params = []) {
  try {
    return db.prepare(query).all(params) || [];
  } catch (error) {
    console.error("SQLite all error:", error.stack || error, { query, params });
    throw error;
  }
}

function initDatabase() {
  try {
    db.exec(`
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
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        phone TEXT,
        status TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      );

      CREATE TABLE IF NOT EXISTS message_status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT,
        status TEXT,
        recipient_id TEXT,
        raw_payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id)
      );
    `);

    ensureColumnExists("campaigns", "queued", "INTEGER DEFAULT 0");
  } catch (error) {
    console.error("Database initialization error:", error.stack || error);
  }
}

function ensureColumnExists(tableName, columnName, definition) {
  try {
    const columns = all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);

    if (!exists) {
      run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (error) {
    console.error("SQLite schema check error:", error.stack || error, {
      tableName,
      columnName
    });
  }
}

module.exports = {
  run,
  get,
  all,
  initDatabase
};
