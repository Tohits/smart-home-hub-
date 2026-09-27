require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('./database');
const mqttService = require('./mqttService');
const scheduler = require('./scheduler');
const webPush = require('./webPush');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'smarthome_super_secret_jwt_key_2026';

app.use(cors());
app.use(express.json());

// Initialize MQTT & Scheduler Engine
mqttService.initMqtt(io);
scheduler.initScheduler();

// JWT Verification Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // For local prototype convenience, allow request if no token supplied
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ---------------- REST API ENDPOINTS ----------------

// 1. App VAPID Public Key
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: webPush.vapidPublicKey });
});

// 2. Subscribe to Web Push
app.post('/api/push/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: 'Invalid subscription' });

  try {
    const id = Date.now().toString();
    await db.query(
      'INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(endpoint) DO NOTHING',
      [id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || '']
    );
    res.json({ success: true, message: 'Push subscription saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. User Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && (password === 'admin123' || password === 'admin')) {
    const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username: 'admin', role: 'admin' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// 4. Get Relays Status
app.get('/api/relays', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM relays ORDER BY channel ASC');
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Toggle Relay Channel
app.post('/api/relays/toggle', authenticateToken, async (req, res) => {
  const { deviceId, channel, state } = req.body;
  const stateStr = state ? 'ON' : 'OFF';

  const success = mqttService.setRelayState(deviceId || 'nodemcu_home_1', channel, stateStr);
  if (success) {
    res.json({ success: true, channel, state });
  } else {
    res.status(503).json({ error: 'MQTT Broker disconnected' });
  }
});

// 6. Update Relay Metadata (Name, Icon)
app.put('/api/relays/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, icon } = req.body;

  try {
    await db.query('UPDATE relays SET name = $1, icon = $2 WHERE id = $3', [name, icon, id]);
    res.json({ success: true, id, name, icon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Schedules
app.get('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM schedules ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Create Schedule
app.post('/api/schedules', authenticateToken, async (req, res) => {
  const { deviceId, channel, timeCron, solarEvent, action } = req.body;
  const id = 'sch_' + Date.now();
  const relayId = `${deviceId || 'nodemcu_home_1'}_ch${channel}`;

  try {
    await db.query(
      'INSERT INTO schedules (id, relay_id, device_id, channel, time_cron, solar_event, action, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, relayId, deviceId || 'nodemcu_home_1', channel, timeCron || null, solarEvent || null, action, true]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Delete Schedule
app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    await db.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. System Status & Telemetry
app.get('/api/system/status', authenticateToken, (req, res) => {
  res.json(mqttService.getDeviceState());
});

// 11. Trigger Device Restart
app.post('/api/system/restart', authenticateToken, (req, res) => {
  const { deviceId } = req.body;
  const success = mqttService.sendRestartCommand(deviceId || 'nodemcu_home_1');
  res.json({ success });
});

// 12. Dispatch WAN OTA Update
app.post('/api/system/ota', authenticateToken, (req, res) => {
  const { deviceId, url, size, sha256 } = req.body;
  if (!url) return res.status(400).json({ error: 'Firmware URL required' });

  const success = mqttService.publishOtaCommand(deviceId || 'nodemcu_home_1', { url, size: size || 0, sha256: sha256 || '' });
  res.json({ success, message: 'OTA Update broadcast dispatched over MQTT' });
});

// 13. Activity Logs
app.get('/api/logs', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- SOCKET.IO REALTIME EVENTS ----------------
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.emit('device:state', mqttService.getDeviceState());

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Smart Home Hub Backend running on 0.0.0.0:${PORT}`);
  console.log(`=================================================\n`);
});
