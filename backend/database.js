const path = require('path');
const fs = require('fs');

let dbClient = null;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  isPostgres = true;
  try {
    const { Pool } = require('pg');
    dbClient = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    console.log('[Database] Connected to PostgreSQL via DATABASE_URL.');
  } catch (e) {
    console.error('[Database] PostgreSQL connection error:', e.message);
  }
}

if (!dbClient) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'smarthome.db');
    const db = new sqlite3.Database(dbPath);
    console.log(`[Database] Using SQLite at: ${dbPath}`);

    dbClient = {
      query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          const trimmed = sql.trim().toUpperCase();
          if (trimmed.startsWith('SELECT')) {
            db.all(sql, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows: rows || [] });
            });
          } else {
            db.run(sql, params, function (err) {
              if (err) reject(err);
              else resolve({ rows: [], rowCount: this ? this.changes : 0 });
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
  } catch (err) {
    console.warn('[Database] SQLite unavailable, using in-memory store fallback:', err.message);
    const inMemoryRelays = [
      { id: 'nodemcu_home_1_ch1', device_id: 'nodemcu_home_1', channel: 1, name: 'Main Light', state: false, icon: 'lightbulb' },
      { id: 'nodemcu_home_1_ch2', device_id: 'nodemcu_home_1', channel: 2, name: 'Ceiling Fan', state: false, icon: 'fan' },
      { id: 'nodemcu_home_1_ch3', device_id: 'nodemcu_home_1', channel: 3, name: 'AC Unit', state: false, icon: 'wind' },
      { id: 'nodemcu_home_1_ch4', device_id: 'nodemcu_home_1', channel: 4, name: 'Night Lamp', state: false, icon: 'moon' }
    ];
    const inMemorySchedules = [];
    const inMemoryLogs = [];
    const inMemorySubs = [];

    dbClient = {
      query: async (sql, params = []) => {
        const s = sql.trim().toUpperCase();
        if (s.includes('SELECT * FROM RELAYS')) return { rows: inMemoryRelays };
        if (s.includes('SELECT * FROM SCHEDULES')) return { rows: inMemorySchedules };
        if (s.includes('SELECT * FROM ACTIVITY_LOGS')) return { rows: inMemoryLogs };
        if (s.includes('SELECT * FROM PUSH_SUBSCRIPTIONS')) return { rows: inMemorySubs };
        return { rows: [] };
      },
      exec: async () => {}
    };
  }
}

async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath) && dbClient.exec) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      if (isPostgres) {
        await dbClient.query(schemaSql);
      } else {
        await dbClient.exec(schemaSql);
      }
      console.log('[Database] Schema initialized successfully.');
    }
  } catch (err) {
    console.warn('[Database] Schema notice:', err.message);
  }
}

initDatabase();

module.exports = {
  query: (text, params) => dbClient.query(text, params),
  isPostgres
};
