const path = require('path');
const fs = require('fs');

let dbClient = null;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  isPostgres = true;
  const { Pool } = require('pg');
  dbClient = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('[Database] Connecting to PostgreSQL instance...');
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'smarthome.db');
  const db = new sqlite3.Database(dbPath);
  console.log(`[Database] Using local SQLite database at: ${dbPath}`);

  // Promisify SQLite methods for unified API
  dbClient = {
    query: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) {
          db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows });
          });
        } else {
          db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ rows: [], rowCount: this.changes });
          });
        }
      });
    },
    exec: (sql) => {
      return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
}

async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      if (isPostgres) {
        await dbClient.query(schemaSql);
      } else {
        await dbClient.exec(schemaSql);
      }
      console.log('[Database] Schema verified and initialized.');
    }
  } catch (err) {
    console.error('[Database] Schema initialization warning:', err.message);
  }
}

initDatabase();

module.exports = {
  query: (text, params) => dbClient.query(text, params),
  isPostgres
};
