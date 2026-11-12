const mqtt = require('mqtt');
const db = require('./database');
const webPush = require('./webPush');

let ioInstance = null;
let mqttClient = null;

const MQTT_HOST = process.env.MQTT_HOST || '93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '8883', 10);
const MQTT_USER = process.env.MQTT_USER || 'tohits';
const MQTT_PASS = process.env.MQTT_PASS || '';

const deviceState = {
  status: 'offline',
  telemetry: {},
  relays: {}
};

const offlineAlertTimers = {};

function initMqtt(io) {
  ioInstance = io;

  const protocol = MQTT_PORT === 8883 ? 'mqtts' : 'mqtt';
  const brokerUrl = `${protocol}://${MQTT_HOST}:${MQTT_PORT}`;

  console.log(`[MQTT] Connecting to HiveMQ Broker: ${brokerUrl}...`);

  mqttClient = mqtt.connect(brokerUrl, {
    username: MQTT_USER,
    password: MQTT_PASS,
    rejectUnauthorized: false, // TLS compatibility
    reconnectPeriod: 5000
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected successfully to HiveMQ Cloud TLS!');
    mqttClient.subscribe('home/+/status');
    mqttClient.subscribe('home/+/telemetry');
    mqttClient.subscribe('home/+/relay/+/state');
    mqttClient.subscribe('home/+/ota/status');
  });

  mqttClient.on('message', async (topic, payload) => {
    const message = payload.toString();
    const parts = topic.split('/');

    if (parts.length >= 3 && parts[0] === 'home') {
      const deviceId = parts[1];
      const subType = parts[2];

      if (subType === 'status') {
        const prevStatus = deviceState.status;
        const normalizedMsg = message.toLowerCase();

        // Ignore duplicate identical offline messages
        if (prevStatus === normalizedMsg && normalizedMsg === 'offline') {
          return;
        }

        deviceState.status = normalizedMsg;
        if (ioInstance) ioInstance.emit('device:status', { deviceId, status: normalizedMsg });

        if (prevStatus !== normalizedMsg) {
          await db.query(
            'INSERT INTO activity_logs (id, event_type, details, source, created_at) VALUES ($1, $2, $3, $4, $5)',
            [Date.now().toString(), 'DEVICE_STATUS', `Device ${deviceId} is ${normalizedMsg.toUpperCase()}`, 'mqtt', new Date().toISOString()]
          );
        }

        if (normalizedMsg === 'online') {
          // Cancel any pending offline alert timer if device reconnected quickly
          if (offlineAlertTimers[deviceId]) {
            clearTimeout(offlineAlertTimers[deviceId]);
            delete offlineAlertTimers[deviceId];
            console.log(`[MQTT] Device ${deviceId} reconnected. Cancelled offline alert timer.`);
          }
        } else if (normalizedMsg === 'offline') {
          if (offlineAlertTimers[deviceId]) {
            clearTimeout(offlineAlertTimers[deviceId]);
          }

          // 15-second grace period before dispatching offline push alert
          offlineAlertTimers[deviceId] = setTimeout(() => {
            if (deviceState.status === 'offline') {
              console.log(`[MQTT] Device ${deviceId} remained offline for 15s. Sending push alert...`);
              webPush.sendNotificationToAll(
                '⚠️ Smart Home Alert',
                `NodeMCU device (${deviceId}) went offline!`,
                '/assets/icon-192.png',
                true
              );
            }
            delete offlineAlertTimers[deviceId];
          }, 15000);
        }
      } else if (subType === 'telemetry') {
        try {
          const telemetryData = JSON.parse(message);
          deviceState.telemetry = telemetryData;
          if (ioInstance) ioInstance.emit('device:telemetry', telemetryData);
        } catch (e) {
          console.error('[MQTT] Telemetry parse error:', e.message);
        }
      } else if (subType === 'relay' && parts[4] === 'state') {
        const channel = parseInt(parts[3], 10);
        const stateBool = (message.toUpperCase() === 'ON');
        const prevState = deviceState.relays[channel];
        deviceState.relays[channel] = stateBool;

        // Sync with DB
        const relayId = `${deviceId}_ch${channel}`;
        await db.query(
          'UPDATE relays SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE device_id = $2 AND channel = $3',
          [stateBool, deviceId, channel]
        );

        if (ioInstance) {
          ioInstance.emit('relay:update', { deviceId, channel, state: stateBool });
        }

        // Send VAPID Web Push Notification on Relay State Change
        if (prevState !== undefined && prevState !== stateBool) {
          try {
            const relayRes = await db.query('SELECT name FROM relays WHERE device_id = $1 AND channel = $2', [deviceId, channel]);
            const relayName = (relayRes.rows && relayRes.rows[0]) ? relayRes.rows[0].name : `Relay Channel ${channel}`;
            const actionText = stateBool ? 'turned ON 🟢' : 'turned OFF 🔴';

            webPush.sendNotificationToAll(
              '⚡ Smart Home Hub Alert',
              `${relayName} (Ch ${channel}) ${actionText}`,
              '/assets/icon-192.png',
              true
            );
          } catch (e) {
            console.error('[WebPush] Relay notification error:', e.message);
          }
        }
      } else if (subType === 'ota' && parts[3] === 'status') {
        if (ioInstance) ioInstance.emit('ota:status', { deviceId, status: message });
      }
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });
}

function setRelayState(deviceId, channel, stateStr) {
  if (mqttClient && mqttClient.connected) {
    const topic = `home/${deviceId}/relay/${channel}/set`;
    mqttClient.publish(topic, stateStr.toUpperCase(), { qos: 1 });
    console.log(`[MQTT] Published ${stateStr} to ${topic}`);
    return true;
  }
  return false;
}

function sendRestartCommand(deviceId) {
  if (mqttClient && mqttClient.connected) {
    const topic = `home/${deviceId}/restart`;
    mqttClient.publish(topic, 'RESTART', { qos: 1 });
    return true;
  }
  return false;
}

function publishOtaCommand(deviceId, otaPayload) {
  if (mqttClient && mqttClient.connected) {
    const topic = `home/${deviceId}/update`;
    mqttClient.publish(topic, JSON.stringify(otaPayload), { qos: 1 });
    return true;
  }
  return false;
}

module.exports = {
  initMqtt,
  setRelayState,
  sendRestartCommand,
  publishOtaCommand,
  getDeviceState: () => deviceState
};
