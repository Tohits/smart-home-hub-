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
        if (s.includes('UPDATE RELAYS SET STATE')) {
          const stateVal = Boolean(params[0]);
          const devIdVal = params[1];
          const chanVal = parseInt(params[2], 10);
          const found = inMemoryRelays.find(r => r.channel === chanVal);
          if (found) found.state = stateVal;
          return { rowCount: 1 };
        }
        if (s.includes('UPDATE RELAYS SET NAME')) {
          const nameVal = params[0];
          const iconVal = params[1];
          const targetId = params[2];
          const chanNum = parseInt(targetId, 10);
          const found = inMemoryRelays.find(r => r.id === targetId || r.channel === chanNum || r.channel == params[3]);
          if (found) {
            found.name = nameVal;
            found.icon = iconVal;
          }
          return { rowCount: 1 };
        }
        if (s.includes('INSERT INTO SCHEDULES')) {
          const newSched = {
            id: params[0],
            relay_id: params[1],
            device_id: params[2],
            channel: params[3],
            time_cron: params[4],
            solar_event: params[5],
            action: params[6],
            enabled: params[7],
            repeat_daily: params[8] !== undefined ? Boolean(params[8]) : true
          };
          inMemorySchedules.unshift(newSched);
          return { rowCount: 1 };
        }
        if (s.includes('UPDATE SCHEDULES SET ENABLED')) {
          const targetId = params[1];
          const found = inMemorySchedules.find(sc => sc.id === targetId);
          if (found) found.enabled = Boolean(params[0]);
          return { rowCount: 1 };
        }
        if (s.includes('UPDATE SCHEDULES SET RELAY_ID')) {
          const targetId = params[6];
          const found = inMemorySchedules.find(sc => sc.id === targetId);
          if (found) {
            found.relay_id = params[0];
            found.channel = params[1];
            found.time_cron = params[2];
            found.solar_event = params[3];
            found.action = params[4];
            found.repeat_daily = params[5];
          }
          return { rowCount: 1 };
        }
        if (s.includes('DELETE FROM SCHEDULES')) {
          const targetId = params[0];
          const idx = inMemorySchedules.findIndex(sc => sc.id === targetId);
          if (idx !== -1) inMemorySchedules.splice(idx, 1);
          return { rowCount: 1 };
        }
        if (s.includes('PUSH_SUBSCRIPTIONS')) {
          if (params && params.length >= 4) {
            const found = inMemorySubs.find(sub => sub.endpoint === params[1]);
            if (!found) {
              inMemorySubs.push({ id: params[0], endpoint: params[1], p256dh: params[2], auth: params[3] });
            }
          }
          return { rowCount: 1 };
        }
        if (s.includes('INSERT INTO ACTIVITY_LOGS')) {
          inMemoryLogs.unshift({
            id: params[0],
            event_type: params[1],
            details: params[2],
            source: params[3] || 'system',
            created_at: new Date().toISOString()
          });
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
      exec: async () => {}
    };
  }
}

const subsFilePath = path.join(__dirname, 'push_subscriptions.json');

function getPushSubscriptionsBackup() {
  if (fs.existsSync(subsFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(subsFilePath, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

function addPushSubscriptionBackup(subObj) {
  try {
    const list = getPushSubscriptionsBackup();
    if (!list.some(s => s.endpoint === subObj.endpoint)) {
      list.push(subObj);
      fs.writeFileSync(subsFilePath, JSON.stringify(list, null, 2));
    }
  } catch (e) {}
}

function removePushSubscriptionBackup(endpoint) {
  try {
    const list = getPushSubscriptionsBackup();
    const filtered = list.filter(s => s.endpoint !== endpoint);
    fs.writeFileSync(subsFilePath, JSON.stringify(filtered, null, 2));
  } catch (e) {}
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
  isPostgres,
  getPushSubscriptionsBackup,
  addPushSubscriptionBackup,
  removePushSubscriptionBackup
};
