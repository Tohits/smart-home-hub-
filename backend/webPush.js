const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const keysFilePath = path.join(__dirname, 'vapid_keys.json');

function isValidVapidPublicKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length !== 87) return false;
  if (key.includes('+') || key.includes('/') || key.includes('=')) return false;
  if (!key.startsWith('B')) return false;
  return true;
}

function getValidVapidKeys() {
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;

  // 1. Check if Render env vars are valid 87-char keys
  if (isValidVapidPublicKey(envPublic) && envPrivate && envPrivate.length >= 40) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  // 2. Check persistent disk file
  if (fs.existsSync(keysFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
      if (isValidVapidPublicKey(data.publicKey) && data.privateKey) {
        return data;
      }
    } catch (e) {}
  }

  // 3. Generate fresh valid P-256 VAPID keypair
  console.log('[WebPush] Generating fresh 87-char valid VAPID keypair...');
  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(keysFilePath, JSON.stringify(keys, null, 2));
    console.log('[WebPush] Saved valid VAPID keypair to vapid_keys.json');
  } catch (e) {
    console.warn('[WebPush] Notice writing vapid_keys.json:', e.message);
  }
  return keys;
}

const activeKeys = getValidVapidKeys();
const vapidPublic = activeKeys.publicKey;
const vapidPrivate = activeKeys.privateKey;

try {
  webpush.setVapidDetails(
    'mailto:admin@smarthomehub.local',
    vapidPublic,
    vapidPrivate
  );
  console.log('[WebPush] VAPID active public key (87 chars, starts with B):', vapidPublic);
} catch (err) {
  console.error('[WebPush] VAPID configuration notice:', err.message);
}

async function sendNotificationToAll(title, body, icon = '/assets/icon-192.png', quietHoursAllowed = false) {
  const now = new Date();
  const currentHour = now.getHours();
  if (!quietHoursAllowed && (currentHour >= 23 || currentHour < 6)) {
    console.log('[WebPush] Skipping push notification during Quiet Hours');
    return;
  }

  try {
    const res = await db.query('SELECT * FROM push_subscriptions');
    const subscriptions = res.rows || [];

    const payload = JSON.stringify({ title, body, icon, timestamp: Date.now() });

    console.log(`[WebPush] Dispatching notification "${title}" to ${subscriptions.length} subscribers...`);

    const sendPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      return webpush.sendNotification(pushSubscription, payload).catch(err => {
        console.warn(`[WebPush] Push result status: ${err.statusCode || err.message}`);
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        }
      });
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error('[WebPush] Error fetching subscriptions:', err.message);
  }
}

module.exports = {
  vapidPublicKey: vapidPublic,
  sendNotificationToAll
};
